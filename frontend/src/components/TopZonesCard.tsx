// frontend/src/components/TopZonesCard.tsx

'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { analyticsService } from '@/services/analytics.service';
import { formatNumber } from '@/lib/format';
import { TopZonesResponse } from '@/types/analytics.types';
import { Card } from '@/components/ui';

/** Top 3 de zonas del último mes (Dashboard). Falla en silencio: no bloquea el panel. */
export default function TopZonesCard() {
  const [data, setData] = useState<TopZonesResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    analyticsService.topZones(30, 3).then(setData).catch(() => setFailed(true));
  }, []);

  const link = (province: string, zoneId: string | null) => {
    const p = new URLSearchParams({ province });
    if (zoneId) p.set('zoneId', zoneId);
    return `/dashboard/analytics?${p.toString()}`;
  };

  return (
    <Card
      title="Top zonas (últimos 30 días)"
      actions={
        <Link href="/dashboard/analytics" className="text-xs font-bold text-amber-400 hover:underline">
          Análisis por zona →
        </Link>
      }
    >
      {failed ? (
        <p className="text-sm text-slate-500">No se pudo cargar el ranking de zonas.</p>
      ) : !data ? (
        <p className="text-sm text-slate-500">Cargando…</p>
      ) : data.items.length === 0 ? (
        <p className="text-sm text-slate-500">Sin pedidos en los últimos 30 días.</p>
      ) : (
        <ol className="space-y-3">
          {data.items.map((z, i) => (
            <li key={`${z.province}|${z.zoneId}`}>
              <Link href={link(z.province, z.zoneId)} className="group block">
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate text-slate-200 group-hover:text-white">
                    <span className="mr-1.5 font-bold text-amber-400">{i + 1}.</span>
                    {z.label}
                    {z.zoneId && <span className="ml-1 text-xs text-slate-500">· {z.provinceLabel}</span>}
                  </span>
                  <span className="whitespace-nowrap font-bold tabular-nums text-white">
                    {formatNumber(z.orders)} ped.
                    <span className="ml-1 text-xs font-normal text-slate-400">({formatNumber(z.share, 1)}%)</span>
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-700">
                  <div className="h-full bg-amber-500" style={{ width: `${Math.max(z.share, 2)}%` }} />
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
