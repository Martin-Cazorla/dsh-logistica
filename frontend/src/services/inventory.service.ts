// frontend/src/services/inventory.service.ts

import api from '@/lib/axios';
import {
  WarehouseOccupancy,
  InventoryStock,
  ReceiveContainerDto,
  MoveStockDto,
  PhysicalLocation,
} from '@/types/inventory.types';

export const inventoryService = {
  /**
   * Obtiene la ocupación física por depósitos y pasillos.
   */
  async getWarehouseOccupancy(): Promise<WarehouseOccupancy[]> {
    const response = await api.get<WarehouseOccupancy[]>(
      '/inventory/occupancy',
    );
    return response.data;
  },

  /**
   * Obtiene el listado completo de bultos/stock en depósito.
   */
  async getStockList(
    warehouseId?: string,
    search?: string,
  ): Promise<InventoryStock[]> {
    const response = await api.get<InventoryStock[]>('/inventory/stock', {
      params: { warehouseId, search },
    });
    return response.data;
  },

  /**
   * Registra el ingreso de mercadería/contenedor (Inbound) y asigna ubicaciones.
   */
  async receiveContainer(data: ReceiveContainerDto): Promise<void> {
    await api.post('/inventory/inbound/receive', data);
  },

  /**
   * Realiza la relocalización interna de bultos entre posiciones físicas.
   */
  async moveStock(data: MoveStockDto): Promise<void> {
    await api.patch('/inventory/stock/move', data);
  },

  /**
   * Obtiene la lista de ubicaciones físicas disponibles.
   */
  async getAvailableLocations(
    warehouseId: string,
  ): Promise<PhysicalLocation[]> {
    const response = await api.get<PhysicalLocation[]>(
      `/inventory/locations/${warehouseId}`,
    );
    return response.data;
  },
};
