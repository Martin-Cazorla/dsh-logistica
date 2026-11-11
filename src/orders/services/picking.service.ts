// dsh-logistica/src/orders/services/picking.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { OrderStatus, PickTaskStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction, AuditEntity } from '../../audit/audit.actions';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { isSupervisor } from '../../auth/permissions';
import { InventoryGateway } from '../../inventory/inventory.gateway';
import { AssignPickersDto, ConfirmPickTaskDto } from '../dto/picking-order.dto';
import {
  PICKING_DETAIL_SELECT,
  PICKING_LIST_SELECT,
  PickingDetailView,
  PickingListView,
  toPickingDetailView,
  toPickingListView,
} from '../mappers/order-view.mapper';
import {
  PickDemand,
  StockCandidate,
  planPicks,
  rankLocationsForRoute,
  RoutableLocation,
} from '../picking/pick-route';
import {
  consumeReservedStock,
  purgeEmptyInventory,
  releasePendingReservations,
  reserveStock,
} from './pick-reservations';

type Tx = Prisma.TransactionClient;

const PICKABLE_ROLES: UserRole[] = [
  UserRole.PICKER,
  UserRole.WAREHOUSE_MANAGER,
  UserRole.ADMIN,
];

interface LockedOrderRow {
  id: string;
  status: OrderStatus;
  picker_id: string | null;
  source_warehouse_id: string;
  order_number: string;
}

interface CandidateRow {
  inventory_id: string;
  product_id: string;
  location_id: string;
  lot_number: string;
  quantity: number;
  reserved: number;
  expires_at: Date | null;
  code: string;
  aisle: string;
  rack: string;
  position: string;
  route_order: number | null;
}

interface LockedTaskRow {
  id: string;
  order_id: string;
  order_item_id: string;
  product_id: string;
  location_id: string;
  inventory_id: string | null;
  lot_number: string;
  quantity: number;
  status: PickTaskStatus;
}

@Injectable()
export class PickingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly inventoryGateway: InventoryGateway,
  ) {}

  // ===========================================================================
  // ASIGNACIÓN MULTIUSUARIO
  // ===========================================================================

  async assignPickers(
    orderId: string,
    dto: AssignPickersDto,
    actor: AuthenticatedUser,
  ): Promise<PickingDetailView> {
    const pickerIds = [...new Set(dto.pickerIds)];

    const users = await this.prisma.user.findMany({
      where: { id: { in: pickerIds } },
      select: { id: true, role: true, isActive: true },
    });
    const invalid = pickerIds.filter((id) => {
      const u = users.find((x) => x.id === id);
      return !u || !u.isActive || !PICKABLE_ROLES.includes(u.role);
    });
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Usuarios no válidos para picking (inexistentes, inactivos o sin rol de depósito): ${invalid.join(', ')}`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      if (
        order.status !== OrderStatus.PENDING &&
        order.status !== OrderStatus.IN_PICKING
      ) {
        throw new ConflictException(
          `Sólo se asignan pickers a pedidos PENDING o IN_PICKING (actual: ${order.status}).`,
        );
      }

      const current = await tx.orderPickerAssignment.findMany({
        where: { orderId },
        select: { userId: true },
      });
      const currentIds = current.map((c) => c.userId);
      const toAdd = pickerIds.filter((id) => !currentIds.includes(id));
      const toRemove = currentIds.filter((id) => !pickerIds.includes(id));

      if (toRemove.length > 0) {
        await tx.orderPickerAssignment.deleteMany({
          where: { orderId, userId: { in: toRemove } },
        });
      }
      if (toAdd.length > 0) {
        await tx.orderPickerAssignment.createMany({
          data: toAdd.map((userId) => ({
            orderId,
            userId,
            assignedById: actor.id,
          })),
          skipDuplicates: true,
        });
      }

      await tx.order.update({
        where: { id: orderId },
        data: { pickerId: pickerIds[0] },
      });

      await this.audit.log(
        {
          actor,
          action: AuditAction.PICKERS_ASSIGNED,
          entityType: AuditEntity.ORDER,
          entityId: orderId,
          metadata: {
            orderNumber: order.order_number,
            pickerIds,
            added: toAdd,
            removed: toRemove,
          },
        },
        tx,
      );
    });

    return this.getDetail(orderId, actor);
  }

  // ===========================================================================
  // CONSULTAS
  // ===========================================================================

  /**
   * PICKER: SÓLO los pedidos que le fueron asignados.
   * Supervisores: todos los PENDING / IN_PICKING (para asignar y seguir).
   */
  async getMyPickings(user: AuthenticatedUser): Promise<PickingListView[]> {
    const where: Prisma.OrderWhereInput = {
      status: { in: [OrderStatus.PENDING, OrderStatus.IN_PICKING] },
      ...(isSupervisor(user.role)
        ? {}
        : { pickerAssignments: { some: { userId: user.id } } }),
    };

    const orders = await this.prisma.order.findMany({
      where,
      select: PICKING_LIST_SELECT,
      orderBy: { createdAt: 'asc' },
      take: 300,
    });

    return orders.map(toPickingListView);
  }

  async getDetail(
    orderId: string,
    user: AuthenticatedUser,
  ): Promise<PickingDetailView> {
    await this.assertCanAccess(this.prisma, orderId, user);

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: PICKING_DETAIL_SELECT,
    });
    if (!order) {
      throw new NotFoundException(`El pedido "${orderId}" no fue encontrado.`);
    }
    return toPickingDetailView(order);
  }

  // ===========================================================================
  // INICIO: PLANIFICACIÓN DE LA RUTA + RESERVA DE STOCK
  // ===========================================================================

  /**
   * PENDING -> IN_PICKING. Genera las tareas del recorrido unidireccional y
   * reserva el stock de cada una. Idempotente: si ya está IN_PICKING devuelve
   * el recorrido existente.
   *
   * Concurrencia:
   *  - FOR UPDATE sobre el pedido: dos pickers que inician a la vez no generan
   *    dos planes.
   *  - FOR UPDATE sobre las filas de inventario candidatas: dos pedidos que
   *    planifican a la vez no reservan el mismo bulto.
   */
  async start(orderId: string, user: AuthenticatedUser) {
    let shortageCount = 0;

    await this.prisma.$transaction(
      async (tx) => {
        const order = await this.lockOrder(tx, orderId);
        await this.assertCanAccess(tx, orderId, user);

        if (order.status === OrderStatus.IN_PICKING) return;
        if (order.status !== OrderStatus.PENDING) {
          throw new ConflictException(
            `El pedido no está en estado PENDING. Estado actual: "${order.status}".`,
          );
        }

        const items = await tx.orderItem.findMany({
          where: { orderId },
          select: { id: true, productId: true, bultos: true },
        });

        const candidates = await tx.$queryRaw<CandidateRow[]>`
          SELECT i.id AS inventory_id, i.product_id, i.location_id, i.lot_number,
                 i.quantity, i.reserved, i.expires_at,
                 l.code, l.aisle, l.rack, l.position, l.route_order
          FROM inventories i
          JOIN locations l ON l.id = i.location_id
          WHERE i.warehouse_id = ${order.source_warehouse_id}::uuid
            AND i.product_id = ANY(${items.map((i) => i.productId)}::uuid[])
            AND l.is_blocked = false
            AND i.quantity - i.reserved > 0
          ORDER BY i.id
          FOR UPDATE OF i
        `;

        const locationsById = new Map<string, RoutableLocation>();
        for (const c of candidates) {
          locationsById.set(c.location_id, {
            id: c.location_id,
            code: c.code,
            aisle: c.aisle,
            rack: c.rack,
            position: c.position,
            routeOrder: c.route_order,
          });
        }

        const demands: PickDemand[] = items.map((i) => ({
          orderItemId: i.id,
          productId: i.productId,
          quantity: i.bultos,
        }));
        const stock: StockCandidate[] = candidates.map((c) => ({
          inventoryId: c.inventory_id,
          productId: c.product_id,
          locationId: c.location_id,
          lotNumber: c.lot_number,
          available: Number(c.quantity) - Number(c.reserved),
          expiresAt: c.expires_at,
        }));

        // 1ª pasada: elección de stock (FEFO / menos paradas / recorrido)
        const preliminary = planPicks(
          demands,
          stock,
          rankLocationsForRoute([...locationsById.values()]),
        );

        // 2ª pasada: el sentido serpentina se recalcula sólo sobre las zonas
        // que realmente se visitan, y se renumera la secuencia.
        const visited = [
          ...new Set(preliminary.picks.map((p) => p.locationId)),
        ].map((id) => locationsById.get(id)!);
        const finalRanks = rankLocationsForRoute(visited);
        const picks = [...preliminary.picks]
          .sort(
            (a, b) =>
              finalRanks.get(a.locationId)!.rank -
              finalRanks.get(b.locationId)!.rank,
          )
          .map((p, i) => ({ ...p, sequence: i + 1 }));

        for (const pick of picks) {
          const ok = await reserveStock(tx, pick.inventoryId, pick.quantity);
          if (!ok) {
            throw new ConflictException(
              'El stock cambió mientras se planificaba el recorrido. Reintente.',
            );
          }
        }

        if (picks.length > 0) {
          await tx.pickTask.createMany({
            data: picks.map((p) => ({
              orderId,
              orderItemId: p.orderItemId,
              productId: p.productId,
              locationId: p.locationId,
              inventoryId: p.inventoryId,
              lotNumber: p.lotNumber,
              sequence: p.sequence,
              quantity: p.quantity,
            })),
          });
        }

        await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.IN_PICKING,
            pickingStartedAt: new Date(),
            pickerId: order.picker_id ?? user.id,
          },
        });

        // Un supervisor que inicia sin estar asignado queda registrado
        if (!isSupervisor(user.role)) {
          await tx.orderPickerAssignment.createMany({
            data: [{ orderId, userId: user.id, assignedById: user.id }],
            skipDuplicates: true,
          });
        }

        shortageCount = preliminary.shortages.length;

        await this.audit.log(
          {
            actor: user,
            action: AuditAction.PICKING_STARTED,
            entityType: AuditEntity.ORDER,
            entityId: orderId,
            metadata: {
              orderNumber: order.order_number,
              tasks: picks.length,
              zones: [
                ...new Set(
                  picks.map((p) => finalRanks.get(p.locationId)!.zone),
                ),
              ],
              shortages: preliminary.shortages,
            },
          },
          tx,
        );
      },
      { timeout: 20000 },
    );

    const detail = await this.getDetail(orderId, user);
    return { ...detail, plannedWithShortages: shortageCount > 0 };
  }

  // ===========================================================================
  // CONFIRMACIÓN DE UNA LÍNEA DEL RECORRIDO
  // ===========================================================================

  async confirmTask(
    orderId: string,
    taskId: string,
    dto: ConfirmPickTaskDto,
    user: AuthenticatedUser,
  ): Promise<PickingDetailView> {
    let warehouseId = '';

    await this.prisma.$transaction(
      async (tx) => {
        // Orden de bloqueo fijo (pedido -> tarea) para evitar deadlocks
        const order = await this.lockOrder(tx, orderId);
        await this.assertCanAccess(tx, orderId, user);
        warehouseId = order.source_warehouse_id;

        if (order.status !== OrderStatus.IN_PICKING) {
          throw new ConflictException(
            `El pedido debe estar IN_PICKING (actual: ${order.status}).`,
          );
        }

        const taskRows = await tx.$queryRaw<LockedTaskRow[]>`
          SELECT id, order_id, order_item_id, product_id, location_id,
                 inventory_id, lot_number, quantity, status
          FROM pick_tasks
          WHERE id = ${taskId}::uuid AND order_id = ${orderId}::uuid
          FOR UPDATE
        `;
        const task = taskRows[0];
        if (!task)
          throw new NotFoundException('Tarea de picking no encontrada.');

        if (task.status !== PickTaskStatus.PENDING) {
          throw new ConflictException(
            'Esta línea ya fue confirmada por otro operario.',
          );
        }
        if (dto.quantity > task.quantity) {
          throw new BadRequestException(
            `No puede tomar más de lo planificado (${task.quantity} bultos).`,
          );
        }
        if (!task.inventory_id) {
          throw new ConflictException(
            'El registro de stock de esta línea ya no existe. Reasigne el pedido.',
          );
        }

        const consumed = await consumeReservedStock(
          tx,
          task.inventory_id,
          dto.quantity,
          task.quantity,
        );
        if (!consumed) {
          throw new ConflictException(
            'El stock reservado de la ubicación no es consistente. Avise al Gestor.',
          );
        }

        if (dto.quantity > 0) {
          await tx.stockMovement.create({
            data: {
              warehouseId: order.source_warehouse_id,
              productId: task.product_id,
              sourceLocationId: task.location_id,
              userId: user.id,
              orderId,
              type: 'OUTBOUND',
              quantity: dto.quantity,
              lotNumber: task.lot_number,
              referenceCode: `PICKING_${order.order_number}`.slice(0, 100),
            },
          });

          await tx.orderItem.update({
            where: { id: task.order_item_id },
            data: {
              pickedQty: { increment: dto.quantity },
              pickerId: user.id,
            },
          });
        }

        const now = new Date();
        const status =
          dto.quantity === task.quantity
            ? PickTaskStatus.PICKED
            : PickTaskStatus.SHORT;

        await tx.pickTask.update({
          where: { id: taskId },
          data: {
            pickedQty: dto.quantity,
            status,
            pickedById: user.id,
            pickedAt: now,
          },
        });

        await purgeEmptyInventory(tx, task.inventory_id);

        await this.audit.log(
          {
            actor: user,
            action: AuditAction.PICK_TASK_CONFIRMED,
            entityType: AuditEntity.PICK_TASK,
            entityId: taskId,
            metadata: {
              orderId,
              orderNumber: order.order_number,
              locationId: task.location_id,
              productId: task.product_id,
              lotNumber: task.lot_number,
              planned: task.quantity,
              picked: dto.quantity,
              status,
            },
          },
          tx,
        );

        const remaining = await tx.pickTask.count({
          where: { orderId, status: PickTaskStatus.PENDING },
        });

        if (remaining === 0) {
          await tx.order.update({
            where: { id: orderId },
            data: { status: OrderStatus.PICKED, pickedAt: now },
          });

          const items = await tx.orderItem.findMany({
            where: { orderId },
            select: { bultos: true, pickedQty: true },
          });

          await this.audit.log(
            {
              actor: user,
              action: AuditAction.PICKING_COMPLETED,
              entityType: AuditEntity.ORDER,
              entityId: orderId,
              metadata: {
                orderNumber: order.order_number,
                requested: items.reduce((a, i) => a + i.bultos, 0),
                picked: items.reduce((a, i) => a + i.pickedQty, 0),
              },
            },
            tx,
          );
        }
      },
      { timeout: 15000 },
    );

    this.inventoryGateway.emitOccupancyChanged([warehouseId]);
    return this.getDetail(orderId, user);
  }

  /**
   * Libera reservas pendientes (p. ej. al reasignar o replanificar). Sólo
   * supervisores. El pedido vuelve a PENDING si no se pickeó nada.
   */
  async resetPlan(orderId: string, user: AuthenticatedUser) {
    if (!isSupervisor(user.role)) {
      throw new ForbiddenException('Sólo un Gestor puede replanificar.');
    }

    await this.prisma.$transaction(async (tx) => {
      const order = await this.lockOrder(tx, orderId);
      if (order.status !== OrderStatus.IN_PICKING) {
        throw new ConflictException('Sólo se replanifican pedidos IN_PICKING.');
      }
      await releasePendingReservations(tx, orderId);

      const picked = await tx.orderItem.aggregate({
        where: { orderId },
        _sum: { pickedQty: true },
      });

      if ((picked._sum.pickedQty ?? 0) === 0) {
        await tx.pickTask.deleteMany({ where: { orderId } });
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.PENDING, pickingStartedAt: null },
        });
      } else {
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.PICKED, pickedAt: new Date() },
        });
      }

      await this.audit.log(
        {
          actor: user,
          action: AuditAction.PICKING_PLAN_RESET,
          entityType: AuditEntity.ORDER,
          entityId: orderId,
          metadata: { orderNumber: order.order_number, released: true },
        },
        tx,
      );
    });

    return this.getDetail(orderId, user);
  }

  // ===========================================================================
  // AUXILIARES
  // ===========================================================================

  private async lockOrder(tx: Tx, orderId: string): Promise<LockedOrderRow> {
    const rows = await tx.$queryRaw<LockedOrderRow[]>`
      SELECT id, status, picker_id, source_warehouse_id, order_number
      FROM orders
      WHERE id = ${orderId}::uuid
      FOR UPDATE
    `;
    if (!rows[0]) {
      throw new NotFoundException(`El pedido "${orderId}" no fue encontrado.`);
    }
    return rows[0];
  }

  private async assertCanAccess(
    db: Tx | PrismaService,
    orderId: string,
    user: AuthenticatedUser,
  ) {
    if (isSupervisor(user.role)) return;

    const assignment = await db.orderPickerAssignment.findUnique({
      where: { orderId_userId: { orderId, userId: user.id } },
      select: { id: true },
    });
    if (!assignment) {
      throw new ForbiddenException('Este pedido no le fue asignado.');
    }
  }
}
