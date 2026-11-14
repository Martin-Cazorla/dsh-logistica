// frontend/src/services/inventory.service.ts

import api from '@/lib/axios';
import {
  WarehouseOccupancy,
  InventoryStock,
  PhysicalLocation,
  CreateWarehouseDto,
  BatchLocationDto,
  CreateManualStockDto,
  LocationStockDetail,
} from '@/types/inventory.types';

export interface TransferStockPayload {
  inventoryId: string;
  targetLocationId: string;
  targetWarehouseId?: string;
  quantityBultos: number;
  notes?: string;
  /** @deprecated Ignorado: el backend usa el usuario del JWT. */
  userId?: string;
}

export interface AdjustStockPayload {
  inventoryId: string;
  quantityBultos: number;
  reason: string;
  /** @deprecated Ignorado: el backend usa el usuario del JWT. */
  userId?: string;
}

export interface StockAdjustmentRecord {
  id: string;
  productSku: string;
  quantityBultos: number;
  reason: string;
  performedBy: string;
  timestamp: string;
  locationCode: string;
}

/**
 * Usa el cliente Axios compartido (@/lib/axios) que adjunta el JWT.
 * Antes este archivo creaba su propia instancia sin interceptor: todas las
 * llamadas de inventario viajaban sin Authorization.
 */
export interface StockAvailabilityResponse {
  warehouses: Array<{ id: string; name: string }>;
  items: Array<{
    productId: string;
    sku: string;
    name: string;
    unitsPerBox: number;
    /** warehouseId -> bultos disponibles (físico − reservado). */
    byWarehouse: Record<string, number>;
    total: number;
  }>;
  generatedAt: string;
}

export const inventoryService = {
  /** Stock DISPONIBLE por depósito, sin ubicaciones (consulta del Vendedor). */
  async getAvailability(search?: string): Promise<StockAvailabilityResponse> {
    const response = await api.get<StockAvailabilityResponse>(
      '/inventory/availability',
      { params: search ? { search } : {} },
    );
    return response.data;
  },

  // Resumen de ocupación de depósitos (m³)
  async getWarehouseOccupancy(): Promise<WarehouseOccupancy[]> {
    const response = await api.get<WarehouseOccupancy[]>('/inventory/occupancy');
    return response.data;
  },

  // Lista simple de depósitos activos
  async getWarehousesList(): Promise<{ id: string; name: string }[]> {
    const response = await api.get<{ id: string; name: string }[]>(
      '/inventory/warehouses',
    );
    return response.data;
  },

  async createWarehouse(data: CreateWarehouseDto) {
    const response = await api.post('/inventory/warehouse', data);
    return response.data;
  },

  async deleteWarehouse(warehouseId: string) {
    const response = await api.delete(`/inventory/warehouse/${warehouseId}`);
    return response.data;
  },

  async getAvailableLocations(
    warehouseId: string,
  ): Promise<PhysicalLocation[]> {
    const response = await api.get<PhysicalLocation[]>(
      `/inventory/locations/${warehouseId}`,
    );
    return response.data;
  },

  async generateBatchLocations(data: BatchLocationDto) {
    const response = await api.post('/inventory/locations/batch', data);
    return response.data;
  },

  async updateLocationsCapacity(
    updates: Array<{
      id: string;
      capacity?: number;
      lengthM?: number;
      widthM?: number;
      heightM?: number;
    }>,
  ) {
    const response = await api.put('/inventory/locations/capacity', {
      updates,
    });
    return response.data;
  },

  async deleteLocationsBatch(locationIds: string[]) {
    const response = await api.delete('/inventory/locations/batch', {
      data: { locationIds },
    });
    return response.data;
  },

  async getStockList(
    warehouseId?: string,
    search?: string,
  ): Promise<InventoryStock[]> {
    const response = await api.get<InventoryStock[]>('/inventory/stock', {
      params: {
        ...(warehouseId ? { warehouseId } : {}),
        ...(search ? { search } : {}),
      },
    });
    return response.data;
  },

  // Reubicar stock entre posiciones / depósitos
  async transferStock(data: TransferStockPayload) {
    const response = await api.post('/inventory/stock/transfer', {
      inventoryId: data.inventoryId,
      targetLocationId: data.targetLocationId,
      targetWarehouseId: data.targetWarehouseId,
      quantityBultos: data.quantityBultos,
      notes: data.notes,
    });
    return response.data;
  },

  // Descuento manual auditado (movimiento ADJUSTMENT en el backend)
  async adjustStock(data: AdjustStockPayload) {
    const response = await api.post<{
      success: boolean;
      remainingQuantity: number;
      message: string;
    }>('/inventory/stock/adjust', {
      inventoryId: data.inventoryId,
      quantityBultos: data.quantityBultos,
      reason: data.reason,
    });
    return response.data;
  },

  async getAdjustmentHistory(limit = 100): Promise<StockAdjustmentRecord[]> {
    const response = await api.get<StockAdjustmentRecord[]>(
      '/inventory/stock/adjustments',
      { params: { limit } },
    );
    return response.data;
  },

  // Pre-cargar Packing List (Fase 1)
  async createPackingList(data: unknown) {
    const response = await api.post('/inventory/inbound/packing-list', data);
    return response.data;
  },

  async getContainersHistory(status?: string) {
    const response = await api.get('/inventory/inbound/containers', {
      params: status ? { status } : {},
    });
    return response.data;
  },

  async deleteContainer(containerId: string) {
    const response = await api.delete(
      `/inventory/inbound/container/${containerId}`,
    );
    return response.data;
  },

  // Procesar descarga e ingreso al stock (Fase 2)
  async processInbound(containerId: string, items: unknown[]) {
    const response = await api.post('/inventory/inbound/process', {
      containerId,
      items,
    });
    return response.data;
  },

  // Carga manual de stock por posición
  async createManualStock(data: CreateManualStockDto) {
    const { userId: _ignored, ...payload } = data;
    void _ignored;
    const response = await api.post('/inventory/manual-stock', payload);
    return response.data;
  },

  async getStockByLocation(locationId: string): Promise<LocationStockDetail[]> {
    const response = await api.get<LocationStockDetail[]>(
      `/inventory/location-stock/${locationId}`,
    );
    return response.data;
  },
};
