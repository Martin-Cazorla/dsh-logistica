// frontend/src/services/stock-requests.service.ts

import api from '@/lib/axios';
import {
  CreateStockRequestPayload,
  StockRequest,
  StockRequestStatus,
} from '@/types/stock-requests.types';

export const stockRequestsService = {
  async create(payload: CreateStockRequestPayload): Promise<StockRequest> {
    const response = await api.post<StockRequest>(
      '/inventory/stock-requests',
      payload,
    );
    return response.data;
  },

  async list(status?: StockRequestStatus): Promise<StockRequest[]> {
    const response = await api.get<StockRequest[]>(
      '/inventory/stock-requests',
      { params: status ? { status } : {} },
    );
    return response.data;
  },

  async approve(id: string, notes?: string): Promise<StockRequest> {
    const response = await api.post<StockRequest>(
      `/inventory/stock-requests/${id}/approve`,
      notes ? { notes } : {},
    );
    return response.data;
  },

  async reject(id: string, notes?: string): Promise<StockRequest> {
    const response = await api.post<StockRequest>(
      `/inventory/stock-requests/${id}/reject`,
      notes ? { notes } : {},
    );
    return response.data;
  },
};
