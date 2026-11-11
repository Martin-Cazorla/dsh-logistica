// dsh-logistica/src/routes/services/routes.service.ts

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  OrderStatus,
  Prisma,
  RouteStatus,
  RouteStopStatus,
  UserRole,
} from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction, AuditEntity } from '../../audit/audit.actions';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { isSupervisor } from '../../auth/permissions';
import {
  CancelRouteDto,
  CreateRouteDto,
  DeliveryCheckDto,
  ListRoutesQueryDto,
  LoadCheckDto,
  ReorderStopsDto,
} from '../dto/create-route.dto';

type Tx = Prisma.TransactionClient;

/** Pedidos que pueden consolidarse (Punto de Control 1 es opcional). */
const DISPATCHABLE: OrderStatus[] = [
  OrderStatus.PICKED,
  OrderStatus.CHECKED,
  OrderStatus.RETURNED,
];

const ACTIVE_ROUTE: RouteStatus[] = [
  RouteStatus.PLANNED,
  RouteStatus.LOADING,
  RouteStatus.IN_TRANSIT,
];

const FINAL_STOP: RouteStopStatus[] = [
  RouteStopStatus.DELIVERED,
  RouteStopStatus.PARTIAL,
  RouteStopStatus.FAILED,
];

const USER_NAME = { select: { id: true, firstName: true, lastName: true } };

const ROUTE_DETAIL_INCLUDE = {
  driver: USER_NAME,
  helper: USER_NAME,
  createdBy: USER_NAME,
  truck: {
    select: {
      id: true,
      brand: true,
      model: true,
      plate: true,
      capacityM3: true,
      maxLoadKg: true,
    },
  },
  stops: {
    orderBy: { sequence: 'asc' },
    include: {
      loadedBy: USER_NAME,
      deliveredBy: USER_NAME,
      order: {
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalWeightKg: true,
          totalVolumeM3: true,
          deliveryDateFrom: true,
          deliveryDateTo: true,
          customer: {
            select: { id: true, name: true, phone: true, contactPerson: true },
          },
          deliveryAddress: true,
        },
      },
    },
  },
} satisfies Prisma.RouteInclude;

type RouteDetailRow = Prisma.RouteGetPayload<{
  include: typeof ROUTE_DETAIL_INCLUDE;
}>;

interface LockedRouteRow {
  id: string;
  code: string;
  status: RouteStatus;
  driver_id: string;
  helper_id: string | null;
}

function fullName(
  u: { firstName: string; lastName: string } | null | undefined,
): string | null {
  return u ? `${u.firstName} ${u.lastName}`.trim() : null;
}

function round(value: number, decimals: number) {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

@Injectable()
export class RoutesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ===========================================================================
  // CONSOLIDACIÓN DE CARGA
  // ===========================================================================

  /**
   * Pedidos listos para despacho agrupados por localidad, con bultos, m³ y kg
   * calculados sobre lo EFECTIVAMENTE pickeado (no sobre lo pedido).
   */
  async getDispatchableOrders() {
    const orders = await this.prisma.order.findMany({
      where: { status: { in: DISPATCHABLE }, routeId: null },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        deliveryDateFrom: true,
        deliveryDateTo: true,
        customer: { select: { name: true } },
        deliveryAddress: {
          select: { address: true, city: true, province: true, zipCode: true },
        },
        items: {
          select: {
            pickedQty: true,
            product: { select: { weightKg: true, volumeM3: true } },
          },
        },
      },
      orderBy: [{ deliveryDateFrom: 'asc' }, { createdAt: 'asc' }],
    });

    const groups = new Map<
      string,
      {
        zone: string;
        city: string;
        province: string;
        orders: Array<{
          id: string;
          orderNumber: string;
          status: OrderStatus;
          customerName: string;
          address: string;
          zipCode: string;
          deliveryDateFrom: Date | null;
          deliveryDateTo: Date | null;
          bultos: number;
          weightKg: number;
          volumeM3: number;
        }>;
        totals: {
          orders: number;
          bultos: number;
          weightKg: number;
          volumeM3: number;
        };
      }
    >();

    for (const o of orders) {
      const metrics = this.computeOrderLoad(o.items);
      const city = o.deliveryAddress.city.trim();
      const province = o.deliveryAddress.province.trim();
      const zone = `${city}, ${province}`;
      const group = groups.get(zone) ?? {
        zone,
        city,
        province,
        orders: [],
        totals: { orders: 0, bultos: 0, weightKg: 0, volumeM3: 0 },
      };

      group.orders.push({
        id: o.id,
        orderNumber: o.orderNumber,
        status: o.status,
        customerName: o.customer.name,
        address: o.deliveryAddress.address,
        zipCode: o.deliveryAddress.zipCode,
        deliveryDateFrom: o.deliveryDateFrom,
        deliveryDateTo: o.deliveryDateTo,
        ...metrics,
      });
      group.totals.orders += 1;
      group.totals.bultos += metrics.bultos;
      group.totals.weightKg = round(
        group.totals.weightKg + metrics.weightKg,
        2,
      );
      group.totals.volumeM3 = round(
        group.totals.volumeM3 + metrics.volumeM3,
        3,
      );
      groups.set(zone, group);
    }

    return [...groups.values()].sort(
      (a, b) =>
        a.province.localeCompare(b.province, 'es') ||
        a.city.localeCompare(b.city, 'es'),
    );
  }

  /** Choferes y peones activos, con indicación de si tienen ruta activa. */
  async getCrew() {
    const users = await this.prisma.user.findMany({
      where: {
        role: { in: [UserRole.DRIVER, UserRole.HELPER] },
        isActive: true,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        routes: {
          where: { status: { in: ACTIVE_ROUTE } },
          select: { code: true, scheduledDate: true },
        },
        helperRoutes: {
          where: { status: { in: ACTIVE_ROUTE } },
          select: { code: true, scheduledDate: true },
        },
      },
      orderBy: { lastName: 'asc' },
    });

    return users.map((u) => ({
      id: u.id,
      name: fullName(u)!,
      role: u.role,
      activeRoutes: [...u.routes, ...u.helperRoutes],
    }));
  }

  // ===========================================================================
  // ALTA DE HOJA DE RUTA
  // ===========================================================================

  async create(dto: CreateRouteDto, actor: AuthenticatedUser) {
    const orderIds = [...new Set(dto.orderIds)];
    if (orderIds.length !== dto.orderIds.length) {
      throw new BadRequestException('La lista de pedidos contiene duplicados.');
    }
    if (dto.helperId && dto.helperId === dto.driverId) {
      throw new BadRequestException('El chofer y el peón deben ser distintos.');
    }

    const scheduledDate = new Date(dto.scheduledDate);
    const code = dto.code?.trim() || this.generateCode(scheduledDate);

    try {
      const routeId = await this.prisma.$transaction(
        async (tx) => {
          const [truck, driver, helper] = await Promise.all([
            tx.truck.findUnique({ where: { id: dto.truckId } }),
            tx.user.findUnique({
              where: { id: dto.driverId },
              select: { id: true, role: true, isActive: true },
            }),
            dto.helperId
              ? tx.user.findUnique({
                  where: { id: dto.helperId },
                  select: { id: true, role: true, isActive: true },
                })
              : Promise.resolve(null),
          ]);

          if (!truck || !truck.isActive) {
            throw new BadRequestException(
              'El camión no existe o está inactivo.',
            );
          }
          if (!driver || !driver.isActive || driver.role !== UserRole.DRIVER) {
            throw new BadRequestException(
              'El chofer no existe, está inactivo o no tiene rol CHOFER.',
            );
          }
          if (
            dto.helperId &&
            (!helper || !helper.isActive || helper.role !== UserRole.HELPER)
          ) {
            throw new BadRequestException(
              'El peón no existe, está inactivo o no tiene rol PEÓN.',
            );
          }

          // Conflictos de agenda (misma fecha)
          const busy = await tx.route.findFirst({
            where: {
              scheduledDate,
              status: { in: ACTIVE_ROUTE },
              OR: [
                { truckId: dto.truckId },
                { driverId: dto.driverId },
                ...(dto.helperId
                  ? [{ driverId: dto.helperId }, { helperId: dto.helperId }]
                  : []),
                { helperId: dto.driverId },
              ],
            },
            select: { code: true },
          });
          if (busy) {
            throw new ConflictException(
              `El camión o la tripulación ya están asignados a la hoja ${busy.code} en esa fecha.`,
            );
          }

          // Toma atómica de los pedidos: FOR UPDATE bloquea las filas; si otro
          // gestor los consolidó en paralelo, PostgreSQL re-evalúa el WHERE
          // tras su commit y las excluye -> la cantidad no coincide y se aborta.
          const claimed = await tx.$queryRaw<Array<{ id: string }>>`
            SELECT id FROM orders
            WHERE id = ANY(${orderIds}::uuid[])
              AND route_id IS NULL
              AND status::text = ANY(${DISPATCHABLE}::text[])
            FOR UPDATE
          `;
          if (claimed.length !== orderIds.length) {
            throw new ConflictException(
              'Uno o más pedidos ya no están disponibles para despacho (otro usuario los consolidó o cambiaron de estado).',
            );
          }

          const orders = await tx.order.findMany({
            where: { id: { in: orderIds } },
            select: {
              id: true,
              orderNumber: true,
              items: {
                select: {
                  pickedQty: true,
                  product: { select: { weightKg: true, volumeM3: true } },
                },
              },
            },
          });
          const loadByOrder = new Map(
            orders.map((o) => [o.id, this.computeOrderLoad(o.items)]),
          );

          const totals = [...loadByOrder.values()].reduce(
            (acc, m) => ({
              bultos: acc.bultos + m.bultos,
              weightKg: acc.weightKg + m.weightKg,
              volumeM3: acc.volumeM3 + m.volumeM3,
            }),
            { bultos: 0, weightKg: 0, volumeM3: 0 },
          );

          const capM3 = Number(truck.capacityM3);
          const capKg = Number(truck.maxLoadKg);
          if (totals.volumeM3 > capM3 || totals.weightKg > capKg) {
            throw new BadRequestException(
              `La carga excede la capacidad del camión ${truck.plate}: ` +
                `${round(totals.volumeM3, 3)} / ${capM3} m³ y ${round(totals.weightKg, 2)} / ${capKg} kg.`,
            );
          }

          const zeroBultos = orders.filter(
            (o) => loadByOrder.get(o.id)!.bultos === 0,
          );
          if (zeroBultos.length > 0) {
            throw new BadRequestException(
              `Pedidos sin bultos pickeados: ${zeroBultos.map((o) => o.orderNumber).join(', ')}.`,
            );
          }

          const route = await tx.route.create({
            data: {
              code,
              driverId: dto.driverId,
              helperId: dto.helperId ?? null,
              truckId: dto.truckId,
              createdById: actor.id,
              vehicleInfo:
                `${truck.brand} ${truck.model} - ${truck.plate}`.slice(0, 100),
              scheduledDate,
              status: RouteStatus.PLANNED,
              notes: dto.notes?.trim() || null,
              totalBultos: totals.bultos,
              totalWeightKg: new Prisma.Decimal(round(totals.weightKg, 2)),
              totalVolumeM3: new Prisma.Decimal(round(totals.volumeM3, 3)),
            },
          });

          await tx.order.updateMany({
            where: { id: { in: orderIds } },
            data: { routeId: route.id },
          });

          await tx.routeStop.createMany({
            data: orderIds.map((orderId, index) => ({
              routeId: route.id,
              orderId,
              sequence: index + 1,
              expectedBultos: loadByOrder.get(orderId)!.bultos,
            })),
          });

          await this.audit.log(
            {
              actor,
              action: AuditAction.ROUTE_CREATED,
              entityType: AuditEntity.ROUTE,
              entityId: route.id,
              metadata: {
                code,
                truckId: dto.truckId,
                driverId: dto.driverId,
                helperId: dto.helperId ?? null,
                orderIds,
                totals,
              },
            },
            tx,
          );

          return route.id;
        },
        { timeout: 20000 },
      );

      return this.findOne(routeId, actor);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Ya existe una hoja de ruta con código "${code}".`,
        );
      }
      throw error;
    }
  }

  // ===========================================================================
  // CONSULTAS
  // ===========================================================================

  async findAll(query: ListRoutesQueryDto) {
    const limit = query.limit ?? 30;
    const page = query.page ?? 1;
    const where = this.buildRouteWhere(query);

    const [total, routes] = await Promise.all([
      this.prisma.route.count({ where }),
      this.prisma.route.findMany({
        where,
        include: ROUTE_DETAIL_INCLUDE,
        orderBy: [{ scheduledDate: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: routes.map((r) => this.toRouteView(r)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, user: AuthenticatedUser) {
    const route = await this.prisma.route.findUnique({
      where: { id },
      include: ROUTE_DETAIL_INCLUDE,
    });
    if (!route) throw new NotFoundException('Hoja de ruta no encontrada.');
    this.assertCrewOrSupervisor(route.driverId, route.helperId, user);
    return this.toRouteView(route);
  }

  /** Vuelta(s) del chofer / peón: activas + finalizadas de los últimos 7 días. */
  async findMyRoutes(user: AuthenticatedUser) {
    const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    const routes = await this.prisma.route.findMany({
      where: {
        OR: [{ driverId: user.id }, { helperId: user.id }],
        AND: [
          {
            OR: [
              { status: { in: ACTIVE_ROUTE } },
              { status: RouteStatus.COMPLETED, completedAt: { gte: since } },
            ],
          },
        ],
      },
      include: ROUTE_DETAIL_INCLUDE,
      orderBy: [{ scheduledDate: 'asc' }],
    });
    return routes.map((r) => this.toRouteView(r));
  }

  // ===========================================================================
  // REORDENAMIENTO (CHOFER)
  // ===========================================================================

  async reorder(id: string, dto: ReorderStopsDto, user: AuthenticatedUser) {
    await this.prisma.$transaction(async (tx) => {
      const route = await this.lockRoute(tx, id);

      if (user.role === UserRole.DRIVER && route.driver_id !== user.id) {
        throw new ForbiddenException(
          'Sólo el chofer de esta hoja puede reordenarla.',
        );
      }
      if (!isSupervisor(user.role) && user.role !== UserRole.DRIVER) {
        throw new ForbiddenException(
          'No tiene permiso para reordenar entregas.',
        );
      }
      if (!ACTIVE_ROUTE.includes(route.status)) {
        throw new ConflictException(
          `La hoja está ${route.status}; no puede reordenarse.`,
        );
      }

      const stops = await tx.routeStop.findMany({
        where: { routeId: id },
        select: { id: true, sequence: true, status: true },
        orderBy: { sequence: 'asc' },
      });

      const finished = stops.filter((s) => FINAL_STOP.includes(s.status));
      const open = stops.filter((s) => !FINAL_STOP.includes(s.status));
      const openIds = new Set(open.map((s) => s.id));

      if (
        dto.stopIds.length !== open.length ||
        new Set(dto.stopIds).size !== dto.stopIds.length ||
        dto.stopIds.some((sid) => !openIds.has(sid))
      ) {
        throw new BadRequestException(
          'Debe enviar exactamente las paradas pendientes de la hoja, sin repetir.',
        );
      }

      const before = open.map((s) => s.id);
      const newOrder = [...finished.map((s) => s.id), ...dto.stopIds];

      for (let i = 0; i < newOrder.length; i++) {
        await tx.routeStop.update({
          where: { id: newOrder[i] },
          data: { sequence: i + 1 },
        });
      }

      await this.audit.log(
        {
          actor: user,
          action: AuditAction.ROUTE_REORDERED,
          entityType: AuditEntity.ROUTE,
          entityId: id,
          metadata: { code: route.code, before, after: dto.stopIds },
        },
        tx,
      );
    });

    return this.findOne(id, user);
  }

  // ===========================================================================
  // PUNTO DE CONTROL 2a — CARGA DEL CAMIÓN (OBLIGATORIO)
  // ===========================================================================

  async loadCheck(
    routeId: string,
    stopId: string,
    dto: LoadCheckDto,
    user: AuthenticatedUser,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const route = await this.lockRoute(tx, routeId);
      this.assertLoader(route, user);

      if (
        route.status !== RouteStatus.PLANNED &&
        route.status !== RouteStatus.LOADING
      ) {
        throw new ConflictException(
          `La carga sólo se controla con la hoja PLANNED o LOADING (actual: ${route.status}).`,
        );
      }

      const stop = await tx.routeStop.findFirst({
        where: { id: stopId, routeId },
        include: { order: { select: { orderNumber: true } } },
      });
      if (!stop) throw new NotFoundException('Parada no encontrada.');
      if (
        stop.status !== RouteStopStatus.PENDING &&
        stop.status !== RouteStopStatus.LOADED
      ) {
        throw new ConflictException(`La parada está ${stop.status}.`);
      }

      if (dto.loadedBultos !== stop.expectedBultos) {
        throw new BadRequestException(
          `Diferencia en la carga del pedido ${stop.order.orderNumber}: se contaron ${dto.loadedBultos} bultos y se esperaban ${stop.expectedBultos}. Corrija la carga antes de confirmar.`,
        );
      }

      const now = new Date();
      if (route.status === RouteStatus.PLANNED) {
        await tx.route.update({
          where: { id: routeId },
          data: { status: RouteStatus.LOADING, loadingStartedAt: now },
        });
        await this.audit.log(
          {
            actor: user,
            action: AuditAction.ROUTE_LOADING_STARTED,
            entityType: AuditEntity.ROUTE,
            entityId: routeId,
            metadata: { code: route.code },
          },
          tx,
        );
      }

      await tx.routeStop.update({
        where: { id: stopId },
        data: {
          status: RouteStopStatus.LOADED,
          loadedBultos: dto.loadedBultos,
          loadedById: user.id,
          loadedAt: now,
          notes: dto.notes?.trim() || stop.notes,
        },
      });

      await this.audit.log(
        {
          actor: user,
          action: AuditAction.DISPATCH_LOAD_CHECKED,
          entityType: AuditEntity.ROUTE_STOP,
          entityId: stopId,
          metadata: {
            routeId,
            routeCode: route.code,
            orderId: stop.orderId,
            orderNumber: stop.order.orderNumber,
            expected: stop.expectedBultos,
            loaded: dto.loadedBultos,
          },
        },
        tx,
      );
    });

    return this.findOne(routeId, user);
  }

  /** Inicio del viaje: exige que TODAS las paradas hayan pasado el control de carga. */
  async startRoute(id: string, user: AuthenticatedUser) {
    await this.prisma.$transaction(async (tx) => {
      const route = await this.lockRoute(tx, id);
      this.assertLoader(route, user);

      if (
        route.status !== RouteStatus.LOADING &&
        route.status !== RouteStatus.PLANNED
      ) {
        throw new ConflictException(`La hoja está ${route.status}.`);
      }

      const pending = await tx.routeStop.count({
        where: { routeId: id, status: { not: RouteStopStatus.LOADED } },
      });
      if (pending > 0) {
        throw new BadRequestException(
          `Punto de Control 2 incompleto: faltan ${pending} pedido(s) por verificar en la carga.`,
        );
      }

      const now = new Date();
      await tx.route.update({
        where: { id },
        data: { status: RouteStatus.IN_TRANSIT, startedAt: now },
      });
      await tx.order.updateMany({
        where: { routeId: id },
        data: { status: OrderStatus.DISPATCHED, dispatchedAt: now },
      });

      await this.audit.log(
        {
          actor: user,
          action: AuditAction.ROUTE_STARTED,
          entityType: AuditEntity.ROUTE,
          entityId: id,
          metadata: { code: route.code },
        },
        tx,
      );
    });

    return this.findOne(id, user);
  }

  // ===========================================================================
  // PUNTO DE CONTROL 2b — DESCARGA EN CLIENTE (OBLIGATORIO)
  // ===========================================================================

  async deliveryCheck(
    routeId: string,
    stopId: string,
    dto: DeliveryCheckDto,
    user: AuthenticatedUser,
  ) {
    await this.prisma.$transaction(async (tx) => {
      const route = await this.lockRoute(tx, routeId);
      this.assertCrewOrSupervisor(route.driver_id, route.helper_id, user);

      if (route.status !== RouteStatus.IN_TRANSIT) {
        throw new ConflictException(
          'La descarga sólo se valida con la hoja EN VIAJE.',
        );
      }

      const stop = await tx.routeStop.findFirst({
        where: { id: stopId, routeId },
        include: { order: { select: { orderNumber: true } } },
      });
      if (!stop) throw new NotFoundException('Parada no encontrada.');
      if (stop.status !== RouteStopStatus.LOADED) {
        throw new ConflictException(
          `La parada ya fue cerrada (${stop.status}).`,
        );
      }

      const now = new Date();
      let stopStatus: RouteStopStatus;
      let orderStatus: OrderStatus;

      if (dto.failed) {
        if (!dto.notes?.trim()) {
          throw new BadRequestException(
            'Indique el motivo de la entrega fallida.',
          );
        }
        stopStatus = RouteStopStatus.FAILED;
        orderStatus = OrderStatus.RETURNED;
      } else {
        const delivered = dto.deliveredBultos ?? 0;
        if (delivered > (stop.loadedBultos ?? stop.expectedBultos)) {
          throw new BadRequestException(
            'No se pueden entregar más bultos de los cargados en el camión.',
          );
        }
        if (delivered !== stop.expectedBultos && !dto.notes?.trim()) {
          throw new BadRequestException(
            `Entrega con diferencia (${delivered}/${stop.expectedBultos}): indique el motivo en observaciones.`,
          );
        }
        stopStatus =
          delivered === stop.expectedBultos
            ? RouteStopStatus.DELIVERED
            : RouteStopStatus.PARTIAL;
        orderStatus = OrderStatus.DELIVERED;
      }

      await tx.routeStop.update({
        where: { id: stopId },
        data: {
          status: stopStatus,
          deliveredBultos: dto.failed ? 0 : (dto.deliveredBultos ?? 0),
          deliveredById: user.id,
          deliveredAt: now,
          recipientName: dto.recipientName?.trim() || null,
          notes: dto.notes?.trim() || stop.notes,
        },
      });

      await tx.order.update({
        where: { id: stop.orderId },
        data:
          orderStatus === OrderStatus.RETURNED
            ? { status: orderStatus, routeId: null }
            : { status: orderStatus, deliveredAt: now },
      });

      await this.audit.log(
        {
          actor: user,
          action: AuditAction.DELIVERY_CHECKED,
          entityType: AuditEntity.ROUTE_STOP,
          entityId: stopId,
          metadata: {
            routeId,
            routeCode: route.code,
            orderId: stop.orderId,
            orderNumber: stop.order.orderNumber,
            expected: stop.expectedBultos,
            delivered: dto.failed ? 0 : (dto.deliveredBultos ?? 0),
            result: stopStatus,
            recipientName: dto.recipientName ?? null,
            notes: dto.notes ?? null,
          },
        },
        tx,
      );

      const open = await tx.routeStop.count({
        where: { routeId, status: { notIn: FINAL_STOP } },
      });
      if (open === 0) {
        await tx.route.update({
          where: { id: routeId },
          data: { status: RouteStatus.COMPLETED, completedAt: now },
        });
        await this.audit.log(
          {
            actor: user,
            action: AuditAction.ROUTE_COMPLETED,
            entityType: AuditEntity.ROUTE,
            entityId: routeId,
            metadata: { code: route.code },
          },
          tx,
        );
      }
    });

    return this.findOne(routeId, user);
  }

  // ===========================================================================
  // CANCELACIÓN (antes de salir)
  // ===========================================================================

  async cancel(id: string, dto: CancelRouteDto, user: AuthenticatedUser) {
    await this.prisma.$transaction(async (tx) => {
      const route = await this.lockRoute(tx, id);
      if (
        route.status !== RouteStatus.PLANNED &&
        route.status !== RouteStatus.LOADING
      ) {
        throw new ConflictException(
          `Sólo se cancelan hojas PLANNED o LOADING (actual: ${route.status}).`,
        );
      }

      await tx.order.updateMany({
        where: { routeId: id },
        data: { routeId: null },
      });
      await tx.routeStop.updateMany({
        where: { routeId: id },
        data: {
          status: RouteStopStatus.FAILED,
          notes: `Hoja cancelada: ${dto.reason}`.slice(0, 500),
        },
      });
      await tx.route.update({
        where: { id },
        data: { status: RouteStatus.CANCELLED },
      });

      await this.audit.log(
        {
          actor: user,
          action: AuditAction.ROUTE_CANCELLED,
          entityType: AuditEntity.ROUTE,
          entityId: id,
          metadata: { code: route.code, reason: dto.reason },
        },
        tx,
      );
    });

    return this.findOne(id, user);
  }

  // ===========================================================================
  // CONTROL DE VIAJES: HISTORIAL Y MÉTRICAS
  // ===========================================================================

  async history(query: ListRoutesQueryDto) {
    const limit = query.limit ?? 30;
    const page = query.page ?? 1;
    const where: Prisma.RouteWhereInput = {
      ...this.buildRouteWhere(query),
      status: query.status ?? {
        in: [RouteStatus.COMPLETED, RouteStatus.CANCELLED],
      },
    };

    const [total, routes] = await Promise.all([
      this.prisma.route.count({ where }),
      this.prisma.route.findMany({
        where,
        include: ROUTE_DETAIL_INCLUDE,
        orderBy: [{ completedAt: 'desc' }, { scheduledDate: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: routes.map((r) => {
        const view = this.toRouteView(r);
        const durationMinutes =
          r.startedAt && r.completedAt
            ? Math.round(
                (r.completedAt.getTime() - r.startedAt.getTime()) / 60000,
              )
            : null;
        return { ...view, durationMinutes };
      }),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  /** Resumen ejecutivo para el Dashboard principal. */
  async metrics() {
    const now = new Date();
    // scheduled_date es DATE: se compara contra la medianoche UTC del día local
    const startOfDay = new Date(
      Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
    );
    const since30 = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

    const [
      routesToday,
      inTransit,
      completed30,
      stops30,
      orderPipeline,
      trucksActive,
      pendingStockRequests,
    ] = await Promise.all([
      this.prisma.route.groupBy({
        by: ['status'],
        where: { scheduledDate: startOfDay },
        _count: { _all: true },
      }),
      this.prisma.route.count({ where: { status: RouteStatus.IN_TRANSIT } }),
      this.prisma.route.findMany({
        where: { status: RouteStatus.COMPLETED, completedAt: { gte: since30 } },
        select: {
          startedAt: true,
          completedAt: true,
          totalVolumeM3: true,
          totalWeightKg: true,
          truck: { select: { capacityM3: true, maxLoadKg: true } },
        },
      }),
      this.prisma.routeStop.groupBy({
        by: ['status'],
        where: { deliveredAt: { gte: since30 } },
        _count: { _all: true },
        _sum: { deliveredBultos: true, expectedBultos: true },
      }),
      this.prisma.order.groupBy({
        by: ['status'],
        where: {
          status: {
            in: [
              OrderStatus.PENDING,
              OrderStatus.IN_PICKING,
              OrderStatus.PICKED,
              OrderStatus.CHECKED,
              OrderStatus.DISPATCHED,
              OrderStatus.RETURNED,
            ],
          },
        },
        _count: { _all: true },
      }),
      this.prisma.truck.count({ where: { isActive: true } }),
      this.prisma.stockAdjustmentRequest.count({
        where: { status: 'PENDING' },
      }),
    ]);

    const durations = completed30
      .filter((r) => r.startedAt && r.completedAt)
      .map((r) => (r.completedAt!.getTime() - r.startedAt!.getTime()) / 60000);

    const utilization = completed30
      .filter((r) => r.truck)
      .map((r) =>
        Math.max(
          Number(r.totalVolumeM3) / Number(r.truck!.capacityM3),
          Number(r.totalWeightKg) / Number(r.truck!.maxLoadKg),
        ),
      );

    const stopCount = (status: RouteStopStatus) =>
      stops30.find((s) => s.status === status)?._count._all ?? 0;
    const delivered = stopCount(RouteStopStatus.DELIVERED);
    const partial = stopCount(RouteStopStatus.PARTIAL);
    const failed = stopCount(RouteStopStatus.FAILED);
    const closed = delivered + partial + failed;
    const bultosDelivered = stops30.reduce(
      (acc, s) => acc + (s._sum.deliveredBultos ?? 0),
      0,
    );

    return {
      generatedAt: now,
      today: {
        byStatus: Object.fromEntries(
          routesToday.map((r) => [r.status, r._count._all]),
        ),
        total: routesToday.reduce((a, r) => a + r._count._all, 0),
      },
      inTransit,
      last30Days: {
        completedTrips: completed30.length,
        deliveredStops: delivered,
        partialStops: partial,
        failedStops: failed,
        successRate: closed > 0 ? round((delivered / closed) * 100, 1) : null,
        bultosDelivered,
        kgTransported: round(
          completed30.reduce((a, r) => a + Number(r.totalWeightKg), 0),
          2,
        ),
        avgTripMinutes:
          durations.length > 0
            ? Math.round(
                durations.reduce((a, d) => a + d, 0) / durations.length,
              )
            : null,
        avgFleetUtilizationPct:
          utilization.length > 0
            ? round(
                (utilization.reduce((a, u) => a + u, 0) / utilization.length) *
                  100,
                1,
              )
            : null,
      },
      orderPipeline: Object.fromEntries(
        orderPipeline.map((o) => [o.status, o._count._all]),
      ),
      fleet: { activeTrucks: trucksActive },
      pendingStockRequests,
    };
  }

  // ===========================================================================
  // AUXILIARES
  // ===========================================================================

  private computeOrderLoad(
    items: Array<{
      pickedQty: number;
      product: { weightKg: Prisma.Decimal; volumeM3: Prisma.Decimal };
    }>,
  ) {
    let bultos = 0;
    let weightKg = 0;
    let volumeM3 = 0;
    for (const item of items) {
      bultos += item.pickedQty;
      weightKg += item.pickedQty * Number(item.product.weightKg);
      volumeM3 += item.pickedQty * Number(item.product.volumeM3);
    }
    return {
      bultos,
      weightKg: round(weightKg, 2),
      volumeM3: round(volumeM3, 3),
    };
  }

  private buildRouteWhere(query: ListRoutesQueryDto): Prisma.RouteWhereInput {
    const where: Prisma.RouteWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.driverId) where.driverId = query.driverId;
    if (query.from || query.to) {
      where.scheduledDate = {
        ...(query.from ? { gte: new Date(query.from) } : {}),
        ...(query.to ? { lte: new Date(query.to) } : {}),
      };
    }
    return where;
  }

  private async lockRoute(tx: Tx, id: string): Promise<LockedRouteRow> {
    const rows = await tx.$queryRaw<LockedRouteRow[]>`
      SELECT id, code, status, driver_id, helper_id
      FROM routes
      WHERE id = ${id}::uuid
      FOR UPDATE
    `;
    if (!rows[0]) throw new NotFoundException('Hoja de ruta no encontrada.');
    return rows[0];
  }

  private assertCrewOrSupervisor(
    driverId: string,
    helperId: string | null,
    user: AuthenticatedUser,
  ) {
    if (isSupervisor(user.role)) return;
    if (user.id === driverId || (helperId && user.id === helperId)) return;
    throw new ForbiddenException('Esta hoja de ruta no le fue asignada.');
  }

  /** Control de carga: supervisores o el chofer asignado (el peón no). */
  private assertLoader(route: LockedRouteRow, user: AuthenticatedUser) {
    if (isSupervisor(user.role)) return;
    if (user.role === UserRole.DRIVER && user.id === route.driver_id) return;
    throw new ForbiddenException(
      'El control de carga lo realiza el Gestor o el chofer asignado.',
    );
  }

  private toRouteView(route: RouteDetailRow) {
    const stops = route.stops.map((s) => ({
      id: s.id,
      sequence: s.sequence,
      status: s.status,
      expectedBultos: s.expectedBultos,
      loadedBultos: s.loadedBultos,
      loadedAt: s.loadedAt,
      loadedBy: fullName(s.loadedBy),
      deliveredBultos: s.deliveredBultos,
      deliveredAt: s.deliveredAt,
      deliveredBy: fullName(s.deliveredBy),
      recipientName: s.recipientName,
      notes: s.notes,
      order: {
        id: s.order.id,
        orderNumber: s.order.orderNumber,
        status: s.order.status,
        weightKg: Number(s.order.totalWeightKg),
        volumeM3: Number(s.order.totalVolumeM3),
        deliveryDateFrom: s.order.deliveryDateFrom,
        deliveryDateTo: s.order.deliveryDateTo,
        customerName: s.order.customer.name,
        customerPhone: s.order.customer.phone,
        contactPerson: s.order.customer.contactPerson,
        address: s.order.deliveryAddress.address,
        city: s.order.deliveryAddress.city,
        province: s.order.deliveryAddress.province,
        zipCode: s.order.deliveryAddress.zipCode,
        businessHours: s.order.deliveryAddress.businessHours,
      },
    }));

    const count = (st: RouteStopStatus) =>
      stops.filter((s) => s.status === st).length;

    return {
      id: route.id,
      code: route.code,
      status: route.status,
      scheduledDate: route.scheduledDate,
      notes: route.notes,
      vehicleInfo: route.vehicleInfo,
      truck: route.truck
        ? {
            ...route.truck,
            capacityM3: Number(route.truck.capacityM3),
            maxLoadKg: Number(route.truck.maxLoadKg),
          }
        : null,
      driver: route.driver
        ? { id: route.driver.id, name: fullName(route.driver)! }
        : null,
      helper: route.helper
        ? { id: route.helper.id, name: fullName(route.helper)! }
        : null,
      createdBy: fullName(route.createdBy),
      totals: {
        bultos: route.totalBultos,
        weightKg: Number(route.totalWeightKg),
        volumeM3: Number(route.totalVolumeM3),
      },
      utilization: route.truck
        ? {
            volumePct: round(
              (Number(route.totalVolumeM3) / Number(route.truck.capacityM3)) *
                100,
              1,
            ),
            weightPct: round(
              (Number(route.totalWeightKg) / Number(route.truck.maxLoadKg)) *
                100,
              1,
            ),
          }
        : null,
      progress: {
        stops: stops.length,
        loaded: stops.filter((s) => s.status !== RouteStopStatus.PENDING)
          .length,
        delivered: count(RouteStopStatus.DELIVERED),
        partial: count(RouteStopStatus.PARTIAL),
        failed: count(RouteStopStatus.FAILED),
      },
      loadingStartedAt: route.loadingStartedAt,
      startedAt: route.startedAt,
      completedAt: route.completedAt,
      createdAt: route.createdAt,
      stops,
    };
  }

  private generateCode(date: Date): string {
    const ymd = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`;
    return `HR-${ymd}-${randomBytes(2).toString('hex').toUpperCase()}`;
  }
}
