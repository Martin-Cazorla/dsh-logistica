// frontend/src/types/orders.types.ts

import { OrderStatus } from './picking.types';

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
  sourceWarehouse: { id: string; name: string; code: string };
  createdBy: { id: string; firstName: string; lastName: string } | null;
  /** null en pedidos anteriores a la obligatoriedad: "Sin vendedor asignado". */
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
  /** Campos monetarios (sólo con Módulo de Ventas). */
  subtotalAmount?: string | number | null;
  taxAmount?: string | number | null;
  totalAmount?: string | number;
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
  orderNumber?: string;
  /** Obligatorio para Administrador y Gestor; el Vendedor siempre carga a su nombre. */
  sellerId?: string;
  customerId: string;
  addressId: string;
  sourceWarehouseId: string;
  deliveryDateFrom?: string;
  deliveryDateTo?: string;
  notes?: string;
  taxPct?: number;
  items: CreateOrderItemPayload[];
}

export interface OrdersConfig {
  salesModuleEnabled: boolean;
}
