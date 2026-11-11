// frontend/src/services/checking.service.ts

import api from '@/lib/axios';
import { CheckingOrder, ConfirmCheckingDto } from '@/types/checking.types';

/**
 * Alineado con OrderCheckingController (antes apuntaba a /orders/checking/*,
 * rutas inexistentes en el backend).
 */
export const checkingService = {
  /** Pedidos en estado PICKED listos para control. */
  async getPickedOrders(): Promise<CheckingOrder[]> {
    const response = await api.get<CheckingOrder[]>('/orders/check/pending');
    return response.data;
  },

  async getOrderForChecking(orderId: string): Promise<CheckingOrder> {
    const response = await api.get<CheckingOrder>(`/orders/check/${orderId}`);
    return response.data;
  },

  /** Confirma el control y transiciona el pedido a CHECKED. */
  async confirmChecking(data: ConfirmCheckingDto): Promise<CheckingOrder> {
    const response = await api.post<CheckingOrder>(
      `/orders/check/${data.orderId}/verify`,
      { notes: data.notes, itemsChecked: data.itemsChecked },
    );
    return response.data;
  },
};
