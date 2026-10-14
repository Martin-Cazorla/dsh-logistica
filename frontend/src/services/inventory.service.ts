// frontend/src/services/inventory.service.ts

import {
  WarehouseOccupancy,
  InventoryStock,
  PhysicalLocation,
  CreateWarehouseDto,
  GenerateBatchLocationsDto,
  ReceiveContainerDto,
} from '@/types/inventory.types';

const API_BASE_URL = 'http://localhost:3001/api';

async function fetcher<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${endpoint}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.message || `Error en la petición ${res.status}`);
  }
  return res.json();
}

export const inventoryService = {
  getWarehouseOccupancy: async (): Promise<WarehouseOccupancy[]> => {
    return fetcher('/inventory/occupancy');
  },

  getWarehousesList: async (): Promise<{ id: string; name: string }[]> => {
    return fetcher('/inventory/warehouses');
  },

  createWarehouse: async (data: CreateWarehouseDto) => {
    return fetcher('/inventory/warehouse', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteWarehouse: async (id: string) => {
    return fetcher(`/inventory/warehouse/${id}`, {
      method: 'DELETE',
    });
  },

  getAvailableLocations: async (
    warehouseId: string,
  ): Promise<PhysicalLocation[]> => {
    return fetcher(`/inventory/locations/${warehouseId}`);
  },

  generateBatchLocations: async (data: GenerateBatchLocationsDto) => {
    return fetcher('/inventory/locations/batch', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  deleteLocationsBatch: async (locationIds: string[]) => {
    return fetcher('/inventory/locations/batch', {
      method: 'DELETE',
      body: JSON.stringify({ locationIds }),
    });
  },

  getStockList: async (
    warehouseId?: string,
    search?: string,
  ): Promise<InventoryStock[]> => {
    const params = new URLSearchParams();
    if (warehouseId) params.append('warehouseId', warehouseId);
    if (search) params.append('search', search);
    const queryStr = params.toString() ? `?${params.toString()}` : '';
    return fetcher(`/inventory/stock${queryStr}`);
  },

  // PACKING LIST Y HISTORIAL CONTENEDORES
  createPackingList: async (data: ReceiveContainerDto) => {
    return fetcher('/inventory/inbound/packing-list', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  getContainersHistory: async (status?: string) => {
    const queryStr = status ? `?status=${status}` : '';
    return fetcher(`/inventory/inbound/containers${queryStr}`);
  },

  deleteContainer: async (containerId: string) => {
    return fetcher(`/inventory/inbound/container/${containerId}`, {
      method: 'DELETE',
    });
  },

  processInbound: async (containerId: string, items: any[]) => {
    return fetcher('/inventory/inbound/process', {
      method: 'POST',
      body: JSON.stringify({ containerId, items }),
    });
  },
};
