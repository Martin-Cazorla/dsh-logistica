// frontend/src/types/auth.types.ts

/**
 * Espejo del enum UserRole de Prisma.
 * ADMIN = Administrador, WAREHOUSE_MANAGER = Gestor, PICKER = Picker,
 * HELPER = Peón / Cadete, DRIVER = Chofer.
 */
export type UserRole =
  | 'ADMIN'
  | 'WAREHOUSE_MANAGER'
  | 'PICKER'
  | 'HELPER'
  | 'DRIVER'
  | 'SELLER';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: UserRole;
}

export interface LoginCredentials {
  email: string;
  password: string;
}

export interface AuthResponse {
  accessToken: string;
  user: User;
}
