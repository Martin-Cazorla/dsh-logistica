// dsh-logistica/src/inventory/dto/occupation-response.dto.ts

import { LocationType } from '@prisma/client';
import { OccupancyStatus } from '../occupancy/location-occupancy';

/**
 * Ocupación VOLUMÉTRICA (m³) por ubicación. Antes estos campos comparaban la
 * capacidad en m³ contra cantidad de bultos y daban porcentajes incorrectos.
 */
export class LocationOccupationDto {
  id: string;
  code: string;
  type: LocationType;
  aisle: string | null;
  rack: string | null;
  position: string | null;
  lengthM: number | null;
  widthM: number | null;
  heightM: number | null;
  hasCapacity: boolean;
  /** null = sin capacidad cargada */
  maxCapacityM3: number | null;
  usedCapacityM3: number;
  /** null = sin capacidad cargada */
  occupancyPercentage: number | null;
  availableM3: number | null;
  currentBultos: number;
  status: OccupancyStatus;
  isFull: boolean;
}

export class WarehouseOccupationDto {
  warehouseId: string;
  warehouseName: string;
  totalLocations: number;
  locationsWithoutCapacity: number;
  totalCapacityM3: number;
  usedCapacityM3: number;
  unmeasuredUsedM3: number;
  availableM3: number;
  occupancyPercentage: number | null;
  locations: LocationOccupationDto[];
}
