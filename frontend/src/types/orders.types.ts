// frontend/src/types/orders.types.ts

import { OrderStatus, PickShortReason } from './picking.types';

export interface CatalogProduct {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  unitsPerBox: number;
  weightKg: number;
  volumeM3: number;
  availableBultos: number;
  /** Sólo presente con el Módulo de Ventas activo y permiso SALES_VIEW. */
  unitPrice?: number;
}

export type ShippingType = 'DSH_TRANSPORT' | 'EXPRESO';

export const SHIPPING_TYPE_LABELS: Record<ShippingType, string> = {
  DSH_TRANSPORT: 'Transporte DSH',
  EXPRESO: 'Expreso',
};

/** "Transporte DSH" o "Expreso: <nombre>". */
export function shippingLabel(type: ShippingType, transportName?: string | null): string {
  return type === 'EXPRESO' ? `Expreso: ${transportName ?? 'sin indicar'}` : 'Transporte DSH';
}

export interface TransportOption {
  id: string;
  name: string;
  address: string;
  phone: string | null;
}

export interface WarehouseRef {
  id: string;
  name: string;
  code: string;
}

export interface OrderListItem {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  totalBultos: number;
  totalWeightKg: string | number;
  totalVolumeM3: string | number;
  createdAt: string;
  deliveryDateFrom: string | null;
  deliveryDateTo: string | null;
  estimatedDeliveryDate: string | null;
  shippingType: ShippingType;
  transport: { id: string; name: string } | null;
  notes: string | null;
  customer: { id: string; name: string; cuit: string };
  deliveryAddress: {
    id: string;
    alias?: string | null;
    address: string;
    city: string;
    province: string;
    zipCode: string;
  };
  /** Sólo pedidos históricos de un único depósito. */
  sourceWarehouse: WarehouseRef | null;
  /** Depósitos que recorre el pedido, en el orden del recorrido. */
  warehouses: WarehouseRef[];
  createdBy: { id: string; firstName: string; lastName: string } | null;
  /** null: "Sin vendedor asignado" (el vendedor es opcional). */
  seller: { id: string; firstName: string; lastName: string } | null;
  pickerAssignments: Array<{
    assignedAt: string;
    user: { id: string; firstName: string; lastName: string };
  }>;
  route: { id: string; code: string; status: string } | null;
  items: Array<{
    id: string;
    productId: string;
    bultos: number;
    totalUnits: number;
    pickedQty: number;
    checkedQty: number;
    unitPrice?: string | number;
    lineTotal?: string | number | null;
    product: {
      id: string;
      sku: string;
      name: string;
      unitsPerBox: number;
      weightKg: string | number;
      volumeM3: string | number;
    };
  }>;
  /** Sólo en GET /orders/:id: trazabilidad multi-picker por toma. */
  pickingHistory?: PickingHistory;
  /** Campos monetarios (sólo con Módulo de Ventas). */
  subtotalAmount?: string | number | null;
  taxAmount?: string | number | null;
  totalAmount?: string | number;
}

export interface PickingHistoryTask {
  id: string;
  sequence: number;
  sku: string;
  productName: string;
  warehouse: WarehouseRef;
  locationCode: string;
  quantity: number;
  pickedQty: number;
  status: 'PENDING' | 'PICKED' | 'SHORT' | 'CANCELLED';
  pickedBy: string | null;
  pickedAt: string | null;
  assignedTo: string | null;
  shortReason: PickShortReason | null;
  notes: string | null;
  replacesTaskId: string | null;
  replacesLocationCode: string | null;
  stockRequest: { id: string; status: 'PENDING' | 'APPROVED' | 'REJECTED'; heldQty: number } | null;
}

export interface PickingHistory {
  byPicker: Array<{ pickerId: string; name: string; bultos: number; tasks: number }>;
  tasks: PickingHistoryTask[];
}

export interface OrdersPage {
  items: OrderListItem[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface CreateOrderItemPayload {
  productId: string;
  bultos: number;
  unitPrice?: number;
  discountPct?: number;
}

export interface CreateOrderPayload {
  /** N° de presupuesto (sistema externo) = N° de pedido visible. */
  orderNumber: string;
  /** Opcional; el Vendedor siempre carga a su nombre. */
  sellerId?: string;
  customerId: string;
  addressId: string;
  shippingType: ShippingType;
  /** Obligatorio si shippingType = EXPRESO. */
  transportId?: string;
  estimatedDeliveryDate?: string;
  deliveryDateFrom?: string;
  deliveryDateTo?: string;
  notes?: string;
  taxPct?: number;
  items: CreateOrderItemPayload[];
}

export interface OrdersConfig {
  salesModuleEnabled: boolean;
}

// Hoja de preparación (GET /orders/:id/print)

export interface OrderPrintRow {
  sequence: number | null;
  sku: string;
  description: string;
  bultos: number;
  units: number;
  /** null: bultos sin stock asignado. */
  location: string | null;
  warehouse: string | null;
  /** Toma de reemplazo generada ante un faltante. */
  replacement: boolean;
}

export interface OrderPrintShortage {
  sku: string;
  description: string;
  requested: number;
  prepared: number;
  missing: number;
  details: string[];
  /** Texto listo para imprimir. */
  text: string;
}

export interface OrderPrintGroup {
  warehouse: WarehouseRef | null;
  totalBultos: number;
  rows: OrderPrintRow[];
}

export interface OrderPrintSheet {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  createdAt: string;
  customerName: string;
  customerCuit: string;
  deliveryAddress: string;
  estimatedDeliveryDate: string | null;
  deliveryDateFrom: string | null;
  deliveryDateTo: string | null;
  sellerName: string | null;
  notes: string | null;
  shippingType: ShippingType;
  shippingLabel: string;
  /** Real: preparado (tomas confirmadas) + planificado (pendientes). */
  totalBultos: number;
  orderedBultos: number;
  /** Nombres para "Preparó"; vacío = línea en blanco. */
  preparedBy: string[];
  groups: OrderPrintGroup[];
  shortages: OrderPrintShortage[];
}
