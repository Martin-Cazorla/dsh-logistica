// frontend/src/components/routes/RouteSheetView.tsx

'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { routesService } from '@/services/routes.service';
import { getApiErrorMessage } from '@/lib/axios';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import {
  ROUTE_STATUS_LABELS,
  RouteSheet,
  RouteStop,
  RouteStopStatus,
  RouteStatus,
  STOP_STATUS_LABELS,
} from '@/types/routes.types';
import {
  Alert,
  Badge,
  BadgeTone,
  Button,
  Field,
  inputClass,
  Modal,
  ProgressBar,
} from '@/components/ui';

export const ROUTE_TONES: Record<RouteStatus, BadgeTone> = {
  PLANNED: 'amber',
  LOADING: 'purple',
  IN_TRANSIT: 'sky',
  COMPLETED: 'emerald',
  CANCELLED: 'slate',
};

const STOP_TONES: Record<RouteStopStatus, BadgeTone> = {
  PENDING: 'amber',
  LOADED: 'purple',
  DELIVERED: 'emerald',
  PARTIAL: 'amber',
  FAILED: 'red',
};

const FINAL: RouteStopStatus[] = ['DELIVERED', 'PARTIAL', 'FAILED'];

export interface RouteSheetCapabilities {
  canReorder: boolean;
  canLoadCheck: boolean;
  canDeliveryCheck: boolean;
  canCancel: boolean;
}

/**
 * Hoja de ruta con:
 *  - Reordenamiento de entregas (chofer / gestor).
 *  - Punto de Control 2a: conteo ciego de bultos al cargar el camión.
 *  - Punto de Control 2b: validación de descarga en el cliente.
 */
export default function RouteSheetView({
  route,
  capabilities,
  onChange,
}: {
  route: RouteSheet;
  capabilities: RouteSheetCapabilities;
  onChange: (route: RouteSheet) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [dirty, setDirty] = useState(false);
  const [loadStop, setLoadStop] = useState<RouteStop | null>(null);
  const [loadCount, setLoadCount] = useState('');
  const [deliverStop, setDeliverStop] = useState<RouteStop | null>(null);
  const [delivered, setDelivered] = useState('');
  const [recipient, setRecipient] = useState('');
  const [notes, setNotes] = useState('');
  const [failed, setFailed] = useState(false);

  const openStops = useMemo(
    () => route.stops.filter((s) => !FINAL.includes(s.status)),
    [route.stops],
  );
  const closedStops = useMemo(
    () => route.stops.filter((s) => FINAL.includes(s.status)),
    [route.stops],
  );

  useEffect(() => {
    setOrder(openStops.map((s) => s.id));
    setDirty(false);
  }, [openStops]);

  const stopsById = useMemo(
    () => new Map(route.stops.map((s) => [s.id, s])),
    [route.stops],
  );

  const isActive = ['PLANNED', 'LOADING', 'IN_TRANSIT'].includes(route.status);
  const loadingPhase = route.status === 'PLANNED' || route.status === 'LOADING';
  const allLoaded = route.stops.length > 0 && route.stops.every((s) => s.status === 'LOADED');

  const run = async (fn: () => Promise<RouteSheet>, fallback: string) => {
    setBusy(true);
    setError(null);
    try {
      onChange(await fn());
      return true;
    } catch (err) {
      setError(getApiErrorMessage(err, fallback));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    setDirty(true);
  };

  const saveOrder = () =>
    run(() => routesService.reorder(route.id, order), 'No se pudo guardar el nuevo orden.');

  const submitLoad = async () => {
    if (!loadStop) return;
    const count = Number(loadCount);
    if (!Number.isInteger(count) || count < 0) {
      setError('Ingrese la cantidad de bultos contados.');
      return;
    }
    const ok = await run(
      () => routesService.loadCheck(route.id, loadStop.id, count),
      'No se pudo registrar el control de carga.',
    );
    if (ok) setLoadStop(null);
  };

  const submitDelivery = async () => {
    if (!deliverStop) return;
    const count = Number(delivered);
    if (!failed && (!Number.isInteger(count) || count < 0)) {
      setError('Ingrese la cantidad de bultos descargados.');
      return;
    }
    const ok = await run(
      () =>
        routesService.deliveryCheck(route.id, deliverStop.id, {
          failed,
          ...(failed ? {} : { deliveredBultos: count }),
          recipientName: recipient.trim() || undefined,
          notes: notes.trim() || undefined,
        }),
      'No se pudo registrar la entrega.',
    );
    if (ok) setDeliverStop(null);
  };

  const cancelRoute = async () => {
    const reason = prompt(`Motivo de cancelación de la hoja ${route.code}:`);
    if (!reason?.trim()) return;
    await run(() => routesService.cancel(route.id, reason.trim()), 'No se pudo cancelar la hoja.');
  };

  const mapsUrl = (s: RouteStop) =>
    `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
      `${s.order.address}, ${s.order.city}, ${s.order.province}, Argentina`,
    )}`;

  return (
    <div className="space-y-4">
      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}

      <div className="grid gap-3 rounded-xl border border-slate-700 bg-slate-800 p-4 sm:grid-cols-4">
        <div>
          <p className="text-[11px] uppercase text-slate-500">Hoja</p>
          <p className="font-mono text-lg font-black text-amber-300">{route.code}</p>
          <Badge tone={ROUTE_TONES[route.status]}>{ROUTE_STATUS_LABELS[route.status]}</Badge>
        </div>
        <div>
          <p className="text-[11px] uppercase text-slate-500">Fecha / Camión</p>
          <p className="font-bold text-white">{formatDate(route.scheduledDate)}</p>
          <p className="text-xs text-slate-400">
            {route.truck ? `${route.truck.brand} ${route.truck.model} · ${route.truck.plate}` : route.vehicleInfo ?? '—'}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-slate-500">Tripulación</p>
          <p className="text-sm text-white">Chofer: {route.driver?.name ?? '—'}</p>
          <p className="text-sm text-white">Peón: {route.helper?.name ?? '—'}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase text-slate-500">Carga</p>
          <p className="text-sm text-white">
            {route.totals.bultos} bultos · {formatNumber(route.totals.weightKg, 1)} kg ·{' '}
            {formatNumber(route.totals.volumeM3, 2)} m³
          </p>
          {route.utilization && route.truck && (
            <div className="mt-1 space-y-1">
              <ProgressBar value={route.totals.volumeM3} max={route.truck.capacityM3} />
              <ProgressBar value={route.totals.weightKg} max={route.truck.maxLoadKg} />
              <p className="text-[11px] text-slate-500">
                {route.utilization.volumePct}% m³ · {route.utilization.weightPct}% kg
              </p>
            </div>
          )}
        </div>
      </div>

      {isActive && (
        <div className="flex flex-wrap gap-2">
          {capabilities.canLoadCheck && loadingPhase && (
            <Button
              variant="success"
              disabled={!allLoaded}
              loading={busy}
              onClick={() => run(() => routesService.start(route.id), 'No se pudo iniciar el viaje.')}
              title={allLoaded ? '' : 'Todas las paradas deben pasar el control de carga'}
            >
              Iniciar viaje {allLoaded ? '' : `(${route.progress.loaded}/${route.progress.stops} cargados)`}
            </Button>
          )}
          {capabilities.canReorder && dirty && (
            <Button onClick={saveOrder} loading={busy}>
              Guardar nuevo orden
            </Button>
          )}
          {capabilities.canCancel && loadingPhase && (
            <Button variant="danger" onClick={cancelRoute} disabled={busy}>
              Cancelar hoja
            </Button>
          )}
        </div>
      )}

      <ol className="space-y-2">
        {closedStops.map((s) => (
          <StopCard key={s.id} stop={s} mapsUrl={mapsUrl(s)} />
        ))}
        {order.map((id, index) => {
          const s = stopsById.get(id);
          if (!s) return null;
          return (
            <StopCard key={s.id} stop={s} mapsUrl={mapsUrl(s)}>
              {capabilities.canReorder && isActive && (
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" onClick={() => move(index, -1)} disabled={index === 0} aria-label="Subir">
                    ↑
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => move(index, 1)}
                    disabled={index === order.length - 1}
                    aria-label="Bajar"
                  >
                    ↓
                  </Button>
                </div>
              )}
              {capabilities.canLoadCheck && loadingPhase && (
                <Button
                  size="sm"
                  variant={s.status === 'LOADED' ? 'secondary' : 'primary'}
                  onClick={() => {
                    setLoadStop(s);
                    setLoadCount('');
                    setError(null);
                  }}
                >
                  {s.status === 'LOADED' ? 'Recontar carga' : 'Control de carga'}
                </Button>
              )}
              {capabilities.canDeliveryCheck && route.status === 'IN_TRANSIT' && s.status === 'LOADED' && (
                <Button
                  size="sm"
                  variant="success"
                  onClick={() => {
                    setDeliverStop(s);
                    setDelivered('');
                    setRecipient('');
                    setNotes('');
                    setFailed(false);
                    setError(null);
                  }}
                >
                  Validar descarga
                </Button>
              )}
            </StopCard>
          );
        })}
      </ol>

      <Modal
        open={!!loadStop}
        title={`Control de carga · ${loadStop?.order.orderNumber ?? ''}`}
        onClose={() => setLoadStop(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setLoadStop(null)}>Cancelar</Button>
            <Button onClick={submitLoad} loading={busy}>Confirmar carga</Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-400">
          Cuente los bultos de <strong className="text-white">{loadStop?.order.customerName}</strong> a medida
          que suben al camión. Si no coinciden con lo armado, el sistema no permite confirmar.
        </p>
        <Field label="Bultos contados">
          <input
            type="number"
            min={0}
            inputMode="numeric"
            autoFocus
            className={`${inputClass} text-center text-2xl font-black`}
            value={loadCount}
            onChange={(e) => setLoadCount(e.target.value)}
          />
        </Field>
      </Modal>

      <Modal
        open={!!deliverStop}
        title={`Descarga en cliente · ${deliverStop?.order.orderNumber ?? ''}`}
        onClose={() => setDeliverStop(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeliverStop(null)}>Cancelar</Button>
            <Button variant={failed ? 'danger' : 'success'} onClick={submitDelivery} loading={busy}>
              {failed ? 'Registrar no entrega' : 'Confirmar entrega'}
            </Button>
          </>
        }
      >
        <p className="mb-3 text-sm text-slate-400">
          {deliverStop?.order.customerName} · {deliverStop?.order.address}, {deliverStop?.order.city}
        </p>
        <label className="mb-3 flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" className="h-4 w-4 accent-red-500" checked={failed} onChange={(e) => setFailed(e.target.checked)} />
          No se pudo entregar (cliente ausente, rechazo, etc.)
        </label>
        <div className="space-y-3">
          {!failed && (
            <Field label="Bultos descargados (conteo en destino)">
              <input
                type="number"
                min={0}
                inputMode="numeric"
                className={`${inputClass} text-center text-2xl font-black`}
                value={delivered}
                onChange={(e) => setDelivered(e.target.value)}
              />
            </Field>
          )}
          <Field label="Recibió (nombre)">
            <input className={inputClass} value={recipient} onChange={(e) => setRecipient(e.target.value)} />
          </Field>
          <Field label="Observaciones" hint="Obligatorio si hay diferencia de bultos o no se entregó.">
            <textarea rows={2} className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}

function StopCard({
  stop,
  mapsUrl,
  children,
}: {
  stop: RouteStop;
  mapsUrl: string;
  children?: React.ReactNode;
}) {
  return (
    <li className="rounded-xl border border-slate-700 bg-slate-900 p-3">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 font-mono font-black text-amber-300">
          {stop.sequence}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold text-white">{stop.order.customerName}</p>
            <Badge tone={STOP_TONES[stop.status]}>{STOP_STATUS_LABELS[stop.status]}</Badge>
          </div>
          <p className="text-sm text-slate-300">
            {stop.order.address}, {stop.order.city} ({stop.order.province})
          </p>
          <p className="text-xs text-slate-500">
            Pedido {stop.order.orderNumber} · {stop.expectedBultos} bultos
            {stop.order.businessHours ? ` · Horario ${stop.order.businessHours}` : ''}
            {stop.order.customerPhone ? ` · Tel. ${stop.order.customerPhone}` : ''}
          </p>
          {stop.loadedAt && (
            <p className="text-[11px] text-purple-300">
              Cargado: {stop.loadedBultos} bultos · {stop.loadedBy} · {formatDateTime(stop.loadedAt)}
            </p>
          )}
          {stop.deliveredAt && (
            <p className="text-[11px] text-emerald-300">
              Descarga: {stop.deliveredBultos} bultos · {stop.deliveredBy} · {formatDateTime(stop.deliveredAt)}
              {stop.recipientName ? ` · Recibió ${stop.recipientName}` : ''}
            </p>
          )}
          {stop.notes && <p className="text-[11px] text-amber-300">Obs.: {stop.notes}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-slate-600 px-2.5 py-1.5 text-xs font-bold text-slate-300 hover:bg-slate-800"
          >
            Mapa
          </a>
          {children}
        </div>
      </div>
    </li>
  );
}
