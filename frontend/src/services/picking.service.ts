// frontend/src/services/picking.service.ts

import api from '@/lib/axios';
import {
  PickingOrderDetail,
  PickingOrderSummary,
} from '@/types/picking.types';

/** Alineado con src/orders/controllers/picking.controller.ts */
export const pickingService = {
  /** PICKER: sólo sus pedidos asignados. Gestor: todos los pendientes / en armado. */
  async getMyList(): Promise<PickingOrderSummary[]> {
    const response = await api.get<PickingOrderSummary[]>(
      '/orders/picking/my-list',
    );
    return response.data;
  },

  async getDetail(orderId: string): Promise<PickingOrderDetail> {
    const response = await api.get<PickingOrderDetail>(
      `/orders/picking/${orderId}`,
    );
    return response.data;
  },

  /** Genera el recorrido unidireccional y reserva el stock. Idempotente. */
  async start(orderId: string): Promise<PickingOrderDetail> {
    const response = await api.post<PickingOrderDetail>(
      `/orders/picking/${orderId}/start`,
    );
    return response.data;
  },

  /** Confirma una línea: pasa a "Pickeados". quantity < planificado = faltante. */
  async confirmTask(
    orderId: string,
    taskId: string,
    quantity: number,
  ): Promise<PickingOrderDetail> {
    const response = await api.post<PickingOrderDetail>(
      `/orders/picking/${orderId}/tasks/${taskId}/confirm`,
      { quantity },
    );
    return response.data;
  },

  /** Gestor: asigna uno o varios pickers (reemplaza el conjunto). */
  async assignPickers(
    orderId: string,
    pickerIds: string[],
  ): Promise<PickingOrderDetail> {
    const response = await api.put<PickingOrderDetail>(
      `/orders/picking/${orderId}/pickers`,
      { pickerIds },
    );
    return response.data;
  },

  async resetPlan(orderId: string): Promise<PickingOrderDetail> {
    const response = await api.post<PickingOrderDetail>(
      `/orders/picking/${orderId}/reset-plan`,
    );
    return response.data;
  },
};
