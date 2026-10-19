// frontend/src/services/inventory.service.ts

import axios from 'axios';
import {
  WarehouseOccupancy,
  InventoryStock,
  PhysicalLocation,
  CreateWarehouseDto,
  BatchLocationDto,
  CreateManualStockDto,
  LocationStockDetail,
} from '@/types/inventory.types';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const inventoryService = {
  // Obtener resumen de ocupación de depósitos
  async getWarehouseOccupancy(): Promise<WarehouseOccupancy[]> {
    const response = await api.get('/inventory/occupancy');
    return response.data;
  },

  // Obtener lista simple de depósitos
  async getWarehousesList(): Promise<{ id: string; name: string }[]> {
    const response = await api.get('/inventory/warehouses');
    return response.data;
  },

  // Crear un nuevo depósito
  async createWarehouse(data: CreateWarehouseDto) {
    const response = await api.post('/inventory/warehouse', data);
    return response.data;
  },

  // Eliminar un depósito por ID
  async deleteWarehouse(warehouseId: string) {
    const response = await api.delete(`/inventory/warehouse/${warehouseId}`);
    return response.data;
  },

  // Obtener ubicaciones disponibles de un depósito
  async getAvailableLocations(
    warehouseId: string,
  ): Promise<PhysicalLocation[]> {
    const response = await api.get(`/inventory/locations/${warehouseId}`);
    return response.data;
  },

  // Generar ubicaciones en lote
  async generateBatchLocations(data: BatchLocationDto) {
    const response = await api.post('/inventory/locations/batch', data);
    return response.data;
  },

  // Actualizar capacidad de ubicaciones masivamente
  async updateLocationsCapacity(
    updates: Array<{ id: string; capacity: number }>,
  ) {
    const response = await api.put('/inventory/locations/capacity', {
      updates,
    });
    return response.data;
  },

  // Eliminar ubicaciones en lote
  async deleteLocationsBatch(locationIds: string[]) {
    const response = await api.delete('/inventory/locations/batch', {
      data: { locationIds },
    });
    return response.data;
  },

  // Obtener lista consolidada de stock
  async getStockList(
    warehouseId?: string,
    search?: string,
  ): Promise<InventoryStock[]> {
    const response = await api.get('/inventory/stock', {
      params: { warehouseId, search },
    });
    return response.data;
  },

  // Transferir/Reubicar stock entre posiciones
  async transferStock(data: {
    inventoryId: string;
    targetLocationId: string;
    quantityBultos: number;
    userId?: string;
  }) {
    const response = await api.post('/inventory/stock/transfer', data);
    return response.data;
  },

  // Pre-cargar Packing List (Fase 1)
  async createPackingList(data: any) {
    const response = await api.post('/inventory/inbound/packing-list', data);
    return response.data;
  },

  // Obtener historial de contenedores
  async getContainersHistory(status?: string) {
    const response = await api.get('/inventory/inbound/containers', {
      params: { status },
    });
    return response.data;
  },

  // Eliminar un contenedor
  async deleteContainer(containerId: string) {
    const response = await api.delete(
      `/inventory/inbound/container/${containerId}`,
    );
    return response.data;
  },

  // Procesar descarga e ingreso al stock (Fase 2)
  async processInbound(containerId: string, items: any[]) {
    const response = await api.post('/inventory/inbound/process', {
      containerId,
      items,
    });
    return response.data;
  },

  // ---------------------------------------------------------------------------
  // CARGA MANUAL DE STOCK E INVENTARIO POR UBICACIÓN
  // ---------------------------------------------------------------------------

  // Registrar toma / carga manual de stock directo por posición
  async createManualStock(data: CreateManualStockDto) {
    const response = await api.post('/inventory/manual-stock', data);
    return response.data;
  },

  // Obtener el stock detallado alojado en una posición específica
  async getStockByLocation(locationId: string): Promise<LocationStockDetail[]> {
    const response = await api.get(`/inventory/location-stock/${locationId}`);
    return response.data;
  },
};
