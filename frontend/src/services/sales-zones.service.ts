// frontend/src/services/sales-zones.service.ts

import api from '@/lib/axios';
import { SalesZoneItem, UnassignedLocality } from '@/types/analytics.types';

export const salesZonesService = {
  async list(): Promise<SalesZoneItem[]> {
    const response = await api.get<SalesZoneItem[]>('/sales-zones');
    return response.data;
  },

  async unassigned(): Promise<UnassignedLocality[]> {
    const response = await api.get<UnassignedLocality[]>('/sales-zones/unassigned');
    return response.data;
  },

  /** Asigna o mueve una localidad a una zona (recalcula sus direcciones). */
  async assign(payload: {
    zoneId: string;
    province: string;
    locality: string;
    label?: string;
  }): Promise<{ addressesUpdated: number }> {
    const response = await api.put<{ addressesUpdated: number }>(
      '/sales-zones/localities',
      payload,
    );
    return response.data;
  },

  async remove(id: string): Promise<{ addressesUpdated: number }> {
    const response = await api.delete<{ addressesUpdated: number }>(
      `/sales-zones/localities/${id}`,
    );
    return response.data;
  },
};
