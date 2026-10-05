export type UserRole = 'ADMIN' | 'WAREHOUSE_MANAGER' | 'PICKER' | 'DRIVER';

export interface User {
  id: string;
  email: string;
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
