// frontend/src/services/auth.service.ts

import api from '@/lib/axios';
import { AuthResponse, LoginCredentials, User } from '@/types/auth.types';

export const authService = {
  async login(credentials: LoginCredentials): Promise<AuthResponse> {
    const response = await api.post<AuthResponse>('/auth/login', credentials);
    return response.data;
  },

  /** Valida el token contra el backend y devuelve el rol vigente en la BD. */
  async getProfile(): Promise<User> {
    const response = await api.get<User>('/auth/profile');
    return response.data;
  },
};
