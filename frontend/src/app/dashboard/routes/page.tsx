// frontend/src/app/dashboard/routes/page.tsx

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import RouteSheetView, { ROUTE_TONES } from '@/components/routes/RouteSheetView';
import { routesService } from '@/services/routes.service';
import { trucksService } from '@/services/trucks.service';
import { getApiErrorMessage } from '@/lib/axios';
import { formatDate, formatDateTime, formatMinutes, formatNumber, todayIso } from '@/lib/format';
import {
  CrewMember,
  DispatchZoneGroup,
  Paged,
  ROUTE_STATUS_LABELS,
  RouteSheet,
} from '@/types/routes.types';
import { ORDER_STATUS_LABELS } from '@/types/picking.types';
import { Truck } from '@/types/trucks.types';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  inputClass,
  LoadingBlock,
  Modal,
  PageHeader,
  ProgressBar,
  StatTile,
  Tabs,
} from '@/components/ui';

type TabKey = 'PLAN' | 'ACTIVE' | 'HISTORY';

export default function RoutesManagementPage() {
  return (
    <ProtectedRoute requiredPermissions={['ROUTES_MANAGE']}>
      <RoutesManagement />
    </ProtectedRoute>
  );
}

function RoutesManagement() {
  const [tab, setTab] = useState<TabKey>('PLAN');
  const [success, setSuccess] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        title="Hojas de ruta y control de viajes"
        subtitle="Consolidación de carga por localidad, Punto de Control 2 (carga y descarga) e historial de viajes."
      />
      {success && <Alert kind="success" onClose={() => setSuccess(null)}>{success}</Alert>}
      <Tabs<TabKey>
        value={tab}
        onChange={setTab}
        tabs={[
          { key: 'PLAN', label: 'Consolidar carga' },
          { key: 'ACTIVE', label: 'Hojas activas' },
          { key: 'HISTORY', label: 'Control de viajes' },
        ]}
      />
      {tab === 'PLAN' && (
        <PlanTab
          onCreated={(route) => {
            setSuccess(`Hoja ${route.code} creada con ${route.progress.stops} entregas.`);
            setTab('ACTIVE');
          }}
        />
      )}
      {tab === 'ACTIVE' && <ActiveTab />}
      {tab === 'HISTORY' && <HistoryTab />}
    </div>
  );
}

// =============================================================================
// CONSOLIDACIÓN
// =============================================================================

function PlanTab({ onCreated }: { onCreated: (route: RouteSheet) => void }) {
  const [groups, setGroups] = useState<DispatchZoneGroup[]>([]);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [truckId, setTruckId] = useState('');
  const [driverId, setDriverId] = useState('');
  const [helperId, setHelperId] = useState('');
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [g, t, c] = await Promise.all([
        routesService.getDispatchableOrders(),
        trucksService.list(true),
        routesService.getCrew(),
      ]);
      setGroups(g);
      setTrucks(t);
      setCrew(c);
      setSelected([]);
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudieron cargar los pedidos para despacho.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const allOrders = useMemo(() => groups.flatMap((g) => g.orders), [groups]);
  const selectedOrders = useMemo(
    () => selected.map((id) => allOrders.find((o) => o.id === id)!).filter(Boolean),
    [selected, allOrders],
  );
  const totals = useMemo(
    () =>
      selectedOrders.reduce(
        (acc, o) => ({
          bultos: acc.bultos + o.bultos,
          kg: acc.kg + o.weightKg,
          m3: acc.m3 + o.volumeM3,
        }),
        { bultos: 0, kg: 0, m3: 0 },
      ),
    [selectedOrders],
  );

  const truck = trucks.find((t) => t.id === truckId);
  const overM3 = truck ? totals.m3 > truck.capacityM3 : false;
  const overKg = truck ? totals.kg > truck.maxLoadKg : false;
  const drivers = crew.filter((c) => c.role === 'DRIVER');
  const helpers = crew.filter((c) => c.role === 'HELPER');

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleZone = (group: DispatchZoneGroup) => {
    const ids = group.orders.map((o) => o.id);
    const allIn = ids.every((id) => selected.includes(id));
    setSelected((prev) =>
      allIn ? prev.filter((id) => !ids.includes(id)) : [...prev, ...ids.filter((id) => !prev.includes(id))],
    );
  };

  const create = async () => {
    setError(null);
    if (!truckId || !driverId || selected.length === 0) {
      setError('Seleccione pedidos, camión y chofer.');
      return;
    }
    setSaving(true);
    try {
      const route = await routesService.create({
        truckId,
        driverId,
        helperId: helperId || undefined,
        scheduledDate: date,
        orderIds: selected,
        notes: notes.trim() || undefined,
      });
      onCreated(route);
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo crear la hoja de ruta.'));
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingBlock text="Buscando pedidos listos para despacho..." />;

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <div className="space-y-3 xl:col-span-2">
        {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
        {groups.length === 0 ? (
          <EmptyState
            title="No hay pedidos listos para despacho"
            description="Los pedidos aparecen aquí cuando están ARMADOS (o controlados en PC1) y no tienen hoja asignada."
          />
        ) : (
          groups.map((g) => {
            const allIn = g.orders.every((o) => selected.includes(o.id));
            return (
              <Card
                key={g.zone}
                title={`${g.zone}`}
                actions={
                  <Button size="sm" variant="secondary" onClick={() => toggleZone(g)}>
                    {allIn ? 'Quitar zona' : 'Seleccionar zona'}
                  </Button>
                }
              >
                <p className="-mt-2 mb-3 text-xs text-slate-400">
                  {g.totals.orders} pedidos · {g.totals.bultos} bultos · {formatNumber(g.totals.weightKg, 1)} kg ·{' '}
                  {formatNumber(g.totals.volumeM3, 2)} m³
                </p>
                <ul className="divide-y divide-slate-800">
                  {g.orders.map((o) => (
                    <li key={o.id}>
                      <label className="flex cursor-pointer items-center gap-3 py-2">
                        <input
                          type="checkbox"
                          className="h-4 w-4 accent-amber-500"
                          checked={selected.includes(o.id)}
                          onChange={() => toggle(o.id)}
                        />
                        <span className="min-w-0 flex-1">
                          <span className="font-mono font-bold text-amber-300">{o.orderNumber}</span>{' '}
                          <span className="font-bold text-white">{o.customerName}</span>
                          <span className="block truncate text-xs text-slate-400">
                            {o.address} · CP {o.zipCode}
                            {o.deliveryDateFrom ? ` · Entrega ${formatDate(o.deliveryDateFrom)}` : ''}
                          </span>
                        </span>
                        <span className="text-right text-xs text-slate-300">
                          {o.bultos} b · {formatNumber(o.weightKg, 1)} kg · {formatNumber(o.volumeM3, 2)} m³
                          <span className="block">
                            <Badge tone={o.status === 'CHECKED' ? 'emerald' : o.status === 'RETURNED' ? 'red' : 'purple'}>
                              {ORDER_STATUS_LABELS[o.status]}
                            </Badge>
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })
        )}
      </div>

      <div className="space-y-3">
        <Card title="Nueva hoja de ruta">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <StatTile label="Pedidos" value={selected.length} />
              <StatTile label="Bultos" value={totals.bultos} />
              <StatTile label="Kg" value={formatNumber(totals.kg, 0)} />
            </div>

            <Field label="Camión">
              <select className={inputClass} value={truckId} onChange={(e) => setTruckId(e.target.value)}>
                <option value="">Seleccione…</option>
                {trucks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.plate} · {t.brand} {t.model} ({formatNumber(t.capacityM3, 1)} m³ / {formatNumber(t.maxLoadKg)} kg)
                    {t.activeRoute ? ` · en ${t.activeRoute.code}` : ''}
                  </option>
                ))}
              </select>
            </Field>

            {truck && (
              <div className="space-y-2 rounded-lg bg-slate-900 p-3 text-xs">
                <div>
                  <div className="mb-1 flex justify-between">
                    <span>Volumen</span>
                    <span className={overM3 ? 'font-bold text-red-400' : 'text-slate-300'}>
                      {formatNumber(totals.m3, 2)} / {formatNumber(truck.capacityM3, 2)} m³
                    </span>
                  </div>
                  <ProgressBar value={totals.m3} max={truck.capacityM3} />
                </div>
                <div>
                  <div className="mb-1 flex justify-between">
                    <span>Peso</span>
                    <span className={overKg ? 'font-bold text-red-400' : 'text-slate-300'}>
                      {formatNumber(totals.kg, 1)} / {formatNumber(truck.maxLoadKg)} kg
                    </span>
                  </div>
                  <ProgressBar value={totals.kg} max={truck.maxLoadKg} />
                </div>
                {(overM3 || overKg) && (
                  <p className="font-bold text-red-400">La carga excede la capacidad del camión.</p>
                )}
              </div>
            )}

            <Field label="Chofer">
              <select className={inputClass} value={driverId} onChange={(e) => setDriverId(e.target.value)}>
                <option value="">Seleccione…</option>
                {drivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                    {d.activeRoutes.length > 0 ? ` · ${d.activeRoutes.map((r) => r.code).join(', ')}` : ''}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Peón / Cadete (opcional)">
              <select className={inputClass} value={helperId} onChange={(e) => setHelperId(e.target.value)}>
                <option value="">Sin peón</option>
                {helpers.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                    {h.activeRoutes.length > 0 ? ` · ${h.activeRoutes.map((r) => r.code).join(', ')}` : ''}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Fecha de salida">
              <input type="date" className={inputClass} value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>

            <Field label="Observaciones">
              <textarea rows={2} className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>

            <Button
              className="w-full"
              onClick={create}
              loading={saving}
              disabled={selected.length === 0 || !truckId || !driverId || overM3 || overKg}
            >
              Crear hoja de ruta
            </Button>
            <p className="text-[11px] text-slate-500">
              El orden inicial de entrega es el de selección; el chofer puede reordenarlo desde su
              dispositivo.
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

// =============================================================================
// HOJAS ACTIVAS (Punto de Control 2a en depósito)
// =============================================================================

function ActiveTab() {
  const [routes, setRoutes] = useState<RouteSheet[]>([]);
  const [selected, setSelected] = useState<RouteSheet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [planned, loading_, transit] = await Promise.all([
        routesService.list({ status: 'PLANNED', limit: 50 }),
        routesService.list({ status: 'LOADING', limit: 50 }),
        routesService.list({ status: 'IN_TRANSIT', limit: 50 }),
      ]);
      setRoutes([...loading_.items, ...planned.items, ...transit.items]);
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudieron cargar las hojas activas.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) return <LoadingBlock />;

  return (
    <div>
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
      <div className="mb-3 flex justify-end">
        <Button variant="secondary" onClick={load}>Actualizar</Button>
      </div>
      {routes.length === 0 ? (
        <EmptyState title="No hay hojas de ruta activas" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="min-w-full divide-y divide-slate-700 text-sm">
            <thead className="bg-slate-800 text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Hoja</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3">Camión / Tripulación</th>
                <th className="px-4 py-3">Avance</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900">
              {routes.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3 font-mono font-bold text-amber-300">{r.code}</td>
                  <td className="px-4 py-3">{formatDate(r.scheduledDate)}</td>
                  <td className="px-4 py-3 text-xs text-slate-300">
                    {r.truck?.plate ?? r.vehicleInfo}
                    <span className="block text-slate-500">
                      {r.driver?.name}
                      {r.helper ? ` + ${r.helper.name}` : ''}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-300">
                    Carga {r.progress.loaded}/{r.progress.stops} · Entregas{' '}
                    {r.progress.delivered + r.progress.partial}/{r.progress.stops}
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={ROUTE_TONES[r.status]}>{ROUTE_STATUS_LABELS[r.status]}</Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="secondary" onClick={() => setSelected(r)}>
                      Abrir
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!selected} title={`Hoja ${selected?.code ?? ''}`} onClose={() => setSelected(null)} wide>
        {selected && (
          <RouteSheetView
            route={selected}
            capabilities={{ canReorder: true, canLoadCheck: true, canDeliveryCheck: true, canCancel: true }}
            onChange={(updated) => {
              setSelected(updated);
              setRoutes((prev) =>
                ['COMPLETED', 'CANCELLED'].includes(updated.status)
                  ? prev.filter((r) => r.id !== updated.id)
                  : prev.map((r) => (r.id === updated.id ? updated : r)),
              );
            }}
          />
        )}
      </Modal>
    </div>
  );
}

// =============================================================================
// CONTROL DE VIAJES (HISTORIAL)
// =============================================================================

function HistoryTab() {
  const [data, setData] = useState<Paged<RouteSheet> | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<RouteSheet | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await routesService.history({ from: from || undefined, to: to || undefined, page }));
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo cargar el historial de viajes.'));
    } finally {
      setLoading(false);
    }
  }, [from, to, page]);

  useEffect(() => {
    load();
  }, [load]);

  const summary = useMemo(() => {
    const items = data?.items ?? [];
    const completed = items.filter((r) => r.status === 'COMPLETED');
    const stops = completed.reduce((a, r) => a + r.progress.stops, 0);
    const ok = completed.reduce((a, r) => a + r.progress.delivered, 0);
    const durations = completed.map((r) => r.durationMinutes).filter((d): d is number => d !== null && d !== undefined);
    return {
      trips: completed.length,
      stops,
      ok,
      failed: completed.reduce((a, r) => a + r.progress.failed, 0),
      avg: durations.length ? Math.round(durations.reduce((a, d) => a + d, 0) / durations.length) : null,
    };
  }, [data]);

  return (
    <div>
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
      <Card className="mb-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Desde">
            <input type="date" className={inputClass} value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} />
          </Field>
          <Field label="Hasta">
            <input type="date" className={inputClass} value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} />
          </Field>
          <div className="flex items-end gap-2 sm:col-span-2">
            <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>←</Button>
            <span className="text-xs text-slate-400">
              Página {data?.meta.page ?? 1} de {Math.max(data?.meta.totalPages ?? 1, 1)} · {data?.meta.total ?? 0} viajes
            </span>
            <Button size="sm" variant="secondary" disabled={!data || page >= data.meta.totalPages} onClick={() => setPage((p) => p + 1)}>→</Button>
          </div>
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Viajes finalizados (página)" value={summary.trips} />
        <StatTile label="Entregas ok" value={`${summary.ok}/${summary.stops}`} tone="text-emerald-300" />
        <StatTile label="No entregadas" value={summary.failed} tone={summary.failed ? 'text-red-300' : 'text-white'} />
        <StatTile label="Duración media" value={formatMinutes(summary.avg)} />
      </div>

      {loading ? (
        <LoadingBlock />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="Sin viajes finalizados en el período" />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="min-w-full divide-y divide-slate-700 text-sm">
            <thead className="bg-slate-800 text-left text-xs uppercase text-slate-400">
              <tr>
                <th className="px-4 py-3">Hoja</th>
                <th className="px-4 py-3">Salida / Regreso</th>
                <th className="px-4 py-3">Tripulación</th>
                <th className="px-4 py-3">Resultado</th>
                <th className="px-4 py-3">Duración</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 bg-slate-900">
              {data.items.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-3">
                    <span className="font-mono font-bold text-amber-300">{r.code}</span>
                    <span className="block text-xs text-slate-500">{r.truck?.plate ?? r.vehicleInfo}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-300">
                    {formatDateTime(r.startedAt)}
                    <span className="block text-slate-500">{formatDateTime(r.completedAt)}</span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-300">
                    {r.driver?.name}
                    {r.helper ? ` + ${r.helper.name}` : ''}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    <Badge tone={ROUTE_TONES[r.status]}>{ROUTE_STATUS_LABELS[r.status]}</Badge>
                    <span className="mt-1 block text-slate-400">
                      {r.progress.delivered} ok · {r.progress.partial} parc. · {r.progress.failed} fallidas
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-300">{formatMinutes(r.durationMinutes)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="secondary" onClick={() => setDetail(r)}>Detalle</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={!!detail} title={`Viaje ${detail?.code ?? ''}`} onClose={() => setDetail(null)} wide>
        {detail && (
          <RouteSheetView
            route={detail}
            capabilities={{ canReorder: false, canLoadCheck: false, canDeliveryCheck: false, canCancel: false }}
            onChange={setDetail}
          />
        )}
      </Modal>
    </div>
  );
}
