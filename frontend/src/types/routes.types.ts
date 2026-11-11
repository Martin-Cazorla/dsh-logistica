// frontend/src/types/routes.types.ts

import { OrderStatus } from './picking.types';
import { UserRole } from './auth.types';

export type RouteStatus =
  | 'PLANNED'
  | 'LOADING'
  | 'IN_TRANSIT'
  | 'COMPLETED'
  | 'CANCELLED';

export type RouteStopStatus =
  | 'PENDING'
  | 'LOADED'
  | 'DELIVERED'
  | 'PARTIAL'
  | 'FAILED';

export const ROUTE_STATUS_LABELS: Record<RouteStatus, string> = {
  PLANNED: 'Planificada',
  LOADING: 'Cargando (PC2)',
  IN_TRANSIT: 'En viaje',
  COMPLETED: 'Finalizada',
  CANCELLED: 'Cancelada',
};

export const STOP_STATUS_LABELS: Record<RouteStopStatus, string> = {
  PENDING: 'Por cargar',
  LOADED: 'Cargado',
  DELIVERED: 'Entregado',
  PARTIAL: 'Entrega parcial',
  FAILED: 'No entregado',
};

export interface DispatchableOrder {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  customerName: string;
  address: string;
  zipCode: string;
  deliveryDateFrom: string | null;
  deliveryDateTo: string | null;
  bultos: number;
  weightKg: number;
  volumeM3: number;
}

export interface DispatchZoneGroup {
  zone: string;
  city: string;
  province: string;
  orders: DispatchableOrder[];
  totals: { orders: number; bultos: number; weightKg: number; volumeM3: number };
}

export interface CrewMember {
  id: string;
  name: string;
  role: UserRole;
  activeRoutes: Array<{ code: string; scheduledDate: string }>;
}

export interface RouteStop {
  id: string;
  sequence: number;
  status: RouteStopStatus;
  expectedBultos: number;
  loadedBultos: number | null;
  loadedAt: string | null;
  loadedBy: string | null;
  deliveredBultos: number | null;
  deliveredAt: string | null;
  deliveredBy: string | null;
  recipientName: string | null;
  notes: string | null;
  order: {
    id: string;
    orderNumber: string;
    status: OrderStatus;
    weightKg: number;
    volumeM3: number;
    deliveryDateFrom: string | null;
    deliveryDateTo: string | null;
    customerName: string;
    customerPhone: string | null;
    contactPerson: string | null;
    address: string;
    city: string;
    province: string;
    zipCode: string;
    businessHours: string | null;
  };
}

export interface RouteSheet {
  id: string;
  code: string;
  status: RouteStatus;
  scheduledDate: string;
  notes: string | null;
  vehicleInfo: string | null;
  truck: {
    id: string;
    brand: string;
    model: string;
    plate: string;
    capacityM3: number;
    maxLoadKg: number;
  } | null;
  driver: { id: string; name: string } | null;
  helper: { id: string; name: string } | null;
  createdBy: string | null;
  totals: { bultos: number; weightKg: number; volumeM3: number };
  utilization: { volumePct: number; weightPct: number } | null;
  progress: {
    stops: number;
    loaded: number;
    delivered: number;
    partial: number;
    failed: number;
  };
  loadingStartedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  durationMinutes?: number | null;
  stops: RouteStop[];
}

export interface Paged<T> {
  items: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
}

export interface CreateRoutePayload {
  code?: string;
  truckId: string;
  driverId: string;
  helperId?: string;
  scheduledDate: string;
  orderIds: string[];
  notes?: string;
}

export interface DeliveryCheckPayload {
  failed?: boolean;
  deliveredBultos?: number;
  recipientName?: string;
  notes?: string;
}

export interface DashboardMetrics {
  generatedAt: string;
  today: { byStatus: Partial<Record<RouteStatus, number>>; total: number };
  inTransit: number;
  last30Days: {
    completedTrips: number;
    deliveredStops: number;
    partialStops: number;
    failedStops: number;
    successRate: number | null;
    bultosDelivered: number;
    kgTransported: number;
    avgTripMinutes: number | null;
    avgFleetUtilizationPct: number | null;
  };
  orderPipeline: Partial<Record<OrderStatus, number>>;
  fleet: { activeTrucks: number };
  pendingStockRequests: number;
}
