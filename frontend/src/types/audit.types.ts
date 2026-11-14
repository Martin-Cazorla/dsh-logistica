// frontend/src/types/audit.types.ts

import { UserRole } from './auth.types';

export interface AuditLogEntry {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  userId: string | null;
  userRole: UserRole | null;
  userName: string;
  createdAt: string;
}

export interface AuditPage {
  items: AuditLogEntry[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface AuditFilters {
  entityType?: string;
  entityId?: string;
  userId?: string;
  action?: string;
  from?: string;
  to?: string;
  page?: number;
  limit?: number;
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  USER_CREATED: 'Usuario creado',
  USER_UPDATED: 'Usuario modificado',
  USER_STATUS_CHANGED: 'Estado de usuario',
  USER_PASSWORD_RESET: 'Contraseña restablecida',
  ORDER_CREATED: 'Pedido creado',
  ORDER_CANCELLED: 'Pedido cancelado',
  PICKERS_ASSIGNED: 'Pickers asignados',
  PICKING_STARTED: 'Picking iniciado',
  PICK_TASK_CONFIRMED: 'Línea pickeada',
  PICKING_COMPLETED: 'Picking completado',
  PICKING_PLAN_RESET: 'Plan de picking liberado',
  CHECKPOINT1_APPROVED: 'Control en playa (PC1)',
  DISPATCH_LOAD_CHECKED: 'Control de carga (PC2)',
  DELIVERY_CHECKED: 'Control de descarga (PC2)',
  STOCK_INBOUND: 'Ingreso de contenedor',
  STOCK_MANUAL_LOAD: 'Carga manual de stock',
  STOCK_TRANSFERRED: 'Reubicación de stock',
  STOCK_ADJUSTED: 'Ajuste de stock',
  STOCK_REQUEST_CREATED: 'Solicitud de ajuste',
  STOCK_REQUEST_APPROVED: 'Solicitud aprobada',
  STOCK_REQUEST_REJECTED: 'Solicitud rechazada',
  TRUCK_CREATED: 'Camión creado',
  TRUCK_UPDATED: 'Camión modificado',
  ROUTE_CREATED: 'Hoja de ruta creada',
  ROUTE_REORDERED: 'Ruta reordenada',
  ROUTE_LOADING_STARTED: 'Carga iniciada',
  ROUTE_STARTED: 'Viaje iniciado',
  ROUTE_COMPLETED: 'Viaje finalizado',
  ROUTE_CANCELLED: 'Hoja cancelada',
  CUSTOMER_CREATED: 'Cliente creado',
  CUSTOMER_UPDATED: 'Cliente modificado',
  CUSTOMER_DEACTIVATED: 'Cliente dado de baja',
};
