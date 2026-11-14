// frontend/src/services/analytics.service.ts

import api from '@/lib/axios';
import {
  AnalyticsFilterOptions,
  AnalyticsFilters,
  SalesByZoneResponse,
  TopZonesResponse,
} from '@/types/analytics.types';

const toParams = (f: AnalyticsFilters & { province?: string; zoneId?: string }) => {
  const params: Record<string, string> = {};
  if (f.from) params.from = f.from;
  if (f.to) params.to = f.to;
  if (f.warehouseId) params.warehouseId = f.warehouseId;
  if (f.sellerId) params.sellerId = f.sellerId;
  if (f.statuses?.length) params.statuses = f.statuses.join(',');
  if (f.province) params.province = f.province;
  if (f.zoneId) params.zoneId = f.zoneId;
  return params;
};

export const analyticsService = {
  async salesByZone(
    filters: AnalyticsFilters,
    drill: { province?: string; zoneId?: string },
  ): Promise<SalesByZoneResponse> {
    const response = await api.get<SalesByZoneResponse>('/analytics/sales-by-zone', {
      params: toParams({ ...filters, ...drill }),
    });
    return response.data;
  },

  async topZones(days = 30, limit = 3): Promise<TopZonesResponse> {
    const response = await api.get<TopZonesResponse>('/analytics/top-zones', {
      params: { days, limit },
    });
    return response.data;
  },

  async filterOptions(): Promise<AnalyticsFilterOptions> {
    const response = await api.get<AnalyticsFilterOptions>('/analytics/filters');
    return response.data;
  },
};
