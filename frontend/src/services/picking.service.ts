// frontend/src/services/picking.service.ts

import api from '@/lib/axios';
import { PickingOrder, UpdatePickingStatusDto } from '@/types/picking.types';

export const pickingService = {
  /**
   * Obtiene la lista de pedidos en proceso de armado o pendientes de picking.
   */
  async getAssignedOrders(): Promise<PickingOrder[]> {
    const response = await api.get<PickingOrder[]>('/orders/picking/assigned');
    return response.data;
  },

  /**
   * Obtiene el detalle completo de un pedido con sus ubicaciones físicas.
   */
  async getOrderForPicking(orderId: string): Promise<PickingOrder> {
    const response = await api.get<PickingOrder>(`/orders/picking/${orderId}`);
    return response.data;
  },

  /**
   * Confirma la recolección física de bultos y cambia el estado del pedido a PICKED.
   */
  async confirmPicking(data: UpdatePickingStatusDto): Promise<void> {
    await api.patch('/orders/picking/confirm', data);
  },
};
