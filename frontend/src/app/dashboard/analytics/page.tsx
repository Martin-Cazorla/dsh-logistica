// frontend/src/app/dashboard/analytics/page.tsx

'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import ProtectedRoute from '@/components/ProtectedRoute';
import { useAuth } from '@/context/AuthContext';
import { can } from '@/lib/permissions';
import { analyticsService } from '@/services/analytics.service';
import { getApiErrorMessage } from '@/lib/axios';
import { formatDate, formatNumber } from '@/lib/format';
import {
  AdditiveMetric,
  AnalyticsFilterOptions,
  AnalyticsFilters,
  SalesByZoneResponse,
  SalesByZoneRow,
} from '@/types/analytics.types';
import { OrderStatus } from '@/types/picking.types';
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
  StatTile,
} from '@/components/ui';

type MetricKey = Exclude<AdditiveMetric, 'volumeM3'>;

const METRICS: Array<{ key: MetricKey; label: string; decimals: number; money?: boolean }> = [
  { key: 'orders', label: 'Pedidos', decimals: 0 },
  { key: 'bultos', label: 'Bultos', decimals: 0 },
  { key: 'weightKg', label: 'Kg', decimals: 1 },
  { key: 'amount', label: 'Importe', decimals: 2, money: true },
];

type StatusPreset = 'active' | 'delivered' | 'all';
const STATUS_PRESETS: Record<StatusPreset, { label: string; statuses?: OrderStatus[] }> = {
  active: { label: 'No cancelados' },
  delivered: { label: 'Sólo entregados', statuses: ['DELIVERED'] },
  all: {
    label: 'Todos (incluye cancelados)',
    statuses: ['PENDING', 'IN_PICKING', 'PICKED', 'CHECKED', 'DISPATCHED', 'DELIVERED', 'RETURNED', 'CANCELLED'],
  },
};

/** Umbrales para marcar candidatas a reforzar con vendedores. */
const LOW_SHARE_RATIO = 0.5; // menos de la mitad del promedio del nivel
const FALLING_PCT = -20; // caída de 20 % o más contra el período anterior

const LEVEL_TITLES = {
  province: 'Provincias',
  zone: 'Zonas',
  locality: 'Localidades',
} as const;

const LEVEL_SINGULAR = {
  province: 'Provincia',
  zone: 'Zona',
  locality: 'Localidad',
} as const;

export default function AnalyticsPage() {
  return (
    <ProtectedRoute requiredPermissions={['ANALYTICS_VIEW']}>
      <Suspense fallback={<LoadingBlock text="Cargando análisis..." />}>
        <AnalyticsScreen />
      </Suspense>
    </ProtectedRoute>
  );
}

function AnalyticsScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // El nivel de drill-down vive en la URL (permite "atrás" del navegador y
  // links directos desde el Dashboard). Los filtros viven en el estado y se
  // mantienen al navegar entre niveles.
  const province = searchParams.get('province') ?? undefined;
  const zoneId = searchParams.get('zoneId') ?? undefined;

  const [options, setOptions] = useState<AnalyticsFilterOptions | null>(null);
  const [filters, setFilters] = useState<AnalyticsFilters>({});
  const [preset, setPreset] = useState<StatusPreset>('active');
  const [metric, setMetric] = useState<MetricKey>('orders');
  const [data, setData] = useState<SalesByZoneResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    analyticsService
      .filterOptions()
      .then((o) => {
        setOptions(o);
        setFilters((f) => ({ from: o.defaults.from, to: o.defaults.to, ...f }));
      })
      .catch((err) => setError(getApiErrorMessage(err, 'No se pudieron cargar los filtros.')));
  }, []);

  const load = useCallback(async () => {
    if (!filters.from) return;
    setLoading(true);
    setError(null);
    try {
      const res = await analyticsService.salesByZone(
        { ...filters, statuses: STATUS_PRESETS[preset].statuses },
        { province, zoneId },
      );
      setData(res);
      setExpanded(null);
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudo calcular el análisis.'));
    } finally {
      setLoading(false);
    }
  }, [filters, preset, province, zoneId]);

  useEffect(() => {
    load();
  }, [load]);

  const moneyVisible = !!data?.moneyVisible;
  const metricDef = METRICS.find((m) => m.key === metric) ?? METRICS[0];
  useEffect(() => {
    if (metric === 'amount' && data && !data.moneyVisible) setMetric('orders');
  }, [metric, data]);

  const navigate = (next: { province?: string; zoneId?: string }) => {
    const params = new URLSearchParams();
    if (next.province) params.set('province', next.province);
    if (next.zoneId) params.set('zoneId', next.zoneId);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  const onRowClick = (row: SalesByZoneRow) => {
    if (!data) return;
    if (data.level === 'province') navigate({ province: row.key });
    else if (data.level === 'zone') navigate({ province: data.context.province?.key, zoneId: row.key });
    else setExpanded((cur) => (cur === row.key ? null : row.key));
  };

  // Filas ordenadas por la métrica elegida + indicadores de baja actividad
  const analysis = useMemo(() => {
    if (!data) return null;
    const value = (r: SalesByZoneRow) => r.metrics[metric] ?? 0;
    const rows = [...data.rows].sort((a, b) => value(b) - value(a) || a.label.localeCompare(b.label));
    const n = rows.length;
    const mean = n > 0 ? rows.reduce((s, r) => s + value(r), 0) / n : 0;
    const max = Math.max(0, ...rows.map(value));
    const flagged = rows.map((r) => {
      const change = r.change[metric];
      // "Sin zona asignada" no es una zona a reforzar: es un pendiente de datos.
      const isZone = r.key !== 'none';
      const lowShare = isZone && n >= 3 && mean > 0 && value(r) < mean * LOW_SHARE_RATIO;
      const falling =
        isZone && change !== null && change !== undefined && change <= FALLING_PCT && (r.previous[metric] ?? 0) > 0;
      return { row: r, value: value(r), lowShare, falling };
    });
    return { rows: flagged, max, candidates: flagged.filter((f) => f.lowShare || f.falling) };
  }, [data, metric]);

  const fmt = (v: number | undefined) =>
    metricDef.money
      ? `$ ${formatNumber(v ?? 0, 2)}`
      : formatNumber(v ?? 0, metricDef.decimals);

  const canManageZones = can(user?.role, 'CUSTOMERS_MANAGE');

  return (
    <div>
      <PageHeader
        title="Análisis de ventas por zona"
        subtitle="Dónde se concentran los pedidos y qué zonas conviene reforzar con vendedores."
        actions={
          canManageZones ? (
            <Link href="/dashboard/zones">
              <Button variant="secondary">Administrar zonas</Button>
            </Link>
          ) : undefined
        }
      />

      {/* FILTROS (se mantienen al navegar entre niveles) */}
      <Card className="mb-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Desde">
            <input
              type="date"
              className={inputClass}
              value={filters.from ?? ''}
              max={filters.to}
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value || options?.defaults.from }))}
            />
          </Field>
          <Field label="Hasta">
            <input
              type="date"
              className={inputClass}
              value={filters.to ?? ''}
              min={filters.from}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value || options?.defaults.to }))}
            />
          </Field>
          <Field label="Depósito de origen">
            <select
              className={inputClass}
              value={filters.warehouseId ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, warehouseId: e.target.value || undefined }))}
            >
              <option value="">Todos</option>
              {options?.warehouses.map((w) => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Vendedor">
            <select
              className={inputClass}
              value={filters.sellerId ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, sellerId: e.target.value || undefined }))}
            >
              <option value="">Todos</option>
              <option value="none">Sin vendedor asignado</option>
              {options?.sellers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Estados">
            <select
              className={inputClass}
              value={preset}
              onChange={(e) => setPreset(e.target.value as StatusPreset)}
            >
              {(Object.keys(STATUS_PRESETS) as StatusPreset[]).map((k) => (
                <option key={k} value={k}>{STATUS_PRESETS[k].label}</option>
              ))}
            </select>
          </Field>
        </div>
        {data && (
          <p className="mt-3 text-xs text-slate-500">
            Período {formatDate(data.period.from)} – {formatDate(data.period.to)} ({data.period.days} días) · comparado con{' '}
            {formatDate(data.period.previousFrom)} – {formatDate(data.period.previousTo)}
          </p>
        )}
      </Card>

      {/* BREADCRUMB + MÉTRICA */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <nav aria-label="Nivel de análisis" className="flex flex-wrap items-center gap-1 text-sm">
          <Crumb active={!province} onClick={() => navigate({})}>Provincias</Crumb>
          {province && (
            <>
              <span className="text-slate-600">›</span>
              <Crumb active={!zoneId} onClick={() => navigate({ province })}>
                {data?.context.province?.label ?? '…'}
              </Crumb>
            </>
          )}
          {province && zoneId && (
            <>
              <span className="text-slate-600">›</span>
              <Crumb active>{data?.context.zone?.name ?? '…'}</Crumb>
            </>
          )}
        </nav>
        <div className="flex gap-1 rounded-xl border border-slate-700 bg-slate-900 p-1" role="radiogroup" aria-label="Métrica principal">
          {METRICS.filter((m) => !m.money || moneyVisible).map((m) => (
            <button
              key={m.key}
              role="radio"
              aria-checked={metric === m.key}
              onClick={() => setMetric(m.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                metric === m.key ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {error && <Alert kind="error" onClose={() => setError(null)}>{error}</Alert>}

      {loading && !data ? (
        <LoadingBlock text="Calculando..." />
      ) : data && analysis ? (
        <div className={`space-y-4 ${loading ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="Pedidos" value={formatNumber(data.totals.orders)} hint={changeHint(data.totals.orders, data.previousTotals.orders)} />
            <StatTile label="Clientes distintos" value={formatNumber(data.totals.customers)} hint={changeHint(data.totals.customers, data.previousTotals.customers)} />
            <StatTile label="Bultos" value={formatNumber(data.totals.bultos)} hint={`${formatNumber(data.totals.weightKg, 1)} kg · ${formatNumber(data.totals.volumeM3, 2)} m³`} />
            {moneyVisible ? (
              <StatTile label="Importe" value={`$ ${formatNumber(data.totals.amount ?? 0, 2)}`} hint={changeHint(data.totals.amount ?? 0, data.previousTotals.amount ?? 0)} tone="text-emerald-300" />
            ) : (
              <StatTile label={LEVEL_TITLES[data.level]} value={data.rows.length} hint="con pedidos en el período o el anterior" />
            )}
          </div>

          {analysis.candidates.length > 0 && (
            <Alert kind="warning">
              <span className="font-bold">Candidatas a reforzar con vendedores:</span>{' '}
              {analysis.candidates.map((c) => c.row.label).join(', ')}.{' '}
              <span className="font-normal opacity-80">
                Baja participación = menos de la mitad del promedio del nivel; en caída = −20 % o más contra el período anterior ({metricDef.label.toLowerCase()}).
              </span>
            </Alert>
          )}

          {data.rows.length === 0 ? (
            <EmptyState title="Sin pedidos para los filtros elegidos" description="Probá ampliar el rango de fechas o quitar filtros." />
          ) : (
            <>
              {/* GRÁFICO DE BARRAS HORIZONTALES */}
              <Card title={`${LEVEL_TITLES[data.level]} por ${metricDef.label.toLowerCase()}`}>
                <ul className="space-y-2">
                  {analysis.rows.map(({ row, value, lowShare, falling }) => {
                    const pct = analysis.max > 0 ? (value / analysis.max) * 100 : 0;
                    const clickable = row.drillable || data.level === 'locality';
                    return (
                      <li key={row.key}>
                        <button
                          type="button"
                          onClick={() => onRowClick(row)}
                          disabled={!clickable}
                          className="group grid w-full grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3 rounded-lg px-1 py-1 text-left hover:bg-slate-700/40 sm:grid-cols-[minmax(0,14rem)_1fr_auto]"
                          title={row.drillable ? `Ver detalle de ${row.label}` : undefined}
                        >
                          <span className={`truncate text-sm ${row.key === 'none' ? 'italic text-slate-400' : 'text-slate-200'} group-hover:text-white`}>
                            {row.label}
                          </span>
                          <span className="h-5 overflow-hidden rounded bg-slate-700/60">
                            <span
                              className={`block h-full rounded ${lowShare || falling ? 'bg-red-500/70' : 'bg-amber-500'}`}
                              style={{ width: `${Math.max(pct, value > 0 ? 1.5 : 0)}%` }}
                            />
                          </span>
                          <span className="w-24 text-right text-sm font-bold tabular-nums text-white">
                            {fmt(value)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Card>

              {/* TABLA */}
              <Card title="Detalle">
                <div className="-mx-4 overflow-x-auto sm:-mx-5">
                  <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="border-b border-slate-700 text-[11px] uppercase tracking-wider text-slate-400">
                      <tr>
                        <th className="px-4 py-2">{LEVEL_SINGULAR[data.level]}</th>
                        <th className="px-3 py-2 text-right">Pedidos</th>
                        <th className="px-3 py-2 text-right">Clientes</th>
                        <th className="px-3 py-2 text-right">Bultos</th>
                        <th className="px-3 py-2 text-right">Kg</th>
                        <th className="px-3 py-2 text-right">m³</th>
                        {moneyVisible && <th className="px-3 py-2 text-right">Importe</th>}
                        <th className="px-3 py-2 text-right">% {metricDef.label}</th>
                        <th className="px-3 py-2 text-right">Var. vs anterior</th>
                        <th className="px-4 py-2">Indicadores</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-700/60">
                      {analysis.rows.map(({ row, lowShare, falling }) => (
                        <React.Fragment key={row.key}>
                          <tr
                            className={`cursor-pointer hover:bg-slate-700/30 ${expanded === row.key ? 'bg-slate-700/30' : ''}`}
                            onClick={() => onRowClick(row)}
                          >
                            <td className="px-4 py-2.5">
                              <span className={`font-bold ${row.key === 'none' ? 'italic text-slate-400' : 'text-white'}`}>{row.label}</span>
                              {row.drillable && <span className="ml-1 text-xs text-amber-400">›</span>}
                              {data.level === 'locality' && (
                                <span className="ml-1 text-xs text-slate-500">{expanded === row.key ? '▾' : '▸'}</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(row.metrics.orders)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(row.metrics.customers)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(row.metrics.bultos)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(row.metrics.weightKg, 1)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(row.metrics.volumeM3, 2)}</td>
                            {moneyVisible && (
                              <td className="px-3 py-2.5 text-right tabular-nums">$ {formatNumber(row.metrics.amount ?? 0, 2)}</td>
                            )}
                            <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(row.share[metric] ?? 0, 1)}%</td>
                            <td className="px-3 py-2.5 text-right"><Change value={row.change[metric]} /></td>
                            <td className="px-4 py-2.5">
                              <div className="flex flex-wrap gap-1">
                                {lowShare && <Badge tone="red">Baja participación</Badge>}
                                {falling && <Badge tone="amber">En caída</Badge>}
                                {row.key === 'none' && canManageZones && (
                                  <Link
                                    href="/dashboard/zones"
                                    onClick={(e) => e.stopPropagation()}
                                    className="text-xs font-bold text-amber-400 hover:underline"
                                  >
                                    Asignar zonas →
                                  </Link>
                                )}
                              </div>
                            </td>
                          </tr>
                          {data.level === 'locality' && expanded === row.key && (
                            <tr className="bg-slate-900/60">
                              <td colSpan={moneyVisible ? 10 : 9} className="px-4 py-3">
                                <LocalityDetail row={row} moneyVisible={moneyVisible} />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-slate-600 font-bold text-white">
                      <tr>
                        <td className="px-4 py-2.5">Total</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(data.totals.orders)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums" title="Clientes distintos del nivel (un cliente con pedidos en varias filas cuenta una vez)">
                          {formatNumber(data.totals.customers)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(data.totals.bultos)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(data.totals.weightKg, 1)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(data.totals.volumeM3, 2)}</td>
                        {moneyVisible && (
                          <td className="px-3 py-2.5 text-right tabular-nums">$ {formatNumber(data.totals.amount ?? 0, 2)}</td>
                        )}
                        <td className="px-3 py-2.5 text-right">100%</td>
                        <td className="px-3 py-2.5 text-right">
                          <Change value={pctChange(data.totals[metric] ?? 0, data.previousTotals[metric] ?? 0)} />
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {data.level === 'locality' && (
                  <p className="mt-3 text-xs text-slate-500">Hacé clic en una localidad para ver sus 5 principales clientes y los vendedores con pedidos.</p>
                )}
              </Card>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Crumb({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
}) {
  if (active || !onClick) {
    return <span className="rounded px-2 py-1 font-bold text-amber-400">{children}</span>;
  }
  return (
    <button onClick={onClick} className="rounded px-2 py-1 font-medium text-slate-300 hover:bg-slate-800 hover:text-white">
      {children}
    </button>
  );
}

function pctChange(cur: number, prev: number): number | null {
  if (prev > 0) return Math.round(((cur - prev) / prev) * 1000) / 10;
  return cur > 0 ? null : 0;
}

function changeHint(cur: number, prev: number) {
  const c = pctChange(cur, prev);
  if (c === null) return 'Sin actividad en el período anterior';
  return `${c > 0 ? '+' : ''}${formatNumber(c, 1)}% vs período anterior`;
}

function Change({ value }: { value: number | null | undefined }) {
  if (value === null) return <Badge tone="sky">Nuevo</Badge>;
  if (value === undefined || value === 0) return <span className="text-slate-500 tabular-nums">0%</span>;
  const up = value > 0;
  return (
    <span className={`font-bold tabular-nums ${up ? 'text-emerald-400' : 'text-red-400'}`}>
      {up ? '▲' : '▼'} {formatNumber(Math.abs(value), 1)}%
    </span>
  );
}

function LocalityDetail({ row, moneyVisible }: { row: SalesByZoneRow; moneyVisible: boolean }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Top 5 clientes</p>
        {row.topCustomers && row.topCustomers.length > 0 ? (
          <ol className="space-y-1 text-sm">
            {row.topCustomers.map((c, i) => (
              <li key={c.customerId} className="flex justify-between gap-3">
                <span className="truncate text-slate-200">{i + 1}. {c.name}</span>
                <span className="whitespace-nowrap tabular-nums text-slate-400">
                  {c.orders} ped. · {formatNumber(c.bultos)} bultos
                  {moneyVisible && c.amount !== undefined ? ` · $ ${formatNumber(c.amount, 2)}` : ''}
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-slate-500">Sin pedidos en el período actual.</p>
        )}
      </div>
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Vendedores con pedidos</p>
        {row.sellers && row.sellers.length > 0 ? (
          <ul className="space-y-1 text-sm">
            {row.sellers.map((s) => (
              <li key={s.sellerId ?? 'none'} className="flex justify-between gap-3">
                <span className={s.sellerId ? 'text-slate-200' : 'italic text-amber-300'}>{s.name}</span>
                <span className="tabular-nums text-slate-400">{s.orders} ped. · {formatNumber(s.bultos)} bultos</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500">Sin pedidos en el período actual.</p>
        )}
      </div>
    </div>
  );
}
