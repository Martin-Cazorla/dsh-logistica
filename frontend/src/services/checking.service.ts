// frontend/src/services/checking.service.ts

import api from '@/lib/axios';
import { CheckingOrder, ConfirmCheckingDto } from '@/types/checking.types';

export const checkingService = {
  /**
   * Obtiene la lista de pedidos en estado PICKED listos para control de calidad.
   */
  async getPickedOrders(): Promise<CheckingOrder[]> {
    const response = await api.get<CheckingOrder[]>('/orders/checking/picked');
    return response.data;
  },

  /**
   * Obtiene el detalle de un pedido específico para auditar.
   */
  async getOrderForChecking(orderId: string): Promise<CheckingOrder> {
    const response = await api.get<CheckingOrder>(
      `/orders/checking/${orderId}`,
    );
    return response.data;
  },

  /**
   * Confirma el control de calidad y transiciona el pedido a estado CHECKED.
   */
  async confirmChecking(data: ConfirmCheckingDto): Promise<void> {
    await api.patch('/orders/checking/confirm', data);
  },
};
