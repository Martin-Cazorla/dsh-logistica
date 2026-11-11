// frontend/src/app/dashboard/audit/page.tsx

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { auditService } from '@/services/audit.service';
import { getApiErrorMessage } from '@/lib/axios';
import { ROLE_LABELS } from '@/lib/permissions';
import { formatDateTime } from '@/lib/format';
import { AUDIT_ACTION_LABELS, AuditFilters, AuditPage } from '@/types/audit.types';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  inputClass,
  LoadingBlock,
  PageHeader,
} from '@/components/ui';

const ENTITY_TYPES = [
  'ORDER',
  'PICK_TASK',
  'INVENTORY',
  'STOCK_REQUEST',
  'INBOUND_CONTAINER',
  'LOCATION',
  'ROUTE',
  'ROUTE_STOP',
  'TRUCK',
  'USER',
];

export default function AuditPageScreen() {
  return (
    <ProtectedRoute requiredPermissions={['AUDIT_VIEW']}>
      <AuditScreen />
    </ProtectedRoute>
  );
}

function AuditScreen() {
  const [filters, setFilters] = useState<AuditFilters>({ page: 1, limit: 50 });
  const [data, setData] = useState<AuditPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(
        await auditService.find({
          ...filters,
          // "hasta" inclusivo: fin del día
          to: filters.to ? `${filters.to}T23:59:59.999Z` : undefined,
        }),
      );
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo cargar el historial de auditoría.'));
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const update = (patch: Partial<AuditFilters>) =>
    setFilters((prev) => ({ ...prev, ...patch, page: patch.page ?? 1 }));

  return (
    <div>
      <PageHeader
        title="Auditoría"
        subtitle="Registro inmutable de todas las acciones (stock, picking, controles, rutas, usuarios). La base de datos rechaza cualquier modificación o borrado."
      />
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}

      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Acción">
            <select className={inputClass} value={filters.action ?? ''} onChange={(e) => update({ action: e.target.value || undefined })}>
              <option value="">Todas</option>
              {Object.entries(AUDIT_ACTION_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="Entidad">
            <select className={inputClass} value={filters.entityType ?? ''} onChange={(e) => update({ entityType: e.target.value || undefined })}>
              <option value="">Todas</option>
              {ENTITY_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="ID de entidad">
            <input className={inputClass} value={filters.entityId ?? ''} onChange={(e) => update({ entityId: e.target.value.trim() || undefined })} placeholder="UUID" />
          </Field>
          <Field label="Desde">
            <input type="date" className={inputClass} value={filters.from ?? ''} onChange={(e) => update({ from: e.target.value || undefined })} />
          </Field>
          <Field label="Hasta">
            <input type="date" className={inputClass} value={filters.to ?? ''} onChange={(e) => update({ to: e.target.value || undefined })} />
          </Field>
        </div>
      </Card>

      {loading && !data ? (
        <LoadingBlock />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="Sin registros para los filtros aplicados" />
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-700">
            <table className="min-w-full divide-y divide-slate-700 text-sm">
              <thead className="bg-slate-800 text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="px-4 py-3">Fecha</th>
                  <th className="px-4 py-3">Usuario</th>
                  <th className="px-4 py-3">Acción</th>
                  <th className="px-4 py-3">Entidad</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-900">
                {data.items.map((row) => (
                  <React.Fragment key={row.id}>
                    <tr>
                      <td className="whitespace-nowrap px-4 py-2.5 text-xs text-slate-300">{formatDateTime(row.createdAt)}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-bold text-white">{row.userName}</p>
                        {row.userRole && <p className="text-[11px] text-slate-500">{ROLE_LABELS[row.userRole]}</p>}
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone="amber">{AUDIT_ACTION_LABELS[row.action] ?? row.action}</Badge>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <span className="font-bold text-slate-300">{row.entityType}</span>
                        <button
                          className="block font-mono text-[11px] text-slate-500 hover:text-amber-300"
                          onClick={() => update({ entityType: row.entityType, entityId: row.entityId })}
                          title="Ver todo el historial de esta entidad"
                        >
                          {row.entityId}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {row.metadata && (
                          <Button size="sm" variant="ghost" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
                            {expanded === row.id ? 'Ocultar' : 'Detalle'}
                          </Button>
                        )}
                      </td>
                    </tr>
                    {expanded === row.id && row.metadata && (
                      <tr>
                        <td colSpan={5} className="bg-slate-950 px-4 py-3">
                          <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-[11px] text-slate-300">
                            {JSON.stringify(row.metadata, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2 text-xs text-slate-400">
            <Button size="sm" variant="secondary" disabled={(filters.page ?? 1) <= 1} onClick={() => update({ page: (filters.page ?? 1) - 1 })}>
              ←
            </Button>
            Página {data.meta.page} de {Math.max(data.meta.totalPages, 1)} · {data.meta.total} registros
            <Button
              size="sm"
              variant="secondary"
              disabled={data.meta.page >= data.meta.totalPages}
              onClick={() => update({ page: (filters.page ?? 1) + 1 })}
            >
              →
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
