// frontend/src/types/inventory.types.ts

export type LocationTypeCategory = 'RACK' | 'PASILLO' | 'TECHO';
export type LocationStatus =
  'DISPONIBLE' | 'PARCIAL' | 'COMPLETO' | 'SOBREEXIGIDO';

export interface PhysicalLocation {
  id: string;
  warehouseId: string;
  warehouseName?: string;
  code: string;
  category: LocationTypeCategory;
  zoneName: string;
  rackLevel?: string;
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
  occupancyPercentage: number;
  isOverloaded: boolean;
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
  unitsPerBox?: number;
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
  totalUnitsExpected: number;
  unitsPerBox: number;
  weightPerBultoKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  volumePerBultoM3: number;
  sampleUnits: number;
  notes: string;
  imageUrl?: string;
  entryDate: string;
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
    unitsPerBox?: number;
    weightPerBultoKg: number;
    lengthCm?: number;
    widthCm?: number;
    heightCm?: number;
    volumePerBultoM3: number;
    sampleUnits?: number;
    notes?: string;
    locationId: string;
  }[];
}

export interface CreateWarehouseDto {
  name: string;
  code?: string;
  address?: string;
}

export interface GenerateBatchLocationsDto {
  warehouseId: string;
  category: LocationTypeCategory;
  areaName: string;
  levels: string[];
  positionStart: number;
  positionEnd: number;
  maxCapacityM3PerUnit: number;
}

// Alias para mantener compatibilidad con el servicio de inventario
export type BatchLocationDto = GenerateBatchLocationsDto;

export interface MoveStockDto {
  inventoryStockId: string;
  targetLocationId: string;
  quantityBultosToMove: number;
}

export interface PalletLabelItem {
  sku: string;
  description: string;
  quantityBultos: number;
  unitsPerBox?: number;
}

export interface PalletLabelData {
  palletId?: string;
  containerNumber?: string;
  warehouseName?: string;
  locationCode?: string;
  dateStr?: string;
  date?: string;
  productSku?: string;
  productName?: string;
  quantityBultos?: number;
  unitsPerBox?: number;
  weightPerBultoKg?: number;
  volumePerBultoM3?: number;
  items?: PalletLabelItem[];
}

export type PalletTagData = PalletLabelData;

// ---------------------------------------------------------------------------
// TIPOS E INTERFACES PARA CARGA MANUAL / TOMA DE STOCK POR UBICACIÓN
// ---------------------------------------------------------------------------

export interface ManualStockItem {
  productSku: string;
  productName: string;
  quantityBultos: number;
  unitsPerBox?: number;
  weightPerBultoKg?: number;
  volumePerBultoM3?: number;
  notes?: string;
}

export interface CreateManualStockDto {
  warehouseId: string;
  locationId: string;
  entryDate?: string;
  userId?: string;
  items: ManualStockItem[];
}

export interface LocationStockDetail {
  id: string;
  productId: string;
  productSku: string;
  productName: string;
  quantityBultos: number;
  unitsPerBox: number;
  weightPerBultoKg: number;
  volumePerBultoM3: number;
  warehouseName?: string;
  locationCode?: string;
  updatedAt: string;
}
