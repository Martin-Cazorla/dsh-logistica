// dsh-logistica/src/orders/orders.service.ts

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  OrderStatus,
  PickTaskStatus,
  Prisma,
  ShippingType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity } from '../audit/audit.actions';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  canViewMoney,
  isSalesModuleEnabled,
  stripMoney,
} from '../common/sales';
import {
  CancelOrderDto,
  CreateOrderDto,
  ListOrdersQueryDto,
} from './dto/create-order.dto';
import {
  fetchAvailableStock,
  releasePendingReservations,
} from './services/pick-reservations';
import { planAndReserve } from './services/pick-planner';
import { isSeller } from '../auth/permissions';
import { canSellerUseCustomer, orderScopeFor } from '../common/seller-scope';
import { OrderPrintSheet, toOrderPrintSheet } from './mappers/order-print.mapper';

const USER_NAME = { select: { id: true, firstName: true, lastName: true } };

const WAREHOUSE_REF = { select: { id: true, name: true, code: true } };

const ORDER_LIST_INCLUDE = {
  customer: { select: { id: true, name: true, cuit: true } },
  deliveryAddress: true,
  sourceWarehouse: WAREHOUSE_REF,
  transport: { select: { id: true, name: true } },
  createdBy: USER_NAME,
  seller: USER_NAME,
  pickerAssignments: {
    select: { user: USER_NAME, assignedAt: true },
    orderBy: { assignedAt: 'asc' },
  },
  route: { select: { id: true, code: true, status: true } },
  // Depósitos que recorre el pedido (derivados de sus tareas de picking)
  pickTasks: {
    where: { status: { not: PickTaskStatus.CANCELLED } },
    select: { location: { select: { warehouse: WAREHOUSE_REF } } },
    orderBy: { sequence: 'asc' },
  },
  items: {
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          unitsPerBox: true,
          weightKg: true,
          volumeM3: true,
        },
      },
    },
  },
} satisfies Prisma.OrderInclude;

const CANCELLABLE: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.IN_PICKING,
];

type WarehouseRef = { id: string; name: string; code: string };

/**
 * Reemplaza `pickTasks` (sólo pedido para esto) por `warehouses`: los
 * depósitos que recorre el pedido en el orden del recorrido. Los pedidos
 * históricos sin tareas muestran su depósito único.
 */
function withWarehouses<
  T extends {
    pickTasks: Array<{ location: { warehouse: WarehouseRef } }>;
    sourceWarehouse: WarehouseRef | null;
  },
>(order: T): Omit<T, 'pickTasks'> & { warehouses: WarehouseRef[] } {
  const { pickTasks, ...rest } = order;
  const map = new Map<string, WarehouseRef>();
  for (const t of pickTasks) map.set(t.location.warehouse.id, t.location.warehouse);
  if (map.size === 0 && order.sourceWarehouse) {
    map.set(order.sourceWarehouse.id, order.sourceWarehouse);
  }
  return { ...rest, warehouses: [...map.values()] };
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // ALTA DE PEDIDOS
  // ---------------------------------------------------------------------------

  /**
   * Alta con reserva inmediata: en la misma transacción se crea el pedido,
   * se planifica el picking multi-depósito (de qué depósito / ubicación sale
   * cada bulto) y se reserva el stock. Así dos pedidos pendientes no pueden
   * vender el mismo bulto y la hoja de preparación es exacta desde el alta.
   */
  async create(dto: CreateOrderDto, actor: AuthenticatedUser) {
    const productIds = dto.items.map((i) => i.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException(
        'El pedido contiene productos repetidos. Agrupe las cantidades en una sola línea.',
      );
    }

    if (
      dto.deliveryDateFrom &&
      dto.deliveryDateTo &&
      new Date(dto.deliveryDateFrom) > new Date(dto.deliveryDateTo)
    ) {
      throw new BadRequestException(
        'La fecha de entrega "desde" no puede ser posterior a "hasta".',
      );
    }

    const orderNumber = dto.orderNumber.trim();
    if (!orderNumber) {
      throw new BadRequestException('Indique el número de presupuesto.');
    }

    const sellerId = await this.resolveSeller(dto, actor);
    const transportId = await this.resolveTransport(dto);

    const [address, products, customer] = await Promise.all([
      this.prisma.customerAddress.findFirst({
        where: {
          id: dto.addressId,
          customerId: dto.customerId,
          isActive: true,
        },
        select: { id: true },
      }),
      this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          sku: true,
          unitsPerBox: true,
          weightKg: true,
          volumeM3: true,
          unitPrice: true,
        },
      }),
      this.prisma.customer.findUnique({
        where: { id: dto.customerId },
        select: { id: true, isActive: true, accountSellerId: true },
      }),
    ]);

    if (!customer || !customer.isActive) {
      throw new BadRequestException('El cliente no existe o está inactivo.');
    }
    if (!canSellerUseCustomer(actor, customer.accountSellerId)) {
      throw new ForbiddenException(
        'El cliente pertenece a la cartera de otro vendedor.',
      );
    }
    if (!address) {
      throw new BadRequestException(
        'La dirección de entrega no pertenece al cliente seleccionado.',
      );
    }

    const productMap = new Map(products.map((p) => [p.id, p]));
    const missing = productIds.filter((id) => !productMap.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(
        `Productos no encontrados: ${missing.join(', ')}.`,
      );
    }

    // No se vende lo que no hay: cada línea debe caber en el DISPONIBLE
    // consolidado (físico − reservado) de todos los depósitos activos. La
    // reserva dentro de la transacción vuelve a comprobarlo con bloqueo.
    const availability = await fetchAvailableStock(this.prisma, {
      productIds,
      activeWarehousesOnly: true,
    });
    const availableByProduct = new Map<string, number>();
    for (const a of availability) {
      availableByProduct.set(
        a.productId,
        (availableByProduct.get(a.productId) ?? 0) + a.available,
      );
    }
    this.assertNoShortages(
      dto.items.map((item) => ({
        productId: item.productId,
        sku: productMap.get(item.productId)!.sku,
        requested: item.bultos,
        available: availableByProduct.get(item.productId) ?? 0,
      })),
    );

    const salesEnabled = isSalesModuleEnabled();
    let totalBultos = 0;
    let totalWeightKg = new Prisma.Decimal(0);
    let totalVolumeM3 = new Prisma.Decimal(0);
    let subtotal = new Prisma.Decimal(0);

    const preparedItems = dto.items.map((item) => {
      const product = productMap.get(item.productId)!;
      const totalUnits = item.bultos * product.unitsPerBox;

      totalBultos += item.bultos;
      // weightKg / volumeM3 del producto son POR BULTO
      totalWeightKg = totalWeightKg.add(
        new Prisma.Decimal(product.weightKg).mul(item.bultos),
      );
      totalVolumeM3 = totalVolumeM3.add(
        new Prisma.Decimal(product.volumeM3).mul(item.bultos),
      );

      if (!salesEnabled) {
        return {
          productId: item.productId,
          bultos: item.bultos,
          totalUnits,
          unitPrice: new Prisma.Decimal(0),
          discountPct: null,
          lineTotal: null,
        };
      }

      const unitPrice = new Prisma.Decimal(item.unitPrice ?? product.unitPrice);
      const discountPct = new Prisma.Decimal(item.discountPct ?? 0);
      const lineTotal = unitPrice
        .mul(totalUnits)
        .mul(new Prisma.Decimal(100).sub(discountPct))
        .div(100)
        .toDecimalPlaces(2);
      subtotal = subtotal.add(lineTotal);

      return {
        productId: item.productId,
        bultos: item.bultos,
        totalUnits,
        unitPrice,
        discountPct,
        lineTotal,
      };
    });

    const taxAmount = salesEnabled
      ? subtotal
          .mul(dto.taxPct ?? 0)
          .div(100)
          .toDecimalPlaces(2)
      : null;

    try {
      const orderId = await this.prisma.$transaction(
        async (tx) => {
          const order = await tx.order.create({
            data: {
              orderNumber,
              customerId: dto.customerId,
              addressId: dto.addressId,
              sourceWarehouseId: null, // multi-depósito: lo define cada PickTask
              sellerId,
              shippingType: dto.shippingType,
              transportId,
              createdById: actor.id,
              currency: dto.currency,
              paymentTerm: dto.paymentTerm,
              notes: dto.notes?.trim() || null,
              status: OrderStatus.PENDING,
              deliveryDateFrom: dto.deliveryDateFrom
                ? new Date(dto.deliveryDateFrom)
                : null,
              deliveryDateTo: dto.deliveryDateTo
                ? new Date(dto.deliveryDateTo)
                : null,
              estimatedDeliveryDate: dto.estimatedDeliveryDate
                ? new Date(dto.estimatedDeliveryDate)
                : null,
              totalBultos,
              totalWeightKg,
              totalVolumeM3,
              subtotalAmount: salesEnabled ? subtotal : null,
              discountAmount: null,
              taxAmount,
              totalAmount:
                salesEnabled && taxAmount ? subtotal.add(taxAmount) : 0,
              items: { create: preparedItems },
            },
            select: {
              id: true,
              items: { select: { id: true, productId: true, bultos: true } },
            },
          });

          const { plan, reserved } = await planAndReserve(tx, {
            orderId: order.id,
            items: order.items,
            allowShortages: false,
          });
          if (!reserved) {
            // Otro pedido tomó el stock entre la validación y la reserva
            const missingBy = new Map(
              plan.shortages.map((s) => [s.productId, s.missing]),
            );
            this.assertNoShortages(
              dto.items.map((item) => {
                const lack = missingBy.get(item.productId) ?? 0;
                return {
                  productId: item.productId,
                  sku: productMap.get(item.productId)!.sku,
                  requested: item.bultos,
                  available: item.bultos - lack,
                };
              }),
            );
          }

          await this.audit.log(
            {
              actor,
              action: AuditAction.ORDER_CREATED,
              entityType: AuditEntity.ORDER,
              entityId: order.id,
              metadata: {
                orderNumber,
                customerId: dto.customerId,
                sellerId,
                shippingType: dto.shippingType,
                transportId,
                items: dto.items.length,
                totalBultos,
                pickTasks: plan.picks.length,
                warehouses: plan.warehouseOrder,
              },
            },
            tx,
          );

          return order.id;
        },
        { timeout: 20000 },
      );

      return this.findOne(orderId, actor);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Ya existe un pedido registrado con el número de presupuesto "${orderNumber}".`,
        );
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // CONSULTAS
  // ---------------------------------------------------------------------------

  async findAll(query: ListOrdersQueryDto, actor: AuthenticatedUser) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;

    const where: Prisma.OrderWhereInput = { ...orderScopeFor(actor) };
    if (query.status) where.status = query.status;
    const term = query.search?.trim();
    if (term) {
      where.OR = [
        { orderNumber: { contains: term, mode: 'insensitive' } },
        { customer: { name: { contains: term, mode: 'insensitive' } } },
        { customer: { cuit: { contains: term } } },
      ];
    }

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: ORDER_LIST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: orders.map((o) => this.present(withWarehouses(o), actor)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    // findFirst con el alcance del vendedor: un pedido ajeno responde 404
    // (no se revela su existencia).
    const order = await this.prisma.order.findFirst({
      where: { id, ...orderScopeFor(actor) },
      include: {
        ...ORDER_LIST_INCLUDE,
        picker: USER_NAME,
        checkedBy: USER_NAME,
        items: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                unitsPerBox: true,
                weightKg: true,
                volumeM3: true,
              },
            },
            picker: USER_NAME,
          },
        },
        routeStops: {
          select: {
            id: true,
            sequence: true,
            status: true,
            expectedBultos: true,
            loadedBultos: true,
            loadedAt: true,
            deliveredBultos: true,
            deliveredAt: true,
            recipientName: true,
            route: { select: { id: true, code: true, scheduledDate: true } },
            loadedBy: USER_NAME,
            deliveredBy: USER_NAME,
          },
          orderBy: { createdAt: 'asc' },
        },
        movements: {
          select: {
            id: true,
            type: true,
            quantity: true,
            lotNumber: true,
            createdAt: true,
            productId: true,
            sourceLocation: { select: { id: true, code: true } },
            user: USER_NAME,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(
        `El pedido con ID "${id}" no fue encontrado.`,
      );
    }

    const pickingHistory = await this.loadPickingHistory(id);
    return this.present({ ...withWarehouses(order), pickingHistory }, actor);
  }

  /**
   * Trazabilidad multi-picker: cada toma (original o reemplazo) con quién la
   * confirmó, cuánto, dónde, y la incidencia si hubo faltante.
   */
  private async loadPickingHistory(orderId: string) {
    const tasks = await this.prisma.pickTask.findMany({
      where: { orderId, status: { not: PickTaskStatus.CANCELLED } },
      select: {
        id: true,
        sequence: true,
        quantity: true,
        pickedQty: true,
        status: true,
        pickedAt: true,
        shortReason: true,
        notes: true,
        replacesTaskId: true,
        product: { select: { sku: true, name: true } },
        location: { select: { code: true, warehouse: WAREHOUSE_REF } },
        pickedBy: USER_NAME,
        assignedTo: USER_NAME,
        replacesTask: { select: { location: { select: { code: true } } } },
        stockRequest: { select: { id: true, status: true, heldQty: true } },
      },
      orderBy: { sequence: 'asc' },
    });

    const fullName = (u: { firstName: string; lastName: string } | null) =>
      u ? `${u.firstName} ${u.lastName}`.trim() : null;

    const byPicker = new Map<
      string,
      { pickerId: string; name: string; bultos: number; tasks: number }
    >();
    for (const t of tasks) {
      if (!t.pickedBy) continue;
      const entry = byPicker.get(t.pickedBy.id) ?? {
        pickerId: t.pickedBy.id,
        name: fullName(t.pickedBy)!,
        bultos: 0,
        tasks: 0,
      };
      entry.bultos += t.pickedQty;
      entry.tasks += 1;
      byPicker.set(t.pickedBy.id, entry);
    }

    return {
      byPicker: [...byPicker.values()],
      tasks: tasks.map((t) => ({
        id: t.id,
        sequence: t.sequence,
        sku: t.product.sku,
        productName: t.product.name,
        warehouse: t.location.warehouse,
        locationCode: t.location.code,
        quantity: t.quantity,
        pickedQty: t.pickedQty,
        status: t.status,
        pickedBy: fullName(t.pickedBy),
        pickedAt: t.pickedAt,
        assignedTo: fullName(t.assignedTo),
        shortReason: t.shortReason,
        notes: t.notes,
        replacesTaskId: t.replacesTaskId,
        replacesLocationCode: t.replacesTask?.location.code ?? null,
        stockRequest: t.stockRequest,
      })),
    };
  }

  /**
   * Hoja de preparación: una fila por toma de picking (depósito + ubicación),
   * agrupada por depósito y en el orden del recorrido.
   */
  async getPrintSheet(
    id: string,
    actor: AuthenticatedUser,
  ): Promise<OrderPrintSheet> {
    const order = await this.prisma.order.findFirst({
      where: { id, ...orderScopeFor(actor) },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        createdAt: true,
        notes: true,
        shippingType: true,
        estimatedDeliveryDate: true,
        deliveryDateFrom: true,
        deliveryDateTo: true,
        totalBultos: true,
        customer: { select: { name: true, cuit: true } },
        deliveryAddress: {
          select: {
            alias: true,
            address: true,
            city: true,
            province: true,
            zipCode: true,
          },
        },
        seller: USER_NAME,
        transport: { select: { name: true } },
        items: {
          select: {
            id: true,
            bultos: true,
            product: { select: { sku: true, name: true, unitsPerBox: true } },
          },
        },
        pickerAssignments: {
          select: { user: USER_NAME },
          orderBy: { assignedAt: 'asc' },
        },
        pickTasks: {
          where: { status: { not: PickTaskStatus.CANCELLED } },
          select: {
            orderItemId: true,
            sequence: true,
            quantity: true,
            pickedQty: true,
            status: true,
            shortReason: true,
            notes: true,
            replacesTaskId: true,
            pickedBy: USER_NAME,
            location: { select: { code: true, warehouse: WAREHOUSE_REF } },
          },
          orderBy: { sequence: 'asc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(
        `El pedido con ID "${id}" no fue encontrado.`,
      );
    }

    return toOrderPrintSheet(order);
  }

  /** Expresos disponibles para el alta de pedidos. */
  listTransports() {
    return this.prisma.transport.findMany({
      select: { id: true, name: true, address: true, phone: true },
      orderBy: { name: 'asc' },
    });
  }

  // ---------------------------------------------------------------------------
  // CANCELACIÓN
  // ---------------------------------------------------------------------------

  /**
   * Sólo se cancelan pedidos sin bultos ya retirados de las ubicaciones
   * (stock intacto). Libera las reservas de las tareas de picking pendientes
   * (las de un pedido PENDING se reservaron en el alta).
   */
  async cancel(id: string, dto: CancelOrderDto, actor: AuthenticatedUser) {
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ id: string; status: OrderStatus; order_number: string }>
      >`SELECT id, status, order_number FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
      const order = locked[0];
      if (!order) throw new NotFoundException('Pedido no encontrado.');

      if (!CANCELLABLE.includes(order.status)) {
        throw new ConflictException(
          `No se puede cancelar un pedido en estado ${order.status}.`,
        );
      }

      const picked = await tx.orderItem.aggregate({
        where: { orderId: id },
        _sum: { pickedQty: true },
      });
      if ((picked._sum.pickedQty ?? 0) > 0) {
        throw new ConflictException(
          'El pedido ya tiene bultos pickeados. Devuélvalos a su ubicación antes de cancelarlo.',
        );
      }

      await releasePendingReservations(tx, id);

      await tx.order.update({
        where: { id },
        data: { status: OrderStatus.CANCELLED },
      });

      await this.audit.log(
        {
          actor,
          action: AuditAction.ORDER_CANCELLED,
          entityType: AuditEntity.ORDER,
          entityId: id,
          metadata: { orderNumber: order.order_number, reason: dto.reason },
        },
        tx,
      );
    });

    return this.findOne(id, actor);
  }

  // ---------------------------------------------------------------------------

  private assertNoShortages(
    lines: Array<{
      productId: string;
      sku: string;
      requested: number;
      available: number;
    }>,
  ) {
    const shortages = lines.filter((l) => l.requested > l.available);
    if (shortages.length === 0) return;
    throw new BadRequestException({
      statusCode: 400,
      error: 'Bad Request',
      message: `Stock disponible insuficiente: ${shortages
        .map((l) => `${l.sku} (pedido ${l.requested}, disponible ${l.available})`)
        .join(', ')}.`,
      shortages,
    });
  }

  /**
   * Vendedor del pedido (opcional):
   *  - Si carga un Vendedor, el vendedor es él mismo (no puede elegir otro).
   *  - Si carga un Administrador o Gestor puede dejarlo vacío; si lo indica,
   *    debe ser un usuario activo con rol Vendedor.
   */
  private async resolveSeller(
    dto: CreateOrderDto,
    actor: AuthenticatedUser,
  ): Promise<string | null> {
    if (isSeller(actor.role)) {
      if (dto.sellerId && dto.sellerId !== actor.id) {
        throw new ForbiddenException(
          'Un vendedor sólo puede cargar pedidos a su propio nombre.',
        );
      }
      return actor.id;
    }

    if (!dto.sellerId) return null;

    const seller = await this.prisma.user.findUnique({
      where: { id: dto.sellerId },
      select: { role: true, isActive: true },
    });
    if (!seller || !seller.isActive || seller.role !== UserRole.SELLER) {
      throw new BadRequestException(
        'El vendedor indicado no existe, está inactivo o no tiene rol Vendedor.',
      );
    }
    return dto.sellerId;
  }

  /** Expreso: obligatorio y existente sólo si el envío es por expreso. */
  private async resolveTransport(dto: CreateOrderDto): Promise<string | null> {
    if (dto.shippingType !== ShippingType.EXPRESO) return null;
    if (!dto.transportId) {
      throw new BadRequestException('Seleccione el expreso del envío.');
    }
    const transport = await this.prisma.transport.findUnique({
      where: { id: dto.transportId },
      select: { id: true },
    });
    if (!transport) {
      throw new BadRequestException('El expreso indicado no existe.');
    }
    return transport.id;
  }

  private present<T extends object>(order: T, actor: AuthenticatedUser): T {
    return canViewMoney(actor.role) ? order : stripMoney(order);
  }
}
