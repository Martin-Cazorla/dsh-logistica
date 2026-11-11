// frontend/src/services/routes.service.ts

import api from '@/lib/axios';
import {
  CreateRoutePayload,
  CrewMember,
  DashboardMetrics,
  DeliveryCheckPayload,
  DispatchZoneGroup,
  Paged,
  RouteSheet,
  RouteStatus,
} from '@/types/routes.types';

/** Alineado con src/routes/controllers/routes.controller.ts */
export const routesService = {
  // --- Planificación (Gestor) ---
  async getDispatchableOrders(): Promise<DispatchZoneGroup[]> {
    const response = await api.get<DispatchZoneGroup[]>(
      '/routes/dispatchable-orders',
    );
    return response.data;
  },

  async getCrew(): Promise<CrewMember[]> {
    const response = await api.get<CrewMember[]>('/routes/crew');
    return response.data;
  },

  async create(payload: CreateRoutePayload): Promise<RouteSheet> {
    const response = await api.post<RouteSheet>('/routes', payload);
    return response.data;
  },

  async list(params?: {
    status?: RouteStatus;
    page?: number;
    limit?: number;
  }): Promise<Paged<RouteSheet>> {
    const response = await api.get<Paged<RouteSheet>>('/routes', {
      params: {
        ...(params?.status ? { status: params.status } : {}),
        page: params?.page ?? 1,
        limit: params?.limit ?? 30,
      },
    });
    return response.data;
  },

  async cancel(id: string, reason: string): Promise<RouteSheet> {
    const response = await api.patch<RouteSheet>(`/routes/${id}/cancel`, {
      reason,
    });
    return response.data;
  },

  // --- Control de viajes ---
  async history(params?: {
    from?: string;
    to?: string;
    page?: number;
  }): Promise<Paged<RouteSheet>> {
    const response = await api.get<Paged<RouteSheet>>('/routes/history', {
      params: {
        ...(params?.from ? { from: params.from } : {}),
        ...(params?.to ? { to: params.to } : {}),
        page: params?.page ?? 1,
        limit: 20,
      },
    });
    return response.data;
  },

  async metrics(): Promise<DashboardMetrics> {
    const response = await api.get<DashboardMetrics>('/routes/metrics');
    return response.data;
  },

  // --- Tripulación ---
  async myRoutes(): Promise<RouteSheet[]> {
    const response = await api.get<RouteSheet[]>('/routes/my-routes');
    return response.data;
  },

  async getById(id: string): Promise<RouteSheet> {
    const response = await api.get<RouteSheet>(`/routes/${id}`);
    return response.data;
  },

  async reorder(id: string, stopIds: string[]): Promise<RouteSheet> {
    const response = await api.put<RouteSheet>(`/routes/${id}/sequence`, {
      stopIds,
    });
    return response.data;
  },

  /** Punto de Control 2a: bultos subidos al camión. */
  async loadCheck(
    routeId: string,
    stopId: string,
    loadedBultos: number,
    notes?: string,
  ): Promise<RouteSheet> {
    const response = await api.post<RouteSheet>(
      `/routes/${routeId}/stops/${stopId}/load-check`,
      { loadedBultos, ...(notes ? { notes } : {}) },
    );
    return response.data;
  },

  async start(routeId: string): Promise<RouteSheet> {
    const response = await api.post<RouteSheet>(`/routes/${routeId}/start`);
    return response.data;
  },

  /** Punto de Control 2b: descarga en el domicilio del cliente. */
  async deliveryCheck(
    routeId: string,
    stopId: string,
    payload: DeliveryCheckPayload,
  ): Promise<RouteSheet> {
    const response = await api.post<RouteSheet>(
      `/routes/${routeId}/stops/${stopId}/delivery-check`,
      payload,
    );
    return response.data;
  },
};
