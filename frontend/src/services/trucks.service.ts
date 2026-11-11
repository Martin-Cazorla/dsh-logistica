// frontend/src/services/trucks.service.ts

import api from '@/lib/axios';
import { Truck, TruckPayload } from '@/types/trucks.types';

export const trucksService = {
  async list(onlyActive = false): Promise<Truck[]> {
    const response = await api.get<Truck[]>('/trucks', {
      params: onlyActive ? { active: 'true' } : {},
    });
    return response.data;
  },

  async create(payload: TruckPayload): Promise<Truck> {
    const response = await api.post<Truck>('/trucks', payload);
    return response.data;
  },

  async update(id: string, payload: Partial<TruckPayload>): Promise<Truck> {
    const response = await api.patch<Truck>(`/trucks/${id}`, payload);
    return response.data;
  },
};
