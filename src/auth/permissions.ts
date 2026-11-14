// dsh-logistica/src/auth/permissions.ts

import { UserRole } from '@prisma/client';

/**
 * Matriz RBAC única del sistema. Los controladores declaran PERMISOS
 * (@RequirePermissions), no roles: así cambiar qué puede hacer un rol es
 * modificar sólo este archivo.
 *
 * El frontend replica esta matriz en frontend/src/lib/permissions.ts sólo para
 * mostrar/ocultar navegación; la autorización real es siempre la del backend.
 */
export enum Permission {
  // Usuarios
  USERS_VIEW = 'USERS_VIEW',
  USERS_MANAGE = 'USERS_MANAGE',

  // Ventas / datos monetarios
  SALES_VIEW = 'SALES_VIEW',

  // Análisis comercial (ventas por zona)
  ANALYTICS_VIEW = 'ANALYTICS_VIEW',

  // Dashboard y auditoría
  DASHBOARD_VIEW = 'DASHBOARD_VIEW',
  AUDIT_VIEW = 'AUDIT_VIEW',

  // Pedidos
  ORDERS_VIEW = 'ORDERS_VIEW',
  /** Alta de pedidos (el Vendedor sólo con él mismo como vendedor). */
  ORDERS_CREATE = 'ORDERS_CREATE',
  ORDERS_MANAGE = 'ORDERS_MANAGE',

  // Picking
  PICKING_ASSIGN = 'PICKING_ASSIGN',
  PICKING_EXECUTE = 'PICKING_EXECUTE',

  // Punto de Control 1 (playa)
  CHECKING_EXECUTE = 'CHECKING_EXECUTE',

  // Inventario
  INVENTORY_VIEW = 'INVENTORY_VIEW',
  /**
   * Sólo stock DISPONIBLE por producto y depósito, sin ubicaciones, racks,
   * pasillos ni lotes (consulta del Vendedor).
   */
  STOCK_AVAILABILITY_VIEW = 'STOCK_AVAILABILITY_VIEW',
  INVENTORY_RELOCATE = 'INVENTORY_RELOCATE',
  INVENTORY_COUNT = 'INVENTORY_COUNT',
  INVENTORY_MODIFY = 'INVENTORY_MODIFY',
  WAREHOUSE_CONFIG = 'WAREHOUSE_CONFIG',

  // Maestros
  /** Lectura de clientes (el Vendedor sólo ve los suyos y los sin asignar). */
  CUSTOMERS_VIEW = 'CUSTOMERS_VIEW',
  CUSTOMERS_MANAGE = 'CUSTOMERS_MANAGE',
  FLEET_MANAGE = 'FLEET_MANAGE',

  // Hojas de ruta y despacho
  ROUTES_MANAGE = 'ROUTES_MANAGE',
  ROUTES_VIEW_OWN = 'ROUTES_VIEW_OWN',
  ROUTES_REORDER = 'ROUTES_REORDER',
  DISPATCH_CHECK = 'DISPATCH_CHECK',
  DELIVERY_CHECK = 'DELIVERY_CHECK',
}

const ALL_PERMISSIONS = Object.values(Permission);

const MANAGER_PERMISSIONS: Permission[] = ALL_PERMISSIONS.filter(
  (p) =>
    p !== Permission.USERS_MANAGE &&
    // El Gestor no ve reportes monetarios / ventas
    p !== Permission.SALES_VIEW,
);

export const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission>> = {
  [UserRole.ADMIN]: new Set(ALL_PERMISSIONS),

  [UserRole.WAREHOUSE_MANAGER]: new Set(MANAGER_PERMISSIONS),

  [UserRole.PICKER]: new Set([
    Permission.PICKING_EXECUTE,
    Permission.INVENTORY_VIEW,
    Permission.STOCK_AVAILABILITY_VIEW,
    Permission.INVENTORY_RELOCATE,
    // Puede contar, pero el ajuste resultante requiere aprobación
    Permission.INVENTORY_COUNT,
  ]),

  // Peón: sólo ve su vuelta y valida bultos en la DESCARGA en el cliente
  [UserRole.HELPER]: new Set([
    Permission.ROUTES_VIEW_OWN,
    Permission.DELIVERY_CHECK,
  ]),

  // Vendedor: stock en SOLO LECTURA de todos los depósitos, sus pedidos, sus
  // clientes y su propio análisis por zona. Ningún permiso de escritura de
  // inventario (reubicar, contar, ajustar, ingresar, configurar ubicaciones).
  // Los montos sólo se exponen si el módulo de ventas está activo
  // (canViewMoney exige SALES_VIEW y SALES_MODULE_ENABLED=true).
  [UserRole.SELLER]: new Set([
    // No INVENTORY_VIEW: ese permiso también expone ubicaciones y contenedores.
    Permission.STOCK_AVAILABILITY_VIEW,
    Permission.ORDERS_VIEW,
    Permission.ORDERS_CREATE,
    Permission.CUSTOMERS_VIEW,
    Permission.ANALYTICS_VIEW,
    Permission.SALES_VIEW,
  ]),

  [UserRole.DRIVER]: new Set([
    Permission.ROUTES_VIEW_OWN,
    Permission.ROUTES_REORDER,
    Permission.DISPATCH_CHECK,
    Permission.DELIVERY_CHECK,
  ]),
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

export function hasAnyPermission(
  role: UserRole,
  permissions: Permission[],
): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

/** Roles con alcance "global" sobre la operativa (no limitado a lo asignado). */
/** El Vendedor ve sólo sus propios datos comerciales. */
export function isSeller(role: UserRole): boolean {
  return role === UserRole.SELLER;
}

export function isSupervisor(role: UserRole): boolean {
  return role === UserRole.ADMIN || role === UserRole.WAREHOUSE_MANAGER;
}
