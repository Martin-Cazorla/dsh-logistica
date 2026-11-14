// frontend/src/app/sales/stock/page.tsx

'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/context/AuthContext';
import {
  inventoryService,
  StockAvailabilityResponse,
} from '@/services/inventory.service';
import { getApiErrorMessage } from '@/lib/axios';
import { can } from '@/lib/permissions';
import { formatDateTime } from '@/lib/format';
import { Alert, EmptyState, LoadingBlock, PageHeader } from '@/components/ui';

/**
 * Consulta de stock para el Vendedor (y cualquier rol con
 * STOCK_AVAILABILITY_VIEW). Sólo lectura:
 *  - stock DISPONIBLE (físico − reservado por pedidos en curso) por depósito;
 *  - sin ubicaciones, racks, pasillos ni lotes;
 *  - pensada para el celular: tarjetas por producto, búsqueda con debounce.
 */
export default function SalesStockPage() {
  return (
    <AppShell permissions={['STOCK_AVAILABILITY_VIEW']}>
      <SalesStockScreen />
    </AppShell>
  );
}

function SalesStockScreen() {
  const { user } = useAuth();
  const [search, setSearch] = useState('');
  const [data, setData] = useState<StockAvailabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async (term: string) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const result = await inventoryService.getAvailability(
        term.trim() || undefined,
      );
      // Descarta respuestas viejas si el usuario siguió escribiendo
      if (id === requestId.current) setData(result);
    } catch (err) {
      if (id === requestId.current) {
        setError(getApiErrorMessage(err, 'No se pudo consultar el stock.'));
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => load(search), 300);
    return () => clearTimeout(t);
  }, [search, load]);

  const warehouses = data?.warehouses ?? [];

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="Consulta de stock"
        subtitle="Disponible para vender por depósito (stock físico menos lo reservado por pedidos en curso). Sólo lectura."
        actions={
          can(user?.role, 'ORDERS_CREATE') ? (
            <Link
              href="/dashboard/orders"
              className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 hover:bg-amber-400"
            >
              Nuevo pedido
            </Link>
          ) : undefined
        }
      />

      <div className="sticky top-16 z-20 -mx-3 mb-4 bg-slate-900/95 px-3 py-2 backdrop-blur sm:static sm:mx-0 sm:bg-transparent sm:px-0 sm:py-0">
        <label htmlFor="stock-search" className="sr-only">
          Buscar por SKU o descripción
        </label>
        <input
          id="stock-search"
          type="search"
          inputMode="search"
          autoComplete="off"
          placeholder="Buscar por SKU, descripción o código de barras"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-slate-600 bg-slate-950 px-4 py-3 text-base text-slate-100 placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
        />
        {data && (
          <p className="mt-1 text-[11px] text-slate-500">
            {data.items.length} producto(s) · actualizado{' '}
            {formatDateTime(data.generatedAt)}
            {!search.trim() && ' · sin búsqueda se listan productos con stock'}
          </p>
        )}
      </div>

      {error && (
        <Alert kind="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading && !data ? (
        <LoadingBlock text="Consultando stock..." />
      ) : !data || data.items.length === 0 ? (
        <EmptyState
          title="Sin resultados"
          description="Pruebe con otro SKU o parte de la descripción."
        />
      ) : (
        <>
          {/* Móvil: una tarjeta por producto */}
          <ul className={`space-y-3 md:hidden ${loading ? 'opacity-60' : ''}`}>
            {data.items.map((item) => (
              <li
                key={item.productId}
                className="rounded-xl border border-slate-700 bg-slate-800 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-black text-amber-300">
                      {item.sku}
                    </p>
                    <p className="text-sm text-slate-200">{item.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {item.unitsPerBox} u. por bulto
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] uppercase text-slate-400">
                      Total
                    </p>
                    <p
                      className={`text-2xl font-black tabular-nums ${item.total > 0 ? 'text-emerald-300' : 'text-red-300'}`}
                    >
                      {item.total}
                    </p>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2">
                  {warehouses.map((w) => {
                    const qty = item.byWarehouse[w.id] ?? 0;
                    return (
                      <div
                        key={w.id}
                        className="flex items-center justify-between rounded-lg bg-slate-900 px-3 py-2"
                      >
                        <dt className="truncate text-xs text-slate-400">
                          {w.name}
                        </dt>
                        <dd
                          className={`ml-2 font-mono text-sm font-bold tabular-nums ${qty > 0 ? 'text-white' : 'text-slate-600'}`}
                        >
                          {qty}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </li>
            ))}
          </ul>

          {/* Escritorio: tabla producto × depósito */}
          <div
            className={`hidden overflow-x-auto rounded-xl border border-slate-700 md:block ${loading ? 'opacity-60' : ''}`}
          >
            <table className="min-w-full divide-y divide-slate-700 text-sm">
              <thead className="bg-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
                <tr>
                  <th className="px-4 py-3">Producto</th>
                  {warehouses.map((w) => (
                    <th key={w.id} className="px-3 py-3 text-right">
                      {w.name}
                    </th>
                  ))}
                  <th className="px-4 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 bg-slate-900">
                {data.items.map((item) => (
                  <tr key={item.productId}>
                    <td className="px-4 py-2.5">
                      <span className="font-mono font-bold text-amber-300">
                        {item.sku}
                      </span>
                      <span className="block text-xs text-slate-300">
                        {item.name}
                      </span>
                    </td>
                    {warehouses.map((w) => {
                      const qty = item.byWarehouse[w.id] ?? 0;
                      return (
                        <td
                          key={w.id}
                          className={`px-3 py-2.5 text-right font-mono tabular-nums ${qty > 0 ? 'text-white' : 'text-slate-600'}`}
                        >
                          {qty}
                        </td>
                      );
                    })}
                    <td
                      className={`px-4 py-2.5 text-right font-mono font-black tabular-nums ${item.total > 0 ? 'text-emerald-300' : 'text-red-300'}`}
                    >
                      {item.total}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
