// frontend/src/app/dashboard/zones/page.tsx

'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '@/components/ProtectedRoute';
import { salesZonesService } from '@/services/sales-zones.service';
import { getApiErrorMessage } from '@/lib/axios';
import { formatNumber } from '@/lib/format';
import {
  SalesZoneItem,
  UnassignedLocality,
  ZoneLocalityItem,
} from '@/types/analytics.types';
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
} from '@/components/ui';

/** Igual que normalizeGeo() del backend: minúsculas, sin acentos ni espacios dobles. */
const norm = (v: string) =>
  v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/** Una localidad sólo puede ir a zonas de su provincia (CABA cuenta como Buenos Aires). */
const zoneAccepts = (zone: SalesZoneItem, provinceKey: string) => {
  const zp = norm(zone.province);
  return zp === provinceKey || (zp === 'buenos aires' && provinceKey === 'caba');
};

type Editing =
  | { kind: 'move'; zone: SalesZoneItem; locality: ZoneLocalityItem }
  | { kind: 'add'; zone: SalesZoneItem };

export default function ZonesPage() {
  return (
    <ProtectedRoute requiredPermissions={['CUSTOMERS_MANAGE']}>
      <ZonesScreen />
    </ProtectedRoute>
  );
}

function ZonesScreen() {
  const [zones, setZones] = useState<SalesZoneItem[]>([]);
  const [unassigned, setUnassigned] = useState<UnassignedLocality[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [pick, setPick] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [z, u] = await Promise.all([
        salesZonesService.list(),
        salesZonesService.unassigned(),
      ]);
      setZones(z);
      setUnassigned(u);
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudieron cargar las zonas.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const assign = async (
    payload: { zoneId: string; province: string; locality: string; label?: string },
    busyKey: string,
    zoneName: string,
  ) => {
    setBusy(busyKey);
    setError(null);
    try {
      const res = await salesZonesService.assign(payload);
      setSuccess(
        `"${payload.label ?? payload.locality}" asignada a ${zoneName}. ${res.addressesUpdated} dirección(es) actualizada(s).`,
      );
      setEditing(null);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo asignar la localidad.'));
    } finally {
      setBusy(null);
    }
  };

  const removeLocality = async (loc: ZoneLocalityItem) => {
    if (!confirm(`¿Quitar "${loc.label}" de su zona? Sus direcciones quedarán "Sin zona asignada".`)) return;
    setBusy(loc.id);
    try {
      const res = await salesZonesService.remove(loc.id);
      setSuccess(`"${loc.label}" quitada. ${res.addressesUpdated} dirección(es) quedaron sin zona.`);
      setEditing(null);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo quitar la localidad.'));
    } finally {
      setBusy(null);
    }
  };

  const q = norm(search);
  const filteredZones = useMemo(
    () =>
      zones.map((z) => ({
        ...z,
        visible: q ? z.localities.filter((l) => l.locality.includes(q) || norm(l.label).includes(q)) : z.localities,
      })),
    [zones, q],
  );

  return (
    <div>
      <PageHeader
        title="Zonas de venta"
        subtitle="Cada dirección toma su zona según provincia + localidad. Mové localidades entre zonas o asigná las que quedaron sin zona."
        actions={
          <Link href="/dashboard/analytics">
            <Button variant="secondary">Ver análisis por zona</Button>
          </Link>
        }
      />

      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert kind="success" onClose={() => setSuccess(null)}>{success}</Alert>}

      {loading && zones.length === 0 ? (
        <LoadingBlock text="Cargando zonas..." />
      ) : (
        <div className="space-y-6">
          {/* LOCALIDADES SIN ZONA */}
          <Card
            title={`Localidades sin zona asignada (${unassigned.length})`}
            actions={<Badge tone={unassigned.length > 0 ? 'amber' : 'emerald'}>{unassigned.length > 0 ? 'Pendientes' : 'Al día'}</Badge>}
          >
            {unassigned.length === 0 ? (
              <p className="text-sm text-slate-400">Todas las direcciones activas tienen zona.</p>
            ) : (
              <div className="-mx-4 overflow-x-auto sm:-mx-5">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead className="border-b border-slate-700 text-[11px] uppercase tracking-wider text-slate-400">
                    <tr>
                      <th className="px-4 py-2">Provincia</th>
                      <th className="px-3 py-2">Localidad</th>
                      <th className="px-3 py-2 text-right">Direcciones</th>
                      <th className="px-3 py-2 text-right">Clientes</th>
                      <th className="px-4 py-2">Asignar a</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-700/60">
                    {unassigned.map((u) => {
                      const key = `${u.province}|${u.locality}`;
                      const options = zones.filter((z) => z.isActive && zoneAccepts(z, u.province));
                      return (
                        <tr key={key}>
                          <td className="px-4 py-2.5 text-slate-300">{u.provinceLabel}</td>
                          <td className="px-3 py-2.5 font-bold text-white">{u.localityLabel}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(u.addresses)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(u.customers)}</td>
                          <td className="px-4 py-2.5">
                            {options.length === 0 ? (
                              <span className="text-xs text-slate-500">
                                No hay zonas para esta provincia (se analiza por localidad).
                              </span>
                            ) : (
                              <div className="flex gap-2">
                                <select
                                  aria-label={`Zona para ${u.localityLabel}`}
                                  className={`${inputClass} py-1.5`}
                                  value={pick[key] ?? ''}
                                  onChange={(e) => setPick((p) => ({ ...p, [key]: e.target.value }))}
                                >
                                  <option value="">Elegir zona…</option>
                                  {options.map((z) => (
                                    <option key={z.id} value={z.id}>{z.name}</option>
                                  ))}
                                </select>
                                <Button
                                  size="sm"
                                  disabled={!pick[key]}
                                  loading={busy === key}
                                  onClick={() => {
                                    const zone = zones.find((z) => z.id === pick[key]);
                                    if (zone)
                                      assign(
                                        { zoneId: zone.id, province: u.province, locality: u.locality, label: u.localityLabel },
                                        key,
                                        zone.name,
                                      );
                                  }}
                                >
                                  Asignar
                                </Button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {/* ZONAS */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-bold text-white">Zonas y localidades</h2>
            <input
              className={`${inputClass} sm:max-w-xs`}
              placeholder="Buscar localidad…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {zones.length === 0 ? (
            <EmptyState title="No hay zonas cargadas" description="Ejecutá npm run seed:zones para cargar las zonas iniciales." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {filteredZones.map((z) => (
                <Card
                  key={z.id}
                  title={`${z.name}`}
                  actions={
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {z.province} · {z.localities.length} localidades · {formatNumber(z.addressCount)} direcciones
                      </span>
                      <Button size="sm" variant="secondary" onClick={() => setEditing({ kind: 'add', zone: z })}>
                        + Localidad
                      </Button>
                    </div>
                  }
                >
                  {z.visible.length === 0 ? (
                    <p className="text-sm text-slate-500">{q ? 'Sin coincidencias.' : 'Sin localidades.'}</p>
                  ) : (
                    <div className="flex max-h-56 flex-wrap gap-1.5 overflow-y-auto">
                      {z.visible.map((l) => (
                        <button
                          key={l.id}
                          onClick={() => setEditing({ kind: 'move', zone: z, locality: l })}
                          title="Mover de zona o quitar"
                          className={`rounded-full border px-2.5 py-1 text-xs transition-colors hover:border-amber-500 hover:text-white ${
                            l.addressCount > 0
                              ? 'border-amber-500/40 bg-amber-500/10 text-amber-200'
                              : 'border-slate-600 bg-slate-900 text-slate-300'
                          }`}
                        >
                          {l.label}
                          {l.addressCount > 0 && <span className="ml-1 font-bold">{l.addressCount}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-500">
            Resaltadas: localidades con direcciones cargadas (el número indica cuántas). Hacé clic en una localidad para moverla de zona.
          </p>
        </div>
      )}

      {editing && (
        <LocalityModal
          editing={editing}
          zones={zones}
          busy={busy !== null}
          onClose={() => setEditing(null)}
          onAssign={(zoneId, province, locality, label) => {
            const zone = zones.find((z) => z.id === zoneId);
            if (zone) assign({ zoneId, province, locality, label }, 'modal', zone.name);
          }}
          onRemove={removeLocality}
        />
      )}
    </div>
  );
}

function LocalityModal({
  editing,
  zones,
  busy,
  onClose,
  onAssign,
  onRemove,
}: {
  editing: Editing;
  zones: SalesZoneItem[];
  busy: boolean;
  onClose: () => void;
  onAssign: (zoneId: string, province: string, locality: string, label?: string) => void;
  onRemove: (loc: ZoneLocalityItem) => void;
}) {
  const isMove = editing.kind === 'move';
  const [zoneId, setZoneId] = useState(editing.zone.id);
  const [province, setProvince] = useState(isMove ? editing.locality.province : editing.zone.province);
  const [locality, setLocality] = useState(isMove ? editing.locality.label : '');
  const provinceKey = norm(province);
  const options = zones.filter((z) => z.isActive && (isMove ? zoneAccepts(z, provinceKey) : true));

  return (
    <Modal
      open
      title={isMove ? `Localidad: ${editing.locality.label}` : `Agregar localidad a ${editing.zone.name}`}
      onClose={onClose}
      footer={
        <>
          {isMove && (
            <Button variant="danger" disabled={busy} onClick={() => onRemove(editing.locality)}>
              Quitar de la zona
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button
            loading={busy}
            disabled={!locality.trim() || !province.trim() || (isMove && zoneId === editing.zone.id)}
            onClick={() =>
              isMove
                ? onAssign(zoneId, editing.locality.province, editing.locality.locality, editing.locality.label)
                : onAssign(zoneId, province, locality, locality.trim())
            }
          >
            {isMove ? 'Mover' : 'Agregar'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {isMove ? (
          <p className="text-sm text-slate-300">
            Zona actual: <span className="font-bold text-white">{editing.zone.name}</span> ·{' '}
            {editing.locality.addressCount} dirección(es) se recalcularán al moverla.
          </p>
        ) : (
          <>
            <Field label="Provincia" hint='Para CABA usá "CABA".'>
              <input className={inputClass} value={province} onChange={(e) => setProvince(e.target.value)} />
            </Field>
            <Field label="Localidad">
              <input
                className={inputClass}
                value={locality}
                placeholder="Ej. Villa Adelina"
                onChange={(e) => setLocality(e.target.value)}
                autoFocus
              />
            </Field>
          </>
        )}
        <Field label={isMove ? 'Mover a la zona' : 'Zona'}>
          <select className={inputClass} value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
            {options.map((z) => (
              <option key={z.id} value={z.id}>{z.name} ({z.province})</option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
