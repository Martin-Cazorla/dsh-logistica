// frontend/src/app/routes/page.tsx

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/layout/AppShell';
import RouteSheetView, { ROUTE_TONES } from '@/components/routes/RouteSheetView';
import { useAuth } from '@/context/AuthContext';
import { routesService } from '@/services/routes.service';
import { getApiErrorMessage } from '@/lib/axios';
import { can } from '@/lib/permissions';
import { formatDate } from '@/lib/format';
import { ROUTE_STATUS_LABELS, RouteSheet } from '@/types/routes.types';
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  LoadingBlock,
  PageHeader,
} from '@/components/ui';

/**
 * Vista de la tripulación (Chofer / Peón): sólo SUS vueltas.
 *  - Chofer: reordena entregas, controla la carga (PC2a), inicia el viaje y
 *    valida la descarga (PC2b).
 *  - Peón: visualiza la vuelta y valida la descarga en el cliente.
 */
export default function MyRoutesPage() {
  return (
    <AppShell permissions={['ROUTES_VIEW_OWN']}>
      <MyRoutesScreen />
    </AppShell>
  );
}

function MyRoutesScreen() {
  const { user } = useAuth();
  const [routes, setRoutes] = useState<RouteSheet[]>([]);
  const [selected, setSelected] = useState<RouteSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await routesService.myRoutes();
      setRoutes(data);
      setSelected((current) =>
        current ? (data.find((r) => r.id === current.id) ?? null) : null,
      );
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudieron cargar sus hojas de ruta.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isDriverOf = (r: RouteSheet) => r.driver?.id === user?.id;

  if (selected) {
    return (
      <div>
        <div className="mb-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={load} loading={loading}>
            Actualizar
          </Button>
          <Button variant="secondary" onClick={() => setSelected(null)}>
            ← Mis hojas
          </Button>
        </div>
        <RouteSheetView
          route={selected}
          capabilities={{
            canReorder: can(user?.role, 'ROUTES_REORDER') && isDriverOf(selected),
            canLoadCheck: can(user?.role, 'DISPATCH_CHECK') && isDriverOf(selected),
            canDeliveryCheck: can(user?.role, 'DELIVERY_CHECK'),
            canCancel: false,
          }}
          onChange={(updated) => {
            setSelected(updated);
            setRoutes((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Mi hoja de ruta"
        subtitle="Vueltas asignadas y entregas de los últimos 7 días."
        actions={
          <Button variant="secondary" onClick={load} loading={loading}>
            Actualizar
          </Button>
        }
      />
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}

      {loading ? (
        <LoadingBlock />
      ) : routes.length === 0 ? (
        <EmptyState title="No tiene vueltas asignadas" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {routes.map((r) => (
            <button
              key={r.id}
              onClick={() => setSelected(r)}
              className="rounded-xl border border-slate-700 bg-slate-800 p-4 text-left hover:border-amber-500"
            >
              <div className="flex items-start justify-between">
                <span className="font-mono text-lg font-black text-amber-300">{r.code}</span>
                <Badge tone={ROUTE_TONES[r.status]}>{ROUTE_STATUS_LABELS[r.status]}</Badge>
              </div>
              <p className="mt-1 text-sm text-white">{formatDate(r.scheduledDate)}</p>
              <p className="text-xs text-slate-400">
                {r.truck ? `${r.truck.brand} ${r.truck.model} · ${r.truck.plate}` : r.vehicleInfo}
              </p>
              <p className="mt-2 text-sm text-slate-300">
                {r.progress.stops} entregas · {r.totals.bultos} bultos
              </p>
              <p className="text-xs text-slate-500">
                Cargados {r.progress.loaded}/{r.progress.stops} · Entregados{' '}
                {r.progress.delivered + r.progress.partial}/{r.progress.stops}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {isDriverOf(r) ? 'Usted es el chofer' : 'Usted es el peón'}
              </p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
