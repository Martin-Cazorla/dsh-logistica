// frontend/src/services/users.service.ts

import api from '@/lib/axios';
import { UserRole } from '@/types/auth.types';
import {
  CreateUserPayload,
  ManagedUser,
  UpdateUserPayload,
} from '@/types/users.types';

export const usersService = {
  async list(params?: {
    role?: UserRole;
    isActive?: boolean;
    search?: string;
  }): Promise<ManagedUser[]> {
    const response = await api.get<ManagedUser[]>('/users', {
      params: {
        ...(params?.role ? { role: params.role } : {}),
        ...(params?.isActive !== undefined
          ? { isActive: String(params.isActive) }
          : {}),
        ...(params?.search ? { search: params.search } : {}),
      },
    });
    return response.data;
  },

  async create(payload: CreateUserPayload): Promise<ManagedUser> {
    const response = await api.post<ManagedUser>('/users', payload);
    return response.data;
  },

  async update(id: string, payload: UpdateUserPayload): Promise<ManagedUser> {
    const response = await api.patch<ManagedUser>(`/users/${id}`, payload);
    return response.data;
  },

  async setStatus(id: string, isActive: boolean): Promise<ManagedUser> {
    const response = await api.patch<ManagedUser>(`/users/${id}/status`, {
      isActive,
    });
    return response.data;
  },

  async resetPassword(id: string, password: string): Promise<void> {
    await api.patch(`/users/${id}/password`, { password });
  },
};
