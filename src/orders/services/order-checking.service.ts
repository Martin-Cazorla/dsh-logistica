// dsh-logistica/src/orders/services/order-checking.service.ts

import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { OrderStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction, AuditEntity } from '../../audit/audit.actions';
import { ConfirmCheckingDto } from '../dto/checking-order.dto';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import {
  CHECKING_ORDER_SELECT,
  CheckingOrderView,
  toCheckingOrderView,
} from '../mappers/order-view.mapper';

interface LockedOrderRow {
  id: string;
  status: OrderStatus;
  picker_id: string | null;
  order_number: string;
  route_id: string | null;
}

/**
 * PUNTO DE CONTROL 1 — Auditoría en playa (OPCIONAL).
 * PICKED -> CHECKED. Las hojas de ruta aceptan pedidos PICKED o CHECKED; el
 * control obligatorio es el Punto de Control 2 (carga y descarga), ver
 * RoutesService.
 */
@Injectable()
export class OrderCheckingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getPickedOrders(): Promise<CheckingOrderView[]> {
    const orders = await this.prisma.order.findMany({
      where: { status: OrderStatus.PICKED, routeId: null },
      select: CHECKING_ORDER_SELECT,
      orderBy: { pickedAt: 'asc' },
      take: 200,
    });
    return orders.map(toCheckingOrderView);
  }

  async getOrderForChecking(orderId: string): Promise<CheckingOrderView> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: CHECKING_ORDER_SELECT,
    });
    if (!order) {
      throw new NotFoundException(
        `El pedido con ID "${orderId}" no fue encontrado.`,
      );
    }
    return toCheckingOrderView(order);
  }

  /**
   * Reglas:
   * - FOR UPDATE del pedido (dos auditores no aprueban en simultáneo).
   * - Segregación de funciones: ningún operario que haya armado el pedido
   *   (asignado, picker principal, o que haya confirmado alguna línea) puede
   *   auditarlo, salvo ADMIN.
   * - Se persiste quién, cuándo y cuánto contó por ítem.
   */
  async verifyOrderItems(
    orderId: string,
    auditor: AuthenticatedUser,
    dto: ConfirmCheckingDto,
  ): Promise<CheckingOrderView> {
    await this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<LockedOrderRow[]>`
          SELECT id, status, picker_id, order_number, route_id
          FROM orders
          WHERE id = ${orderId}::uuid
          FOR UPDATE
        `;
        const order = locked[0];

        if (!order) {
          throw new NotFoundException(
            `El pedido con ID "${orderId}" no fue encontrado.`,
          );
        }

        if (order.status !== OrderStatus.PICKED) {
          throw new ConflictException(
            `El pedido debe estar en estado PICKED para realizar el control de armado. Estado actual: "${order.status}".`,
          );
        }
        if (order.route_id) {
          throw new ConflictException(
            'El pedido ya fue consolidado en una hoja de ruta.',
          );
        }

        const [items, assignments, taskPickers] = await Promise.all([
          tx.orderItem.findMany({
            where: { orderId },
            select: {
              id: true,
              bultos: true,
              pickedQty: true,
              pickerId: true,
              product: { select: { sku: true } },
            },
          }),
          tx.orderPickerAssignment.findMany({
            where: { orderId },
            select: { userId: true },
          }),
          tx.pickTask.findMany({
            where: { orderId, pickedById: { not: null } },
            select: { pickedById: true },
            distinct: ['pickedById'],
          }),
        ]);

        if (auditor.role !== UserRole.ADMIN) {
          const builders = new Set<string>([
            ...(order.picker_id ? [order.picker_id] : []),
            ...items.map((i) => i.pickerId).filter((x): x is string => !!x),
            ...assignments.map((a) => a.userId),
            ...taskPickers
              .map((t) => t.pickedById)
              .filter((x): x is string => !!x),
          ]);
          if (builders.has(auditor.id)) {
            throw new ForbiddenException(
              'Segregación de funciones: el control debe realizarlo un operario distinto al que armó el pedido.',
            );
          }
        }

        const counted = new Map<string, number>();
        for (const line of dto.itemsChecked) {
          counted.set(line.orderItemId, line.quantityChecked);
        }

        const unknown = [...counted.keys()].filter(
          (id) => !items.some((i) => i.id === id),
        );
        if (unknown.length > 0) {
          throw new BadRequestException(
            `Hay ítems que no pertenecen al pedido ${order.order_number}: ${unknown.join(', ')}.`,
          );
        }

        const discrepancies: string[] = [];
        for (const item of items) {
          const checked = counted.get(item.id) ?? 0;
          if (item.pickedQty < item.bultos) {
            discrepancies.push(
              `${item.product.sku}: pickeado ${item.pickedQty}/${item.bultos}`,
            );
          } else if (checked !== item.pickedQty) {
            discrepancies.push(
              `${item.product.sku}: contado ${checked}, pickeado ${item.pickedQty}`,
            );
          }
        }

        if (discrepancies.length > 0) {
          throw new BadRequestException(
            `El pedido presenta inconsistencias en el armado: ${discrepancies.join(' | ')}.`,
          );
        }

        for (const item of items) {
          await tx.orderItem.update({
            where: { id: item.id },
            data: { checkedQty: counted.get(item.id) ?? 0 },
          });
        }

        await tx.order.update({
          where: { id: orderId },
          data: {
            status: OrderStatus.CHECKED,
            checkedById: auditor.id,
            checkedAt: new Date(),
            checkingNotes: dto.notes?.trim() || null,
          },
        });

        await this.audit.log(
          {
            actor: auditor,
            action: AuditAction.CHECKPOINT1_APPROVED,
            entityType: AuditEntity.ORDER,
            entityId: orderId,
            metadata: {
              orderNumber: order.order_number,
              items: items.map((i) => ({
                orderItemId: i.id,
                picked: i.pickedQty,
                checked: counted.get(i.id) ?? 0,
              })),
              notes: dto.notes ?? null,
            },
          },
          tx,
        );
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
    );

    return this.getOrderForChecking(orderId);
  }
}
