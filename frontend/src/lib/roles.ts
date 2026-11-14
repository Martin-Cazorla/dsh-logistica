// frontend/src/lib/roles.ts

import { UserRole } from '@/types/auth.types';

/** Ruta de inicio por rol (única fuente). */
export function homePathForRole(role: UserRole): string {
  switch (role) {
    case 'ADMIN':
    case 'WAREHOUSE_MANAGER':
      return '/dashboard';
    case 'PICKER':
      return '/picking';
    case 'DRIVER':
    case 'HELPER':
      return '/routes';
    case 'SELLER':
      return '/sales/stock';
    default:
      return '/login';
  }
}
