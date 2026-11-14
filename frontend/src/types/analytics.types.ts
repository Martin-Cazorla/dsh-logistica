// frontend/src/types/analytics.types.ts

import { OrderStatus } from './picking.types';

export type AnalyticsLevel = 'province' | 'zone' | 'locality';

/** Métricas de una fila. `amount` sólo viene si el usuario puede ver importes. */
export interface ZoneMetrics {
  orders: number;
  customers: number;
  /** Vendedores distintos con pedidos en la fila (sin "Sin vendedor"). */
  activeSellers: number;
  bultos: number;
  weightKg: number;
  volumeM3: number;
  amount?: number;
}

export type AdditiveMetric = 'orders' | 'bultos' | 'weightKg' | 'volumeM3' | 'amount';

export interface TopCustomer {
  customerId: string;
  name: string;
  orders: number;
  bultos: number;
  weightKg: number;
  amount?: number;
}

export interface SellerActivity {
  sellerId: string | null;
  name: string;
  orders: number;
  bultos: number;
}

export interface SalesByZoneRow {
  key: string;
  label: string;
  sortOrder: number | null;
  drillable: boolean;
  metrics: ZoneMetrics;
  previous: ZoneMetrics;
  /** % del total del nivel por métrica. */
  share: Partial<Record<AdditiveMetric, number>>;
  /** Variación % contra el período anterior (null = sin actividad previa). */
  change: Partial<Record<AdditiveMetric | 'customers', number | null>>;
  topCustomers?: TopCustomer[];
  sellers?: SellerActivity[];
}

export interface SalesByZoneResponse {
  level: AnalyticsLevel;
  moneyVisible: boolean;
  context: {
    province: { key: string; label: string } | null;
    zone: { id: string; name: string } | null;
  };
  period: {
    from: string;
    to: string;
    previousFrom: string;
    previousTo: string;
    days: number;
  };
  totals: ZoneMetrics;
  previousTotals: ZoneMetrics;
  rows: SalesByZoneRow[];
}

export interface AnalyticsFilters {
  from?: string;
  to?: string;
  warehouseId?: string;
  sellerId?: string;
  statuses?: OrderStatus[];
}

export interface AnalyticsFilterOptions {
  moneyVisible: boolean;
  defaults: { from: string; to: string; statuses: OrderStatus[] };
  statuses: OrderStatus[];
  warehouses: Array<{ id: string; name: string }>;
  sellers: Array<{ id: string; name: string; isActive?: boolean }>;
  /** true para el Vendedor: el análisis está fijo a sus propios datos. */
  sellerLocked?: boolean;
}

export interface TopZoneItem {
  province: string;
  provinceLabel: string;
  zoneId: string | null;
  label: string;
  orders: number;
  bultos: number;
  share: number;
  change: number | null;
}

export interface TopZonesResponse {
  period: { from: string; to: string; days: number };
  totalOrders: number;
  items: TopZoneItem[];
}

// --- Administración de zonas ---

export interface ZoneLocalityItem {
  id: string;
  province: string;
  locality: string;
  label: string;
  addressCount: number;
}

export interface SalesZoneItem {
  id: string;
  name: string;
  province: string;
  sortOrder: number;
  isActive: boolean;
  addressCount: number;
  localities: ZoneLocalityItem[];
}

export interface UnassignedLocality {
  province: string;
  locality: string;
  provinceLabel: string;
  localityLabel: string;
  addresses: number;
  customers: number;
}
