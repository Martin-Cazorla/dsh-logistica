// frontend/src/types/picking.types.ts

/**
 * Estado posible de un pedido en el ciclo de picking.
 */
export type OrderStatus =
  'PENDING' | 'IN_PICKING' | 'PICKED' | 'CHECKED' | 'DISPATCHED' | 'CANCELLED';

/**
 * Ubicación física dentro de un depósito.
 */
export interface PhysicalLocation {
  id: string;
  code: string; // Ej: "PAS-F-RACK-B2"
  aisle: string; // Ej: "Pasillo F"
  rack: string; // Ej: "Rack B"
  level: string; // Ej: "Nivel 2"
  comments?: string; // Ej: "Enfrente del baño"
}

/**
 * Producto contenido dentro de un ítem de pedido.
 */
export interface ProductItem {
  id: string;
  sku: string;
  name: string;
  packagingUnit: string; // "Bulto Cerrado / Caja"
  weightPerUnitKg: number;
}

/**
 * Ítem individual a recolectar en el pedido.
 */
export interface PickingOrderItem {
  id: string;
  orderId: string;
  productId: string;
  product: ProductItem;
  quantityRequested: number; // Cantidad de bultos requeridos
  quantityPicked: number; // Cantidad confirmada por el operario
  location?: PhysicalLocation;
}

/**
 * Estructura del Pedido en pantalla de Picking.
 */
export interface PickingOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  warehouseName: string;
  status: OrderStatus;
  totalWeightKg: number;
  totalBultos: number;
  createdAt: string;
  items: PickingOrderItem[];
}

/**
 * DTO para la actualización de estado del picking.
 */
export interface UpdatePickingStatusDto {
  orderId: string;
  itemsPicked: {
    orderItemId: string;
    quantityPicked: number;
  }[];
}
