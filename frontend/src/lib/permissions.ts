// frontend/src/lib/permissions.ts

import { UserRole } from '@/types/auth.types';

/**
 * Espejo de src/auth/permissions.ts del backend. Sólo se usa para decidir qué
 * navegación y botones mostrar: la autorización real la hace siempre la API.
 * Si se modifica la matriz en el backend, actualizar también este archivo.
 */
export type Permission =
  | 'USERS_VIEW'
  | 'USERS_MANAGE'
  | 'SALES_VIEW'
  | 'DASHBOARD_VIEW'
  | 'AUDIT_VIEW'
  | 'ORDERS_VIEW'
  | 'ORDERS_MANAGE'
  | 'PICKING_ASSIGN'
  | 'PICKING_EXECUTE'
  | 'CHECKING_EXECUTE'
  | 'INVENTORY_VIEW'
  | 'INVENTORY_RELOCATE'
  | 'INVENTORY_COUNT'
  | 'INVENTORY_MODIFY'
  | 'WAREHOUSE_CONFIG'
  | 'CUSTOMERS_MANAGE'
  | 'FLEET_MANAGE'
  | 'ROUTES_MANAGE'
  | 'ROUTES_VIEW_OWN'
  | 'ROUTES_REORDER'
  | 'DISPATCH_CHECK'
  | 'DELIVERY_CHECK';

const ALL: Permission[] = [
  'USERS_VIEW',
  'USERS_MANAGE',
  'SALES_VIEW',
  'DASHBOARD_VIEW',
  'AUDIT_VIEW',
  'ORDERS_VIEW',
  'ORDERS_MANAGE',
  'PICKING_ASSIGN',
  'PICKING_EXECUTE',
  'CHECKING_EXECUTE',
  'INVENTORY_VIEW',
  'INVENTORY_RELOCATE',
  'INVENTORY_COUNT',
  'INVENTORY_MODIFY',
  'WAREHOUSE_CONFIG',
  'CUSTOMERS_MANAGE',
  'FLEET_MANAGE',
  'ROUTES_MANAGE',
  'ROUTES_VIEW_OWN',
  'ROUTES_REORDER',
  'DISPATCH_CHECK',
  'DELIVERY_CHECK',
];

const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  ADMIN: new Set(ALL),
  WAREHOUSE_MANAGER: new Set(
    ALL.filter((p) => p !== 'USERS_MANAGE' && p !== 'SALES_VIEW'),
  ),
  PICKER: new Set<Permission>([
    'PICKING_EXECUTE',
    'INVENTORY_VIEW',
    'INVENTORY_RELOCATE',
    'INVENTORY_COUNT',
  ]),
  HELPER: new Set<Permission>(['ROUTES_VIEW_OWN', 'DELIVERY_CHECK']),
  DRIVER: new Set<Permission>([
    'ROUTES_VIEW_OWN',
    'ROUTES_REORDER',
    'DISPATCH_CHECK',
    'DELIVERY_CHECK',
  ]),
};

export function can(
  role: UserRole | undefined | null,
  permission: Permission,
): boolean {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function canAny(
  role: UserRole | undefined | null,
  permissions: Permission[],
): boolean {
  return permissions.some((p) => can(role, p));
}

export const ROLE_LABELS: Record<UserRole, string> = {
  ADMIN: 'Administrador',
  WAREHOUSE_MANAGER: 'Gestor',
  PICKER: 'Picker',
  HELPER: 'Peón / Cadete',
  DRIVER: 'Chofer',
};

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  ADMIN: 'Acceso total al sistema y gestión de usuarios.',
  WAREHOUSE_MANAGER:
    'Operativa y configuración completas, sin reportes monetarios ni alta de usuarios.',
  PICKER:
    'Picking de pedidos asignados, reubicación y conteo de stock (ajustes con aprobación).',
  HELPER: 'Visualiza su vuelta y valida bultos en la descarga en el cliente.',
  DRIVER:
    'Visualiza y reordena su vuelta, controla la carga y valida la descarga.',
};
