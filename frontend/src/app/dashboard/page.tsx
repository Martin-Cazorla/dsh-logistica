// frontend/src/app/dashboard/page.tsx

'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { routesService } from '@/services/routes.service';
import { inventoryService } from '@/services/inventory.service';
import { getApiErrorMessage } from '@/lib/axios';
import { can } from '@/lib/permissions';
import TopZonesCard from '@/components/TopZonesCard';
import { formatMinutes, formatNumber } from '@/lib/format';
import { DashboardMetrics, ROUTE_STATUS_LABELS, RouteStatus } from '@/types/routes.types';
import { ORDER_STATUS_LABELS, OrderStatus } from '@/types/picking.types';
import { WarehouseOccupancy } from '@/types/inventory.types';
import {
  Alert,
  Button,
  Card,
  LoadingBlock,
  PageHeader,
  ProgressBar,
  StatTile,
} from '@/components/ui';

const PIPELINE: OrderStatus[] = [
  'PENDING',
  'IN_PICKING',
  'PICKED',
  'CHECKED',
  'DISPATCHED',
  'RETURNED',
];

export default function DashboardPage() {
  const { user } = useAuth();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [warehouses, setWarehouses] = useState<WarehouseOccupancy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [m, w] = await Promise.all([
        routesService.metrics(),
        inventoryService.getWarehouseOccupancy(),
      ]);
      setMetrics(m);
      setWarehouses(w);
    } catch (err) {
      setError(getApiErrorMessage(err, 'No se pudieron cargar las métricas.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Panel de Control Operativo"
        subtitle={`Bienvenido, ${user?.fullName ?? ''}. Resumen de almacenes, pedidos y viajes.`}
        actions={
          <Button variant="secondary" onClick={load} loading={loading}>
            Actualizar
          </Button>
        }
      />

      {error && <Alert kind="error">{error}</Alert>}

      {loading && !metrics ? (
        <LoadingBlock text="Calculando métricas..." />
      ) : metrics ? (
        <div className="space-y-6">
          {/* Control de viajes: resumen ejecutivo */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Viajes en curso"
              value={metrics.inTransit}
              hint={`${metrics.today.total} hojas programadas hoy`}
              tone="text-sky-300"
            />
            <StatTile
              label="Viajes finalizados (30 d)"
              value={metrics.last30Days.completedTrips}
              hint={`Duración media ${formatMinutes(metrics.last30Days.avgTripMinutes)}`}
              tone="text-emerald-300"
            />
            <StatTile
              label="Efectividad de entrega"
              value={
                metrics.last30Days.successRate === null
                  ? '—'
                  : `${formatNumber(metrics.last30Days.successRate, 1)}%`
              }
              hint={`${metrics.last30Days.deliveredStops} ok · ${metrics.last30Days.partialStops} parciales · ${metrics.last30Days.failedStops} fallidas`}
              tone="text-amber-300"
            />
            <StatTile
              label="Uso medio de flota"
              value={
                metrics.last30Days.avgFleetUtilizationPct === null
                  ? '—'
                  : `${formatNumber(metrics.last30Days.avgFleetUtilizationPct, 1)}%`
              }
              hint={`${metrics.fleet.activeTrucks} camiones activos`}
              tone="text-purple-300"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              label="Bultos entregados (30 d)"
              value={formatNumber(metrics.last30Days.bultosDelivered)}
            />
            <StatTile
              label="Kg transportados (30 d)"
              value={formatNumber(metrics.last30Days.kgTransported)}
            />
            <StatTile
              label="Ajustes por aprobar"
              value={metrics.pendingStockRequests}
              hint="Conteos y descuentos de pickers"
              tone={metrics.pendingStockRequests > 0 ? 'text-red-300' : 'text-white'}
            />
            <StatTile
              label="Hojas de hoy"
              value={metrics.today.total}
              hint={
                Object.entries(metrics.today.byStatus)
                  .map(([s, n]) => `${ROUTE_STATUS_LABELS[s as RouteStatus]}: ${n}`)
                  .join(' · ') || 'Sin hojas programadas'
              }
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card
              title="Embudo de pedidos"
              actions={
                <Link href="/dashboard/orders" className="text-xs font-bold text-amber-400 hover:underline">
                  Ver pedidos →
                </Link>
              }
            >
              <ul className="space-y-3">
                {PIPELINE.map((status) => {
                  const value = metrics.orderPipeline[status] ?? 0;
                  const max = Math.max(
                    1,
                    ...PIPELINE.map((s) => metrics.orderPipeline[s] ?? 0),
                  );
                  return (
                    <li key={status}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="text-slate-300">{ORDER_STATUS_LABELS[status]}</span>
                        <span className="font-bold tabular-nums text-white">{value}</span>
                      </div>
                      <ProgressBar value={value} max={max} danger={1000} />
                    </li>
                  );
                })}
              </ul>
            </Card>

            <Card
              title="Ocupación de depósitos (m³)"
              actions={
                <Link href="/dashboard/inventory" className="text-xs font-bold text-amber-400 hover:underline">
                  Inventario →
                </Link>
              }
            >
              {warehouses.length === 0 ? (
                <p className="text-sm text-slate-500">Sin depósitos activos.</p>
              ) : (
                <ul className="space-y-3">
                  {warehouses.map((wh) => (
                    <li key={wh.id}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="text-slate-300">{wh.name}</span>
                        <span className="font-bold tabular-nums text-white">
                          {wh.occupancyPercentage === null
                            ? 'Sin capacidad'
                            : `${formatNumber(wh.occupancyPercentage, 1)}%`}
                          <span className="ml-1 text-xs font-normal text-slate-500">
                            ({formatNumber(wh.usedCapacityM3, 2)} / {formatNumber(wh.totalCapacityM3, 2)} m³)
                          </span>
                        </span>
                      </div>
                      <ProgressBar value={wh.usedCapacityM3} max={wh.totalCapacityM3} danger={95} />
                      {wh.locationsWithoutCapacity > 0 && (
                        <p className="mt-1 text-[11px] text-red-300">
                          {wh.locationsWithoutCapacity} ubicaciones sin capacidad cargada
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>

          {can(user?.role, 'ANALYTICS_VIEW') && <TopZonesCard />}

          <Card title="Accesos rápidos">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              {[
                { href: '/dashboard/orders', title: 'Nuevo pedido', desc: 'Alta y asignación de pickers' },
                { href: '/checking', title: 'Punto de Control 1', desc: 'Auditoría en playa (opcional)' },
                { href: '/dashboard/routes', title: 'Hojas de ruta', desc: 'Consolidación y control de viajes' },
                { href: '/dashboard/audit', title: 'Auditoría', desc: 'Historial inmutable de acciones' },
              ].map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="rounded-lg border border-slate-600 bg-slate-700/50 p-4 transition-colors hover:bg-slate-700"
                >
                  <span className="block font-bold text-white">{link.title}</span>
                  <span className="mt-1 block text-xs text-slate-400">{link.desc}</span>
                </Link>
              ))}
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
