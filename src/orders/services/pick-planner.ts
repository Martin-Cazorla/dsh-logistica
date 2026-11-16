// dsh-logistica/src/orders/services/pick-planner.ts

import { ConflictException } from '@nestjs/common';
import { PickTaskStatus, Prisma } from '@prisma/client';
import {
  PickDemand,
  PickPlan,
  ReplacementPick,
  RoutableLocation,
  RouteRank,
  StockCandidate,
  planPicks,
  planReplacement,
  rankLocationsForRoute,
} from '../picking/pick-route';
import { reserveStock } from './pick-reservations';

type Tx = Prisma.TransactionClient;

interface CandidateRow {
  inventory_id: string;
  product_id: string;
  location_id: string;
  warehouse_id: string;
  warehouse_code: string;
  lot_number: string;
  quantity: number;
  reserved: number;
  code: string;
  aisle: string;
  rack: string;
  position: string;
  route_order: number | null;
}

interface LockedCandidates {
  stock: StockCandidate[];
  ranks: Map<string, RouteRank>;
}

/**
 * Stock disponible (físico − reservado; la cuarentena sigue reservada) en
 * ubicaciones no bloqueadas de depósitos activos, con bloqueo de filas.
 *
 * FOR UPDATE OF i, ORDER BY i.id: dos transacciones que reservan el mismo
 * producto toman los bloqueos en el mismo orden (sin deadlocks) y la segunda
 * ve el `reserved` ya actualizado por la primera.
 */
async function lockCandidates(
  tx: Tx,
  filter: {
    productIds: string[];
    warehouseIds?: string[];
    excludeLocationIds?: string[];
  },
): Promise<LockedCandidates> {
  if (filter.productIds.length === 0) {
    return { stock: [], ranks: new Map() };
  }

  const conds: Prisma.Sql[] = [
    Prisma.sql`i.product_id = ANY(${filter.productIds}::uuid[])`,
    Prisma.sql`l.is_blocked = false`,
    Prisma.sql`w.is_active = true`,
    Prisma.sql`i.quantity - i.reserved > 0`,
  ];
  if (filter.warehouseIds?.length) {
    conds.push(Prisma.sql`i.warehouse_id = ANY(${filter.warehouseIds}::uuid[])`);
  }
  if (filter.excludeLocationIds?.length) {
    conds.push(
      Prisma.sql`i.location_id <> ALL(${filter.excludeLocationIds}::uuid[])`,
    );
  }

  const rows = await tx.$queryRaw<CandidateRow[]>`
    SELECT i.id AS inventory_id, i.product_id, i.location_id,
           i.warehouse_id, w.code AS warehouse_code, i.lot_number,
           i.quantity, i.reserved,
           l.code, l.aisle, l.rack, l.position, l.route_order
    FROM inventories i
    JOIN locations l ON l.id = i.location_id
    JOIN warehouses w ON w.id = i.warehouse_id
    WHERE ${Prisma.join(conds, ' AND ')}
    ORDER BY i.id
    FOR UPDATE OF i
  `;

  const locationsById = new Map<string, RoutableLocation>();
  for (const c of rows) {
    locationsById.set(c.location_id, {
      id: c.location_id,
      code: c.code,
      aisle: c.aisle,
      rack: c.rack,
      position: c.position,
      routeOrder: c.route_order,
      warehouseId: c.warehouse_id,
      warehouseCode: c.warehouse_code,
    });
  }

  return {
    stock: rows.map((c) => ({
      inventoryId: c.inventory_id,
      productId: c.product_id,
      locationId: c.location_id,
      warehouseId: c.warehouse_id,
      lotNumber: c.lot_number,
      available: Number(c.quantity) - Number(c.reserved),
    })),
    ranks: rankLocationsForRoute([...locationsById.values()]),
  };
}

async function reserveAll(
  tx: Tx,
  picks: Array<{ inventoryId: string; quantity: number }>,
) {
  for (const pick of picks) {
    const ok = await reserveStock(tx, pick.inventoryId, pick.quantity);
    if (!ok) {
      throw new ConflictException(
        'El stock cambió mientras se planificaba el recorrido. Reintente.',
      );
    }
  }
}

export interface PlanAndReserveResult {
  plan: PickPlan;
  /** false si hubo faltantes y allowShortages = false: no se reservó nada. */
  reserved: boolean;
}

/**
 * Planifica el picking multi-depósito de un pedido, reserva el stock y crea
 * las PickTask (una por toma: depósito + ubicación + lote + cantidad).
 *
 * Busca stock en todos los depósitos ACTIVOS (o sólo en `warehouseIds`, para
 * pedidos anteriores al multi-depósito), en ubicaciones no bloqueadas.
 * El llamador debe tener bloqueado el pedido.
 *
 * Con allowShortages = false y faltantes, no reserva ni crea tareas: el
 * llamador decide (el alta rechaza el pedido).
 */
export async function planAndReserve(
  tx: Tx,
  params: {
    orderId: string;
    items: Array<{ id: string; productId: string; bultos: number }>;
    warehouseIds?: string[];
    allowShortages: boolean;
  },
): Promise<PlanAndReserveResult> {
  const { orderId, items } = params;
  const { stock, ranks } = await lockCandidates(tx, {
    productIds: [...new Set(items.map((i) => i.productId))],
    warehouseIds: params.warehouseIds,
  });

  const demands: PickDemand[] = items.map((i) => ({
    orderItemId: i.id,
    productId: i.productId,
    quantity: i.bultos,
  }));
  const plan = planPicks(demands, stock, ranks);

  if (plan.shortages.length > 0 && !params.allowShortages) {
    return { plan, reserved: false };
  }

  await reserveAll(tx, plan.picks);

  if (plan.picks.length > 0) {
    await tx.pickTask.createMany({
      data: plan.picks.map((p) => ({
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

  return { plan, reserved: true };
}

// =============================================================================
// REEMPLAZO ANTE FALTANTE
// =============================================================================

export interface CreatedReplacement extends ReplacementPick {
  taskId: string;
  locationCode: string;
  warehouseName: string;
  assignedToId: string | null;
}

/**
 * Cubre los bultos que faltaron en `original` con stock de otras ubicaciones:
 * reserva y crea tareas de reemplazo enlazadas (replacesTaskId). Las del mismo
 * depósito se asignan a `pickerId`; las de otros depósitos quedan sin asignar.
 *
 * Debe correr en la misma transacción que la confirmación del faltante (la
 * tarea original ya está bloqueada y en estado SHORT, por lo que un segundo
 * "Confirmar con faltante" no llega hasta acá: idempotente).
 */
export async function reserveReplacement(
  tx: Tx,
  params: {
    orderId: string;
    original: {
      id: string;
      orderItemId: string;
      productId: string;
      locationId: string;
      warehouseId: string;
    };
    missing: number;
    pickerId: string;
    /** Legado: pedidos de un único depósito buscan sólo ahí. */
    restrictToWarehouseId?: string | null;
  },
): Promise<{ created: CreatedReplacement[]; uncovered: number }> {
  const { original } = params;

  const { stock, ranks } = await lockCandidates(tx, {
    productIds: [original.productId],
    warehouseIds: params.restrictToWarehouseId
      ? [params.restrictToWarehouseId]
      : undefined,
    excludeLocationIds: [original.locationId],
  });

  const orderWarehouses = await visitedWarehouses(tx, params.orderId);

  const { picks, uncovered } = planReplacement({
    productId: original.productId,
    missing: params.missing,
    originWarehouseId: original.warehouseId,
    orderWarehouses,
    candidates: stock,
    ranks,
  });

  if (picks.length === 0) return { created: [], uncovered };

  await reserveAll(tx, picks);

  const locations = await tx.location.findMany({
    where: { id: { in: picks.map((p) => p.locationId) } },
    select: { id: true, code: true, warehouse: { select: { name: true } } },
  });
  const locById = new Map(locations.map((l) => [l.id, l]));

  const created: CreatedReplacement[] = [];
  for (const p of picks) {
    const assignedToId =
      p.warehouseId === original.warehouseId ? params.pickerId : null;
    const task = await tx.pickTask.create({
      data: {
        orderId: params.orderId,
        orderItemId: original.orderItemId,
        productId: original.productId,
        locationId: p.locationId,
        inventoryId: p.inventoryId,
        lotNumber: p.lotNumber,
        quantity: p.quantity,
        // Provisorio: resequencePending() lo ubica en el recorrido
        sequence: 1_000_000,
        replacesTaskId: original.id,
        assignedToId,
      },
      select: { id: true },
    });
    created.push({
      ...p,
      taskId: task.id,
      locationCode: locById.get(p.locationId)?.code ?? '',
      warehouseName: locById.get(p.locationId)?.warehouse.name ?? '',
      assignedToId,
    });
  }

  await resequencePending(tx, params.orderId);
  return { created, uncovered };
}

/** Depósitos que recorre el pedido, en el orden actual del recorrido. */
async function visitedWarehouses(tx: Tx, orderId: string): Promise<string[]> {
  const tasks = await tx.pickTask.findMany({
    where: { orderId, status: { not: PickTaskStatus.CANCELLED } },
    select: { location: { select: { warehouseId: true } } },
    orderBy: { sequence: 'asc' },
  });
  return [...new Set(tasks.map((t) => t.location.warehouseId))];
}

/**
 * Renumera las tareas PENDIENTES siguiendo el recorrido lineal: depósito por
 * depósito (en el orden en que el pedido ya los visita; un depósito nuevo va
 * al final) y por ranking dentro de cada uno. Las tareas ya confirmadas
 * conservan su número.
 */
export async function resequencePending(tx: Tx, orderId: string) {
  const tasks = await tx.pickTask.findMany({
    where: { orderId, status: { not: PickTaskStatus.CANCELLED } },
    select: {
      id: true,
      status: true,
      sequence: true,
      createdAt: true,
      location: {
        select: {
          id: true,
          code: true,
          aisle: true,
          rack: true,
          position: true,
          routeOrder: true,
          warehouseId: true,
          warehouse: { select: { code: true } },
        },
      },
    },
    orderBy: [{ sequence: 'asc' }, { createdAt: 'asc' }],
  });

  const warehouseOrder = [...new Set(tasks.map((t) => t.location.warehouseId))];
  const ranks = rankLocationsForRoute(
    tasks.map((t) => ({ ...t.location, warehouseCode: t.location.warehouse.code })),
    warehouseOrder,
  );

  const done = tasks.filter((t) => t.status !== PickTaskStatus.PENDING);
  const pending = tasks
    .filter((t) => t.status === PickTaskStatus.PENDING)
    .sort(
      (a, b) =>
        ranks.get(a.location.id)!.rank - ranks.get(b.location.id)!.rank ||
        a.createdAt.getTime() - b.createdAt.getTime(),
    );

  let next = done.reduce((max, t) => Math.max(max, t.sequence), 0) + 1;
  for (const t of pending) {
    if (t.sequence !== next) {
      await tx.pickTask.update({
        where: { id: t.id },
        data: { sequence: next },
      });
    }
    next++;
  }
}
