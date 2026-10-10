// frontend/src/types/checking.types.ts

import { OrderStatus } from './picking.types';

/**
 * Ítem individual dentro de un pedido listo para auditoría.
 */
export interface CheckingOrderItem {
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

/**
 * Estructura de Pedido para la pantalla de Checking.
 */
export interface CheckingOrder {
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
  items: CheckingOrderItem[];
}

/**
 * DTO para la confirmación de la auditoría.
 */
export interface ConfirmCheckingDto {
  orderId: string;
  notes?: string;
  itemsChecked: {
    orderItemId: string;
    quantityChecked: number;
  }[];
}
