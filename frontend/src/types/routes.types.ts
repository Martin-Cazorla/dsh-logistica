// frontend/src/types/routes.types.ts

/**
 * Zonas logísticas definidas para la operativa mayorista.
 */
export type LogisticsZone =
  'CABA' | 'ZONA_NORTE' | 'ZONA_SUR' | 'ZONA_OESTE' | 'INTERIOR';

/**
 * Información del Chofer / Transporte asignable.
 */
export interface Driver {
  id: string;
  name: string;
  licenseNumber: string;
  vehicleModel: string;
  vehiclePlate: string;
  maxCapacityKg: number;
}

/**
 * Pedido disponible para ser asignado a una Hoja de Ruta.
 */
export interface RoutePendingOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  deliveryZone: LogisticsZone;
  deliveryAddress: string;
  totalBultos: number;
  totalWeightKg: number;
}

/**
 * DTO para la creación de la Hoja de Ruta.
 */
export interface CreateRouteDto {
  driverId: string;
  zone: LogisticsZone;
  orderIds: string[];
  notes?: string;
}
