// frontend/src/app/print/orders/[id]/page.tsx

'use client';

import React, { useEffect, useState } from 'react';
import ProtectedRoute from '@/components/ProtectedRoute';
import { ordersService } from '@/services/orders.service';
import { getApiErrorMessage } from '@/lib/axios';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format';
import { OrderPrintSheet } from '@/types/orders.types';
import { ORDER_STATUS_LABELS } from '@/types/picking.types';

/**
 * Hoja de preparación del pedido (A4). Una fila por toma de picking:
 * depósito + ubicación, agrupada por depósito y en el orden del recorrido.
 */
export default function OrderPrintPage({ params }: { params: { id: string } }) {
  return (
    <ProtectedRoute requiredPermissions={['ORDERS_VIEW']}>
      <PrintSheet id={params.id} />
    </ProtectedRoute>
  );
}

function PrintSheet({ id }: { id: string }) {
  const [sheet, setSheet] = useState<OrderPrintSheet | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    ordersService
      .getPrintSheet(id)
      .then((s) => {
        setSheet(s);
        document.title = `Pedido ${s.orderNumber} - Hoja de preparación`;
      })
      .catch((err) => setError(getApiErrorMessage(err, 'No se pudo cargar el pedido.')));
  }, [id]);

  if (error) {
    return <p className="p-8 text-red-700">{error}</p>;
  }
  if (!sheet) {
    return <p className="p-8 text-slate-500">Cargando hoja de preparación…</p>;
  }

  return (
    <div className="print-root mx-auto max-w-[210mm] bg-white p-8 text-[12px] leading-snug text-black">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          html, body { background: #fff !important; }
          .no-print { display: none !important; }
          .print-root { padding: 0 !important; max-width: none !important; }
          .print-group { break-inside: auto; }
          .print-table thead { display: table-header-group; }
          .print-table tr { break-inside: avoid; }
        }
      `}</style>

      <div className="no-print mb-6 flex justify-end gap-2">
        <button
          className="rounded border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-100"
          onClick={() => window.close()}
        >
          Cerrar
        </button>
        <button
          className="rounded bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700"
          onClick={() => window.print()}
        >
          Imprimir
        </button>
      </div>

      {/* ENCABEZADO */}
      <header className="mb-4 border-b-2 border-black pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest">DSH Logística · Hoja de preparación</p>
            <h1 className="mt-1 text-2xl font-black">Pedido / Presupuesto N° {sheet.orderNumber}</h1>
          </div>
          <div className="text-right text-[11px]">
            <p>Emitido: {formatDateTime(sheet.createdAt)}</p>
            <p>Estado: {ORDER_STATUS_LABELS[sheet.status]}</p>
          </div>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5">
          <div>
            <dt className="text-[10px] font-bold uppercase text-slate-600">Razón social</dt>
            <dd className="font-bold">
              {sheet.customerName} <span className="font-normal text-slate-600">· CUIT {sheet.customerCuit}</span>
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase text-slate-600">Fecha estimada de entrega</dt>
            <dd className="font-bold">{sheet.estimatedDeliveryDate ? formatDate(sheet.estimatedDeliveryDate) : 'Sin definir'}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase text-slate-600">Dirección de entrega</dt>
            <dd>{sheet.deliveryAddress}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase text-slate-600">Vendedor</dt>
            <dd>{sheet.sellerName ?? 'Sin asignar'}</dd>
          </div>
        </dl>
        {sheet.notes && (
          <p className="mt-2 text-[11px]">
            <span className="font-bold">Observaciones:</span> {sheet.notes}
          </p>
        )}
      </header>

      {/* ARTÍCULOS POR DEPÓSITO, EN ORDEN DE RECORRIDO */}
      <table className="print-table w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-black text-left text-[11px] uppercase">
            <th className="py-1.5 pr-2">Código</th>
            <th className="py-1.5 pr-2">Descripción</th>
            <th className="py-1.5 pr-2 text-right">Bultos</th>
            <th className="py-1.5 pr-2 text-right">Unidades</th>
            <th className="py-1.5 pr-2">Ubicación</th>
            <th className="py-1.5">Depósito</th>
          </tr>
        </thead>
        {sheet.groups.map((group) => (
          <tbody key={group.warehouse?.id ?? 'sin-asignar'} className="print-group">
            <tr className="bg-slate-100">
              <td colSpan={6} className="border-y border-black px-1 py-1 text-[11px] font-black uppercase">
                {group.warehouse ? `Depósito ${group.warehouse.name}` : 'Sin stock asignado'}
                <span className="ml-2 font-semibold normal-case">· {group.totalBultos} bultos</span>
              </td>
            </tr>
            {group.rows.map((row, idx) => (
              <tr key={`${row.sku}-${row.location ?? 'x'}-${idx}`} className="border-b border-slate-300 align-top">
                <td className="py-1.5 pr-2 font-mono font-bold">
                  {row.sku}
                  {row.replacement && <span className="ml-1 font-sans text-[10px] font-normal">(reemplazo)</span>}
                </td>
                <td className="py-1.5 pr-2">{row.description}</td>
                <td className="py-1.5 pr-2 text-right font-bold tabular-nums">{row.bultos}</td>
                <td className="py-1.5 pr-2 text-right tabular-nums">{formatNumber(row.units)}</td>
                <td className="py-1.5 pr-2 font-mono">{row.location ?? '—'}</td>
                <td className="py-1.5">{row.warehouse ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>

      {/* PIE */}
      <footer className="mt-4 flex items-start justify-between gap-6 border-t-2 border-black pt-3">
        <div>
          <p className="text-[10px] font-bold uppercase text-slate-600">Envío</p>
          <p className="text-base font-black">{sheet.shippingLabel}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase text-slate-600">Total de bultos</p>
          <p className="text-2xl font-black tabular-nums">
            {sheet.totalBultos}
            {sheet.totalBultos !== sheet.orderedBultos && (
              <span className="ml-1 text-sm font-semibold">(pedido: {sheet.orderedBultos})</span>
            )}
          </p>
        </div>
      </footer>

      {sheet.shortages.length > 0 && (
        <section className="mt-3 border border-black p-2">
          <p className="text-[10px] font-bold uppercase">Observaciones de preparación / Faltantes</p>
          <ul className="mt-1 list-disc pl-5 text-[11px]">
            {sheet.shortages.map((s) => (
              <li key={s.sku}>{s.text}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10 grid grid-cols-2 gap-10 text-[11px]">
        <div>
          {/* En blanco si aún no hay pickers: se completa a mano */}
          <p className="min-h-[1.25rem] text-center text-[12px] font-semibold">{sheet.preparedBy.join(', ')}</p>
          <p className="border-t border-black pt-1 text-center">Preparó</p>
        </div>
        <div>
          <p className="min-h-[1.25rem]" />
          <p className="border-t border-black pt-1 text-center">Controló</p>
        </div>
      </div>
    </div>
  );
}
