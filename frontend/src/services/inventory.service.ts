// frontend/src/services/inventory.service.ts

import api from '@/lib/axios';
import {
  WarehouseOccupancy,
  InventoryStock,
  ReceiveContainerDto,
  MoveStockDto,
  PhysicalLocation,
  CreateWarehouseDto,
  GenerateBatchLocationsDto,
} from '@/types/inventory.types';

export const inventoryService = {
  async getWarehouseOccupancy(): Promise<WarehouseOccupancy[]> {
    const response = await api.get<WarehouseOccupancy[]>(
      '/inventory/occupancy',
    );
    return response.data;
  },

  async getWarehousesList(): Promise<{ id: string; name: string }[]> {
    const response = await api.get<{ id: string; name: string }[]>(
      '/inventory/warehouses',
    );
    return response.data;
  },

  async getStockList(
    warehouseId?: string,
    search?: string,
  ): Promise<InventoryStock[]> {
    const response = await api.get<InventoryStock[]>('/inventory/stock', {
      params: { warehouseId, search },
    });
    return response.data;
  },

  async receiveContainer(data: ReceiveContainerDto): Promise<void> {
    await api.post('/inventory/inbound/receive', data);
  },

  async moveStock(data: MoveStockDto): Promise<void> {
    await api.patch('/inventory/stock/move', data);
  },

  async getAvailableLocations(
    warehouseId: string,
  ): Promise<PhysicalLocation[]> {
    const response = await api.get<PhysicalLocation[]>(
      `/inventory/locations/${warehouseId}`,
    );
    return response.data;
  },

  async createWarehouse(data: CreateWarehouseDto): Promise<void> {
    await api.post('/inventory/warehouses', data);
  },

  async deleteWarehouse(warehouseId: string): Promise<void> {
    await api.delete(`/inventory/warehouses/${warehouseId}`);
  },

  async generateBatchLocations(data: GenerateBatchLocationsDto): Promise<void> {
    await api.post('/inventory/locations/generate-batch', data);
  },

  async deleteLocationsBatch(locationIds: string[]): Promise<void> {
    await api.post('/inventory/locations/delete-batch', { locationIds });
  },
};
