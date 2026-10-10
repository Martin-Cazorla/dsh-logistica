// frontend/src/services/routes.service.ts

import api from '@/lib/axios';
import {
  Driver,
  RoutePendingOrder,
  CreateRouteDto,
} from '@/types/routes.types';

export const routesService = {
  /**
   * Obtiene la lista de choferes activos con la capacidad de sus vehículos.
   */
  async getDrivers(): Promise<Driver[]> {
    const response = await api.get<Driver[]>('/routes/drivers');
    return response.data;
  },

  /**
   * Obtiene los pedidos en estado CHECKED listos para consolidación por zona.
   */
  async getPendingOrdersForRoute(zone?: string): Promise<RoutePendingOrder[]> {
    const response = await api.get<RoutePendingOrder[]>(
      '/routes/pending-orders',
      {
        params: { zone },
      },
    );
    return response.data;
  },

  /**
   * Emite la Hoja de Ruta y pasa los pedidos a estado DISPATCHED.
   */
  async createRoute(data: CreateRouteDto): Promise<void> {
    await api.post('/routes', data);
  },
};
