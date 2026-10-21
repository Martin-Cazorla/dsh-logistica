import api from '../lib/axios';
import {
  Customer,
  CreateCustomerPayload,
  UpdateCustomerPayload,
  CustomerPaginatedResponse,
} from '../types/customers.types';

export const customersService = {
  async getAll(params?: {
    search?: string;
    page?: number;
    limit?: number;
    isActive?: boolean;
  }): Promise<CustomerPaginatedResponse> {
    const response = await api.get<CustomerPaginatedResponse>('/customers', {
      params,
    });
    return response.data;
  },

  async getById(id: string): Promise<Customer> {
    const response = await api.get<Customer>(`/customers/${id}`);
    return response.data;
  },

  async create(payload: CreateCustomerPayload): Promise<Customer> {
    const response = await api.post<Customer>('/customers', payload);
    return response.data;
  },

  async update(id: string, payload: UpdateCustomerPayload): Promise<Customer> {
    const response = await api.patch<Customer>(`/customers/${id}`, payload);
    return response.data;
  },

  async delete(id: string): Promise<Customer> {
    const response = await api.delete<Customer>(`/customers/${id}`);
    return response.data;
  },
};
