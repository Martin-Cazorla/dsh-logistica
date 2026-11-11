// frontend/src/lib/nav.ts

import { Permission } from './permissions';

export interface NavItem {
  label: string;
  href: string;
  /** Visible si el rol tiene al menos uno de estos permisos. */
  permissions: Permission[];
  group: 'Gestión' | 'Operación' | 'Logística' | 'Administración';
}

/** Navegación única para Sidebar (escritorio) y OperatorShell (móvil). */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', href: '/dashboard', permissions: ['DASHBOARD_VIEW'], group: 'Gestión' },
  { label: 'Pedidos', href: '/dashboard/orders', permissions: ['ORDERS_MANAGE'], group: 'Gestión' },
  { label: 'Clientes', href: '/dashboard/customers', permissions: ['CUSTOMERS_MANAGE'], group: 'Gestión' },
  { label: 'Inventario / Ubicaciones', href: '/dashboard/inventory', permissions: ['INVENTORY_MODIFY'], group: 'Gestión' },
  { label: 'Aprobación de ajustes', href: '/dashboard/stock-requests', permissions: ['INVENTORY_MODIFY'], group: 'Gestión' },

  { label: 'Picking', href: '/picking', permissions: ['PICKING_EXECUTE'], group: 'Operación' },
  { label: 'Stock: reubicar / contar', href: '/operations/stock', permissions: ['INVENTORY_COUNT'], group: 'Operación' },
  { label: 'Punto de Control 1', href: '/checking', permissions: ['CHECKING_EXECUTE'], group: 'Operación' },

  { label: 'Planificación de rutas', href: '/dashboard/routes', permissions: ['ROUTES_MANAGE'], group: 'Logística' },
  { label: 'Flota (camiones)', href: '/dashboard/trucks', permissions: ['FLEET_MANAGE'], group: 'Logística' },
  { label: 'Mi hoja de ruta', href: '/routes', permissions: ['ROUTES_VIEW_OWN'], group: 'Logística' },

  { label: 'Usuarios', href: '/dashboard/users', permissions: ['USERS_MANAGE'], group: 'Administración' },
  { label: 'Auditoría', href: '/dashboard/audit', permissions: ['AUDIT_VIEW'], group: 'Administración' },
];
