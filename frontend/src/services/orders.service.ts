// frontend/src/services/orders.service.ts

import api from '@/lib/axios';
import {
  CatalogProduct,
  CreateOrderPayload,
  OrderListItem,
  OrdersConfig,
  OrdersPage,
} from '@/types/orders.types';
import { OrderStatus } from '@/types/picking.types';

export const ordersService = {
  async getConfig(): Promise<OrdersConfig> {
    const response = await api.get<OrdersConfig>('/orders/config');
    return response.data;
  },

  async list(params?: {
    status?: OrderStatus;
    search?: string;
    page?: number;
    limit?: number;
  }): Promise<OrdersPage> {
    const response = await api.get<OrdersPage>('/orders', {
      params: {
        ...(params?.status ? { status: params.status } : {}),
        ...(params?.search ? { search: params.search } : {}),
        page: params?.page ?? 1,
        limit: params?.limit ?? 25,
      },
    });
    return response.data;
  },

  async getById(id: string): Promise<OrderListItem> {
    const response = await api.get<OrderListItem>(`/orders/${id}`);
    return response.data;
  },

  async create(payload: CreateOrderPayload): Promise<OrderListItem> {
    const response = await api.post<OrderListItem>('/orders', payload);
    return response.data;
  },

  async cancel(id: string, reason: string): Promise<OrderListItem> {
    const response = await api.patch<OrderListItem>(`/orders/${id}/cancel`, {
      reason,
    });
    return response.data;
  },

  async searchProducts(params: {
    search?: string;
    warehouseId?: string;
  }): Promise<CatalogProduct[]> {
    const response = await api.get<CatalogProduct[]>('/products', {
      params: {
        ...(params.search ? { search: params.search } : {}),
        ...(params.warehouseId ? { warehouseId: params.warehouseId } : {}),
        limit: 30,
      },
    });
    return response.data;
  },
};
