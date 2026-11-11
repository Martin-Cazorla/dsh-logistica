// dsh-logistica/src/orders/mappers/order-view.mapper.ts

import { OrderStatus, PickTaskStatus, Prisma } from '@prisma/client';
import { rankLocationsForRoute } from '../picking/pick-route';

/**
 * Proyecciones (select) + mappers hacia los view-models que consume el
 * frontend (frontend/src/types/picking.types.ts y checking.types.ts).
 */

const USER_NAME_SELECT = {
  select: { id: true, firstName: true, lastName: true },
} as const;

function fullName(
  user: { firstName: string; lastName: string } | null | undefined,
): string | null {
  return user ? `${user.firstName} ${user.lastName}`.trim() : null;
}

// =============================================================================
// PICKING: LISTADO
// =============================================================================

export const PICKING_LIST_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  totalBultos: true,
  totalWeightKg: true,
  totalVolumeM3: true,
  createdAt: true,
  pickingStartedAt: true,
  customer: { select: { name: true } },
  deliveryAddress: { select: { city: true, province: true } },
  sourceWarehouse: { select: { id: true, name: true } },
  pickerAssignments: {
    select: { user: USER_NAME_SELECT },
    orderBy: { assignedAt: 'asc' },
  },
  pickTasks: { select: { status: true, quantity: true, pickedQty: true } },
} satisfies Prisma.OrderSelect;

export type PickingListRow = Prisma.OrderGetPayload<{
  select: typeof PICKING_LIST_SELECT;
}>;

export interface PickingListView {
  id: string;
  orderNumber: string;
  customerName: string;
  city: string;
  warehouseName: string;
  status: OrderStatus;
  totalBultos: number;
  totalWeightKg: number;
  totalVolumeM3: number;
  createdAt: string;
  pickingStartedAt: string | null;
  assignedPickers: Array<{ id: string; name: string }>;
  progress: { totalTasks: number; doneTasks: number; pickedBultos: number };
}

export function toPickingListView(order: PickingListRow): PickingListView {
  const active = order.pickTasks.filter(
    (t) => t.status !== PickTaskStatus.CANCELLED,
  );
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customer.name,
    city: `${order.deliveryAddress.city}, ${order.deliveryAddress.province}`,
    warehouseName: order.sourceWarehouse.name,
    status: order.status,
    totalBultos: order.totalBultos,
    totalWeightKg: Number(order.totalWeightKg),
    totalVolumeM3: Number(order.totalVolumeM3),
    createdAt: order.createdAt.toISOString(),
    pickingStartedAt: order.pickingStartedAt?.toISOString() ?? null,
    assignedPickers: order.pickerAssignments.map((a) => ({
      id: a.user.id,
      name: fullName(a.user)!,
    })),
    progress: {
      totalTasks: active.length,
      doneTasks: active.filter((t) => t.status !== PickTaskStatus.PENDING)
        .length,
      pickedBultos: active.reduce((acc, t) => acc + t.pickedQty, 0),
    },
  };
}

// =============================================================================
// PICKING: DETALLE CON RECORRIDO
// =============================================================================

export const PICKING_DETAIL_SELECT = {
  ...PICKING_LIST_SELECT,
  pickTasks: {
    select: {
      id: true,
      orderItemId: true,
      productId: true,
      lotNumber: true,
      sequence: true,
      quantity: true,
      pickedQty: true,
      status: true,
      pickedAt: true,
      pickedBy: USER_NAME_SELECT,
      product: { select: { sku: true, name: true, barcode: true } },
      location: {
        select: {
          id: true,
          code: true,
          aisle: true,
          rack: true,
          position: true,
          notes: true,
          routeOrder: true,
        },
      },
    },
    orderBy: { sequence: 'asc' },
  },
  items: {
    select: {
      id: true,
      productId: true,
      bultos: true,
      pickedQty: true,
      product: { select: { sku: true, name: true } },
    },
  },
} satisfies Prisma.OrderSelect;

export type PickingDetailRow = Prisma.OrderGetPayload<{
  select: typeof PICKING_DETAIL_SELECT;
}>;

export interface PickTaskView {
  id: string;
  sequence: number;
  orderItemId: string;
  productId: string;
  productSku: string;
  productName: string;
  barcode: string | null;
  lotNumber: string;
  quantity: number;
  pickedQty: number;
  status: PickTaskStatus;
  pickedBy: string | null;
  pickedAt: string | null;
  location: {
    id: string;
    code: string;
    zone: string;
    module: number;
    level: string;
    direction: 'ASC' | 'DESC';
    comments?: string;
  };
}

export interface PickZoneGroup {
  zone: string;
  direction: 'ASC' | 'DESC';
  tasks: PickTaskView[];
}

export interface PickingDetailView extends PickingListView {
  canStart: boolean;
  pendingTasks: PickTaskView[];
  pickedTasks: PickTaskView[];
  /** Pendientes agrupados por zona, en el orden del recorrido unidireccional. */
  route: PickZoneGroup[];
  shortages: Array<{
    orderItemId: string;
    productSku: string;
    productName: string;
    requested: number;
    planned: number;
    picked: number;
  }>;
}

export function toPickingDetailView(
  order: PickingDetailRow,
): PickingDetailView {
  const base = toPickingListView(order);

  const ranks = rankLocationsForRoute(order.pickTasks.map((t) => t.location));

  const tasks: PickTaskView[] = order.pickTasks
    .filter((t) => t.status !== PickTaskStatus.CANCELLED)
    .map((t) => {
      const rank = ranks.get(t.location.id)!;
      return {
        id: t.id,
        sequence: t.sequence,
        orderItemId: t.orderItemId,
        productId: t.productId,
        productSku: t.product.sku,
        productName: t.product.name,
        barcode: t.product.barcode,
        lotNumber: t.lotNumber,
        quantity: t.quantity,
        pickedQty: t.pickedQty,
        status: t.status,
        pickedBy: fullName(t.pickedBy),
        pickedAt: t.pickedAt?.toISOString() ?? null,
        location: {
          id: t.location.id,
          code: t.location.code,
          zone: rank.zone,
          module: rank.module,
          level: rank.level,
          direction: rank.direction,
          comments: t.location.notes ?? undefined,
        },
      };
    })
    .sort((a, b) => a.sequence - b.sequence);

  const pendingTasks = tasks.filter((t) => t.status === PickTaskStatus.PENDING);
  const pickedTasks = tasks.filter((t) => t.status !== PickTaskStatus.PENDING);

  // Agrupación por zona respetando la secuencia (bloques contiguos)
  const route: PickZoneGroup[] = [];
  for (const task of pendingTasks) {
    const last = route[route.length - 1];
    if (last && last.zone === task.location.zone) {
      last.tasks.push(task);
    } else {
      route.push({
        zone: task.location.zone,
        direction: task.location.direction,
        tasks: [task],
      });
    }
  }

  const plannedByItem = new Map<string, number>();
  for (const t of tasks) {
    plannedByItem.set(
      t.orderItemId,
      (plannedByItem.get(t.orderItemId) ?? 0) + t.quantity,
    );
  }

  const shortages = order.items
    .filter((item) => {
      const planned = plannedByItem.get(item.id) ?? 0;
      const finished =
        order.status !== OrderStatus.PENDING &&
        tasks
          .filter((t) => t.orderItemId === item.id)
          .every((t) => t.status !== PickTaskStatus.PENDING);
      return (
        order.status !== OrderStatus.PENDING &&
        (planned < item.bultos || (finished && item.pickedQty < item.bultos))
      );
    })
    .map((item) => ({
      orderItemId: item.id,
      productSku: item.product.sku,
      productName: item.product.name,
      requested: item.bultos,
      planned: plannedByItem.get(item.id) ?? 0,
      picked: item.pickedQty,
    }));

  return {
    ...base,
    canStart: order.status === OrderStatus.PENDING,
    pendingTasks,
    pickedTasks,
    route,
    shortages,
  };
}

// =============================================================================
// PUNTO DE CONTROL 1
// =============================================================================

export const CHECKING_ORDER_SELECT = {
  id: true,
  orderNumber: true,
  status: true,
  totalBultos: true,
  totalWeightKg: true,
  updatedAt: true,
  pickerId: true,
  customer: { select: { name: true, cuit: true } },
  sourceWarehouse: { select: { name: true } },
  picker: USER_NAME_SELECT,
  pickerAssignments: { select: { user: USER_NAME_SELECT } },
  items: {
    select: {
      id: true,
      orderId: true,
      productId: true,
      bultos: true,
      pickedQty: true,
      checkedQty: true,
      pickerId: true,
      product: { select: { sku: true, name: true } },
    },
    orderBy: { id: 'asc' },
  },
} satisfies Prisma.OrderSelect;

export type CheckingOrderRow = Prisma.OrderGetPayload<{
  select: typeof CHECKING_ORDER_SELECT;
}>;

export interface CheckingOrderItemView {
  id: string;
  orderId: string;
  productId: string;
  productSku: string;
  productName: string;
  packagingUnit: string;
  quantityRequested: number;
  quantityPicked: number;
  quantityChecked: number;
  isVerified: boolean;
}

export interface CheckingOrderView {
  id: string;
  orderNumber: string;
  customerName: string;
  customerCuit: string;
  warehouseName: string;
  status: OrderStatus;
  totalWeightKg: number;
  totalBultos: number;
  pickerName: string;
  updatedAt: string;
  items: CheckingOrderItemView[];
}

const PACKAGING_UNIT = 'Bulto Cerrado / Caja';

export function toCheckingOrderView(
  order: CheckingOrderRow,
): CheckingOrderView {
  const pickers = order.pickerAssignments
    .map((a) => fullName(a.user))
    .filter(Boolean);
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    customerName: order.customer.name,
    customerCuit: order.customer.cuit,
    warehouseName: order.sourceWarehouse.name,
    status: order.status,
    totalWeightKg: Number(order.totalWeightKg),
    totalBultos: order.totalBultos,
    pickerName:
      pickers.length > 0
        ? pickers.join(', ')
        : (fullName(order.picker) ?? 'N/D'),
    updatedAt: order.updatedAt.toISOString(),
    items: order.items.map((item) => ({
      id: item.id,
      orderId: item.orderId,
      productId: item.productId,
      productSku: item.product.sku,
      productName: item.product.name,
      packagingUnit: PACKAGING_UNIT,
      quantityRequested: item.bultos,
      quantityPicked: item.pickedQty,
      quantityChecked: item.checkedQty,
      isVerified: item.checkedQty > 0 && item.checkedQty === item.pickedQty,
    })),
  };
}
