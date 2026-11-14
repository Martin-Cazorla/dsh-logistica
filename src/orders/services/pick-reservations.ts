// dsh-logistica/src/orders/services/pick-reservations.ts

import { PickTaskStatus, Prisma } from '@prisma/client';

type Tx = Prisma.TransactionClient;

/**
 * Operaciones atómicas sobre Inventory.reserved / Inventory.quantity.
 * Todas son UPDATE condicionales: si la condición no se cumple (otra
 * transacción consumió el stock) devuelven false y el llamador aborta.
 * Los CHECK de la BD (quantity >= 0, reserved <= quantity) son la última
 * línea de defensa.
 */

export async function reserveStock(
  tx: Tx,
  inventoryId: string,
  quantity: number,
): Promise<boolean> {
  const count = await tx.$executeRaw`
    UPDATE inventories
    SET reserved = reserved + ${quantity}, updated_at = NOW()
    WHERE id = ${inventoryId}::uuid AND quantity - reserved >= ${quantity}
  `;
  return count === 1;
}

export async function releaseReservation(
  tx: Tx,
  inventoryId: string,
  quantity: number,
): Promise<void> {
  if (quantity <= 0) return;
  await tx.$executeRaw`
    UPDATE inventories
    SET reserved = GREATEST(reserved - ${quantity}, 0), updated_at = NOW()
    WHERE id = ${inventoryId}::uuid
  `;
}

/**
 * Retira físicamente `picked` bultos y libera la reserva completa de la tarea
 * (`reservedForTask`). Si picked < reservedForTask (faltante) la diferencia
 * vuelve a quedar disponible.
 */
export async function consumeReservedStock(
  tx: Tx,
  inventoryId: string,
  picked: number,
  reservedForTask: number,
): Promise<boolean> {
  const count = await tx.$executeRaw`
    UPDATE inventories
    SET quantity = quantity - ${picked},
        reserved = reserved - ${reservedForTask},
        updated_at = NOW()
    WHERE id = ${inventoryId}::uuid
      AND reserved >= ${reservedForTask}
      AND quantity >= ${picked}
  `;
  return count === 1;
}

/** Borra el registro sólo si quedó en cero y sin reservas. */
export async function purgeEmptyInventory(tx: Tx, inventoryId: string) {
  await tx.inventory.deleteMany({
    where: { id: inventoryId, quantity: 0, reserved: 0 },
  });
}

/** Cancela las tareas pendientes de un pedido y libera su stock reservado. */
export async function releasePendingReservations(tx: Tx, orderId: string) {
  const pending = await tx.pickTask.findMany({
    where: { orderId, status: PickTaskStatus.PENDING },
    select: { id: true, inventoryId: true, quantity: true },
  });

  for (const task of pending) {
    if (task.inventoryId) {
      await releaseReservation(tx, task.inventoryId, task.quantity);
    }
  }

  if (pending.length > 0) {
    await tx.pickTask.updateMany({
      where: { id: { in: pending.map((t) => t.id) } },
      data: { status: PickTaskStatus.CANCELLED },
    });
  }
}

// =============================================================================
// STOCK DISPONIBLE (fuente única)
// =============================================================================

export interface AvailableStockRow {
  productId: string;
  warehouseId: string;
  available: number;
}

type QueryDb = { $queryRaw: Tx['$queryRaw'] };

/**
 * Disponible = Σ (quantity − reserved) en ubicaciones NO bloqueadas.
 *
 * Es exactamente lo que reserveStock() / la planificación del picking pueden
 * tomar: reserveStock exige `quantity - reserved >= n` y el plan de recorrido
 * ignora ubicaciones bloqueadas. Lo usan el catálogo de pedidos, la consulta
 * de stock del Vendedor y la validación del alta de pedidos, para que todos
 * muestren el mismo número.
 */
export async function fetchAvailableStock(
  db: QueryDb,
  filter: { productIds?: string[]; warehouseIds?: string[] } = {},
): Promise<AvailableStockRow[]> {
  const conds: Prisma.Sql[] = [Prisma.sql`l.is_blocked = false`];
  if (filter.productIds) {
    if (filter.productIds.length === 0) return [];
    conds.push(Prisma.sql`i.product_id = ANY(${filter.productIds}::uuid[])`);
  }
  if (filter.warehouseIds) {
    if (filter.warehouseIds.length === 0) return [];
    conds.push(
      Prisma.sql`i.warehouse_id = ANY(${filter.warehouseIds}::uuid[])`,
    );
  }

  const rows = await db.$queryRaw<
    Array<{ product_id: string; warehouse_id: string; available: number }>
  >`
    SELECT i.product_id, i.warehouse_id,
           GREATEST(SUM(i.quantity - i.reserved), 0)::int AS available
    FROM inventories i
    JOIN locations l ON l.id = i.location_id
    WHERE ${Prisma.join(conds, ' AND ')}
    GROUP BY i.product_id, i.warehouse_id
  `;

  return rows.map((r) => ({
    productId: r.product_id,
    warehouseId: r.warehouse_id,
    available: Number(r.available),
  }));
}
