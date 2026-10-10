// frontend/src/types/inventory.types.ts

export type LocationTypeCategory = 'RACK' | 'PASILLO' | 'TECHO';
export type LocationStatus =
  'DISPONIBLE' | 'PARCIAL' | 'COMPLETO' | 'SOBREEXIGIDO';

export interface PhysicalLocation {
  id: string;
  warehouseId: string;
  warehouseName?: string;
  code: string; // Ej: "RACK-SUD-A12", "PASILLO-DEV-B04", "TECHO-OFI-A01"
  category: LocationTypeCategory;
  zoneName: string;
  rackLevel?: string; // "A", "B", "C", "D"
  moduleNumber?: number;
  maxCapacityM3: number;
  usedCapacityM3: number;
  occupancyPercentage: number;
  status: LocationStatus;
  comments?: string;
}

export interface WarehouseOccupancy {
  id: string;
  name: string;
  address?: string;
  totalCapacityM3: number;
  usedCapacityM3: number;
  occupancyPercentage: number; // Puede superar el 100% si hay ubicaciones provisorias
  isOverloaded: boolean; // Indique si supera el 100%
  totalLocations: number;
  occupiedLocations: number;
  locations: PhysicalLocation[];
}

export interface InventoryStock {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  eanCode?: string;
  containerNumber?: string;
  warehouseId: string;
  warehouseName: string;
  locationId: string;
  locationCode: string;
  quantityBultos: number;
  weightPerBultoKg: number;
  volumePerBultoM3: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  totalWeightKg: number;
  totalVolumeM3: number;
  updatedAt: string;
}

export interface PackingListItem {
  id?: string;
  productSku: string;
  productName: string;
  eanCode?: string;
  quantityBultosExpected: number;
  weightPerBultoKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  volumePerBultoM3: number;
  category: LocationTypeCategory;
  zoneName: string;
  rackLevel?: string;
  moduleNumber?: number;
  locationId?: string;
}

export interface ReceiveContainerDto {
  containerNumber?: string;
  warehouseId: string;
  items: {
    productSku: string;
    productName: string;
    eanCode?: string;
    quantityBultos: number;
    weightPerBultoKg: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    volumePerBultoM3: number;
    locationId: string;
  }[];
}

export interface CreateWarehouseDto {
  name: string;
  address?: string;
}

/**
 * DTO para la generación masiva inteligente por rangos
 */
export interface GenerateBatchLocationsDto {
  warehouseId: string;
  category: LocationTypeCategory;
  areaName: string; // Ej. "Rack Pared Sur", "Pasillo Devoluciones", "Techo Generador"
  levels: string[]; // Ej. ["A", "B", "C", "D"]
  positionStart: number; // Ej. 1
  positionEnd: number; // Ej. 84
  maxCapacityM3PerUnit: number; // Ej. 2.5
}

export interface MoveStockDto {
  inventoryStockId: string;
  targetLocationId: string;
  quantityBultosToMove: number;
}
