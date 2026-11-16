// frontend/src/types/picking.types.ts

/**
 * Estado de un pedido (espejo del enum OrderStatus de Prisma).
 */
export type OrderStatus =
  | 'PENDING'
  | 'IN_PICKING'
  | 'PICKED'
  | 'CHECKED'
  | 'DISPATCHED'
  | 'DELIVERED'
  | 'RETURNED'
  | 'CANCELLED';

export type PickTaskStatus = 'PENDING' | 'PICKED' | 'SHORT' | 'CANCELLED';

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  PENDING: 'Pendiente',
  IN_PICKING: 'En armado',
  PICKED: 'Armado',
  CHECKED: 'Controlado (PC1)',
  DISPATCHED: 'Despachado',
  DELIVERED: 'Entregado',
  RETURNED: 'Devuelto',
  CANCELLED: 'Cancelado',
};

/** Resumen de pedido en la lista del picker
 * (backend: src/orders/mappers/order-view.mapper.ts#PickingListView). */
export interface PickingOrderSummary {
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

export type PickShortReason = 'DAMAGED' | 'NOT_FOUND' | 'OTHER';

export const SHORT_REASON_LABELS: Record<PickShortReason, string> = {
  DAMAGED: 'Roto / en mal estado',
  NOT_FOUND: 'No estaba en la ubicación',
  OTHER: 'Otro (detallar)',
};

/** Resultado de confirmar una toma con faltante. */
export interface ShortageOutcome {
  taskId: string;
  missing: number;
  shortReason: PickShortReason;
  /** Bultos en cuarentena (solicitud de ajuste pendiente). */
  quarantined: number;
  stockRequestId: string | null;
  /** Bultos sin stock alternativo: faltante justificado. */
  uncovered: number;
  replacements: Array<{
    taskId: string;
    quantity: number;
    locationCode: string;
    warehouseName: string;
    assignedToMe: boolean;
  }>;
}

export interface ConfirmPickTaskPayload {
  quantity: number;
  shortReason?: PickShortReason;
  notes?: string;
}

export interface PickTask {
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
  shortReason: PickShortReason | null;
  notes: string | null;
  /** Tarea de reemplazo generada ante un faltante. */
  replacesTaskId: string | null;
  replacesLocationCode: string | null;
  assignedTo: { id: string; name: string } | null;
  location: {
    id: string;
    code: string;
    warehouseId: string;
    warehouseName: string;
    zone: string;
    module: number;
    level: string;
    direction: 'ASC' | 'DESC';
    comments?: string;
  };
}

export interface PickZoneGroup {
  warehouseId: string;
  warehouseName: string;
  zone: string;
  direction: 'ASC' | 'DESC';
  tasks: PickTask[];
}

export interface PickingOrderDetail extends PickingOrderSummary {
  canStart: boolean;
  pendingTasks: PickTask[];
  pickedTasks: PickTask[];
  route: PickZoneGroup[];
  shortages: Array<{
    orderItemId: string;
    productSku: string;
    productName: string;
    requested: number;
    planned: number;
    picked: number;
  }>;
  plannedWithShortages?: boolean;
}
