// dsh-logistica/src/orders/services/picking.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import {
  OrderStatus,
  PickShortReason,
  PickTaskStatus,
  Prisma,
  StockRequestType,
  UserRole,
} from '@prisma/client';
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
  consumeReservedStock,
  purgeEmptyInventory,
  releasePendingReservations,
} from './pick-reservations';
import { planAndReserve, reserveReplacement } from './pick-planner';

type Tx = Prisma.TransactionClient;

/** Motivos cuyo faltante queda en cuarentena + solicitud de ajuste. */
const QUARANTINE_REASONS = new Set<PickShortReason>([
  PickShortReason.DAMAGED,
  PickShortReason.NOT_FOUND,
]);

export const SHORT_REASON_LABELS: Record<PickShortReason, string> = {
  DAMAGED: 'roto / en mal estado',
  NOT_FOUND: 'no estaba en la ubicación',
  OTHER: 'otro motivo',
};

/** Resultado de confirmar con faltante, para el aviso al picker. */
export interface ShortageOutcome {
  taskId: string;
  missing: number;
  shortReason: PickShortReason;
  quarantined: number;
  stockRequestId: string | null;
  /** Bultos que no se pudieron cubrir: faltante justificado. */
  uncovered: number;
  replacements: Array<{
    taskId: string;
    quantity: number;
    locationCode: string;
    warehouseName: string;
    assignedToMe: boolean;
  }>;
}

const PICKABLE_ROLES: UserRole[] = [
  UserRole.PICKER,
  UserRole.WAREHOUSE_MANAGER,
  UserRole.ADMIN,
];

interface LockedOrderRow {
  id: string;
  status: OrderStatus;
  picker_id: string | null;
  /** Sólo pedidos anteriores al multi-depósito; los nuevos lo tienen en NULL. */
  source_warehouse_id: string | null;
  order_number: string;
}

interface LockedTaskRow {
  id: string;
  order_id: string;
  order_item_id: string;
  product_id: string;
  location_id: string;
  warehouse_id: string;
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

        // Los pedidos nuevos ya tienen el recorrido planificado y el stock
        // reservado desde el alta. Sólo se planifica acá si el pedido no
        // tiene tareas (pedidos anteriores al multi-depósito, o tras una
        // replanificación sin stock).
        const existing = await tx.pickTask.findMany({
          where: { orderId, status: PickTaskStatus.PENDING },
          select: { locationId: true, quantity: true },
        });

        let plannedTasks = existing.length;
        let shortages: Array<{
          orderItemId: string;
          productId: string;
          missing: number;
        }> = [];
        let warehouseOrder: string[] = [];

        if (existing.length === 0) {
          const items = await tx.orderItem.findMany({
            where: { orderId },
            select: { id: true, productId: true, bultos: true },
          });
          const { plan } = await planAndReserve(tx, {
            orderId,
            items,
            // Pedido histórico de un solo depósito: se respeta su depósito.
            warehouseIds: order.source_warehouse_id
              ? [order.source_warehouse_id]
              : undefined,
            allowShortages: true,
          });
          plannedTasks = plan.picks.length;
          shortages = plan.shortages;
          warehouseOrder = plan.warehouseOrder;
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

        shortageCount = shortages.length;

        await this.audit.log(
          {
            actor: user,
            action: AuditAction.PICKING_STARTED,
            entityType: AuditEntity.ORDER,
            entityId: orderId,
            metadata: {
              orderNumber: order.order_number,
              tasks: plannedTasks,
              plannedAtCreation: existing.length > 0,
              warehouses: warehouseOrder,
              shortages,
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
  ): Promise<PickingDetailView & { shortageOutcome: ShortageOutcome | null }> {
    let warehouseId = '';
    let outcome: ShortageOutcome | null = null;

    await this.prisma.$transaction(
      async (tx) => {
        // Orden de bloqueo fijo (pedido -> tarea) para evitar deadlocks
        const order = await this.lockOrder(tx, orderId);
        await this.assertCanAccess(tx, orderId, user);

        if (order.status !== OrderStatus.IN_PICKING) {
          throw new ConflictException(
            `El pedido debe estar IN_PICKING (actual: ${order.status}).`,
          );
        }

        const taskRows = await tx.$queryRaw<LockedTaskRow[]>`
          SELECT t.id, t.order_id, t.order_item_id, t.product_id, t.location_id,
                 l.warehouse_id, t.inventory_id, t.lot_number, t.quantity, t.status
          FROM pick_tasks t
          JOIN locations l ON l.id = t.location_id
          WHERE t.id = ${taskId}::uuid AND t.order_id = ${orderId}::uuid
          FOR UPDATE OF t
        `;
        const task = taskRows[0];
        if (!task)
          throw new NotFoundException('Tarea de picking no encontrada.');
        // El depósito de la toma es el de su ubicación (pedido multi-depósito)
        warehouseId = task.warehouse_id;

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

        const missing = task.quantity - dto.quantity;
        const notes = dto.notes?.trim() || null;
        if (missing > 0 && !dto.shortReason) {
          throw new BadRequestException(
            'Indique el motivo del faltante (roto / no estaba / otro).',
          );
        }
        if (missing > 0 && dto.shortReason === PickShortReason.OTHER && !notes) {
          throw new BadRequestException(
            'Con motivo "Otro" la observación es obligatoria.',
          );
        }
        const shortReason = missing > 0 ? dto.shortReason! : null;

        // Roto / no estaba: los bultos faltantes quedan en CUARENTENA (siguen
        // reservados, nadie más los puede tomar) hasta que un Gestor apruebe
        // o rechace la solicitud de ajuste. "Otro": se liberan como siempre.
        const heldQty = shortReason && QUARANTINE_REASONS.has(shortReason)
          ? missing
          : 0;

        const consumed = await consumeReservedStock(
          tx,
          task.inventory_id,
          dto.quantity,
          task.quantity - heldQty,
        );
        if (!consumed) {
          throw new ConflictException(
            'El stock reservado de la ubicación no es consistente. Avise al Gestor.',
          );
        }

        if (dto.quantity > 0) {
          await tx.stockMovement.create({
            data: {
              warehouseId: task.warehouse_id,
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
            shortReason,
            notes,
          },
        });

        let stockRequestId: string | null = null;
        if (heldQty > 0) {
          const inv = await tx.inventory.findUnique({
            where: { id: task.inventory_id },
            select: { quantity: true },
          });
          const systemQty = inv?.quantity ?? 0;
          // pickTaskId es único: una tarea genera a lo sumo una solicitud
          const request = await tx.stockAdjustmentRequest.create({
            data: {
              inventoryId: task.inventory_id,
              warehouseId: task.warehouse_id,
              locationId: task.location_id,
              productId: task.product_id,
              lotNumber: task.lot_number,
              type: StockRequestType.ADJUSTMENT,
              systemQty,
              countedQty: systemQty - heldQty,
              quantityDelta: -heldQty,
              heldQty,
              pickTaskId: taskId,
              reason:
                `Faltante en picking ${order.order_number}: ${SHORT_REASON_LABELS[shortReason!]}${notes ? ` — ${notes}` : ''}`.slice(
                  0,
                  255,
                ),
              requestedById: user.id,
            },
            select: { id: true },
          });
          stockRequestId = request.id;
        } else {
          await purgeEmptyInventory(tx, task.inventory_id);
        }

        // Reemplazo automático: buscar los bultos faltantes en otras
        // ubicaciones (mismo depósito primero, después otros depósitos).
        if (missing > 0) {
          const replacement = await reserveReplacement(tx, {
            orderId,
            original: {
              id: task.id,
              orderItemId: task.order_item_id,
              productId: task.product_id,
              locationId: task.location_id,
              warehouseId: task.warehouse_id,
            },
            missing,
            pickerId: user.id,
            restrictToWarehouseId: order.source_warehouse_id,
          });
          outcome = {
            taskId,
            missing,
            shortReason: shortReason!,
            quarantined: heldQty,
            stockRequestId,
            uncovered: replacement.uncovered,
            replacements: replacement.created.map((r) => ({
              taskId: r.taskId,
              quantity: r.quantity,
              locationCode: r.locationCode,
              warehouseName: r.warehouseName,
              assignedToMe: r.assignedToId === user.id,
            })),
          };
        }

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
              shortReason,
              notes,
              quarantined: heldQty,
              stockRequestId,
              replacements: outcome?.replacements.map((r) => ({
                taskId: r.taskId,
                quantity: r.quantity,
                location: r.locationCode,
                warehouse: r.warehouseName,
              })),
              uncovered: outcome?.uncovered ?? 0,
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
    const detail = await this.getDetail(orderId, user);
    return { ...detail, shortageOutcome: outcome };
  }

  /**
   * Libera reservas pendientes (p. ej. al reasignar o replanificar). Sólo
   * supervisores. Si no se pickeó nada, el pedido vuelve a PENDING con un
   * recorrido nuevo (y su stock nuevamente reservado).
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

      let replanned: { tasks: number; shortages: number } | null = null;

      if ((picked._sum.pickedQty ?? 0) === 0) {
        await tx.pickTask.deleteMany({ where: { orderId } });
        await tx.order.update({
          where: { id: orderId },
          data: { status: OrderStatus.PENDING, pickingStartedAt: null },
        });

        // Los pedidos pendientes mantienen su stock reservado: se vuelve a
        // planificar con el stock actual de todos los depósitos.
        const items = await tx.orderItem.findMany({
          where: { orderId },
          select: { id: true, productId: true, bultos: true },
        });
        const { plan } = await planAndReserve(tx, {
          orderId,
          items,
          warehouseIds: order.source_warehouse_id
            ? [order.source_warehouse_id]
            : undefined,
          allowShortages: true,
        });
        replanned = {
          tasks: plan.picks.length,
          shortages: plan.shortages.length,
        };
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
          metadata: {
            orderNumber: order.order_number,
            released: true,
            replanned,
          },
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
