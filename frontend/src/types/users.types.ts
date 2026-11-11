// frontend/src/types/users.types.ts

import { UserRole } from './auth.types';

export interface ManagedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateUserPayload {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface UpdateUserPayload {
  email?: string;
  firstName?: string;
  lastName?: string;
  role?: UserRole;
}
