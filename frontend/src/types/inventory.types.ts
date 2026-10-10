// frontend/src/types/inventory.types.ts

/**
 * Estado de ocupación física de una ubicación o pasillo.
 */
export type LocationStatus = 'DISPONIBLE' | 'PARCIAL' | 'COMPLETO';

/**
 * Ubicación física dentro de un depósito.
 */
export interface PhysicalLocation {
  id: string;
  warehouseId: string;
  warehouseName: string;
  code: string; // Ej: "PAS-F-RACK-B2"
  aisle: string; // Ej: "Pasillo F"
  rack: string; // Ej: "Rack B"
  level: string; // Ej: "Nivel 2"
  maxCapacityM3: number;
  usedCapacityM3: number;
  occupancyPercentage: number;
  status: LocationStatus;
  comments?: string;
}

/**
 * Resumen de ocupación por Depósito.
 */
export interface WarehouseOccupancy {
  id: string;
  name: string;
  totalCapacityM3: number;
  usedCapacityM3: number;
  occupancyPercentage: number;
  totalLocations: number;
  occupiedLocations: number;
  locations: PhysicalLocation[];
}

/**
 * Registro de un bulto/producto en inventario.
 */
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
  locationAisle: string;
  quantityBultos: number;
  weightPerBultoKg: number;
  volumePerBultoM3: number;
  totalWeightKg: number;
  totalVolumeM3: number;
  updatedAt: string;
}

/**
 * Item de Packing List para Inbound.
 */
export interface PackingListItem {
  id?: string;
  productSku: string;
  productName: string;
  eanCode?: string;
  quantityBultosExpected: number;
  quantityBultosReceived?: number;
  weightPerBultoKg: number;
  volumePerBultoM3: number;
  locationId?: string;
}

/**
 * DTO para la carga e ingreso de Inbound/Contenedor.
 */
export interface ReceiveContainerDto {
  containerNumber?: string;
  warehouseId: string;
  items: {
    productSku: string;
    productName: string;
    eanCode?: string;
    quantityBultos: number;
    weightPerBultoKg: number;
    volumePerBultoM3: number;
    locationId: string;
  }[];
}

/**
 * DTO para la relocalización (mover stock).
 */
export interface MoveStockDto {
  inventoryStockId: string;
  targetLocationId: string;
  quantityBultosToMove: number;
}
