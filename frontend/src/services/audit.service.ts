// frontend/src/services/audit.service.ts

import api from '@/lib/axios';
import { AuditFilters, AuditPage } from '@/types/audit.types';

export const auditService = {
  async find(filters: AuditFilters): Promise<AuditPage> {
    const params: Record<string, string | number> = {};
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') params[key] = value;
    }
    const response = await api.get<AuditPage>('/audit', { params });
    return response.data;
  },
};
