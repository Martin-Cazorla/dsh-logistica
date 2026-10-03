import { LocationType } from '@prisma/client';

export class LocationOccupationDto {
  id: string;
  code: string;
  type: LocationType;
  aisle: string | null;
  rack: string | null;
  position: string | null;
  capacity: number;
  currentBultos: number;
  occupationPercentage: number;
  availableBultos: number;
  isFull: boolean;
}

export class WarehouseOccupationDto {
  warehouseId: string;
  warehouseName: string;
  totalLocations: number;
  totalMaxCapacityBultos: number;
  totalCurrentBultos: number;
  totalAvailableBultos: number;
  globalOccupationPercentage: number;
  locations: LocationOccupationDto[];
}
