// frontend/src/components/PalletLabelModal.tsx

'use client';

import React from 'react';
import { PalletLabelData, PalletLabelItem } from '@/types/inventory.types';

interface PalletLabelModalProps {
  data: PalletLabelData | null;
  onClose: () => void;
}

export default function PalletLabelModal({
  data,
  onClose,
}: PalletLabelModalProps) {
  if (!data) return null;

  const handlePrint = () => {
    window.print();
  };

  const formattedDate =
    data.dateStr ||
    data.date ||
    new Date().toLocaleDateString('es-AR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  const displayItems: PalletLabelItem[] =
    data.items && data.items.length > 0
      ? data.items
      : [
          {
            sku: data.productSku || 'N/A',
            description: data.productName || 'Producto General',
            quantityBultos: data.quantityBultos || 1,
            unitsPerBox: data.unitsPerBox || 1,
          },
        ];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white text-black p-8 rounded-xl max-w-3xl w-full print:p-0 print:m-0 print:max-w-none print:shadow-none">
        {/* BOTONES DE ACCIÓN (Ocultos al imprimir) */}
        <div className="flex justify-between items-center mb-6 print:hidden border-b pb-4">
          <h2 className="text-xl font-black text-slate-800">
            Rótulo A4 de Pallet / Bulto
          </h2>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-sm shadow"
            >
              Imprimir Rótulo
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-lg text-sm"
            >
              Cerrar
            </button>
          </div>
        </div>

        {/* PLANTILLA DE IMPRESIÓN A4 */}
        <div className="border-4 border-black p-6 space-y-6 text-black font-sans">
          <div className="flex justify-between items-start border-b-4 border-black pb-4">
            <div>
              <h1 className="text-3xl font-black tracking-tighter uppercase">
                {data.warehouseName || 'DSH LOGÍSTICA'}
              </h1>
              <p className="text-sm font-bold text-slate-700">
                REMITO / CONTENEDOR: {data.containerNumber || 'S/N'}
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs font-bold uppercase block">
                FECHA DE INGRESO
              </span>
              <span className="text-xl font-black">{formattedDate}</span>
            </div>
          </div>

          <div className="bg-black text-white p-4 rounded text-center">
            <span className="text-xs uppercase tracking-widest block font-bold">
              UBICACIÓN FÍSICA ASIGNADA
            </span>
            <span className="text-5xl font-black font-mono tracking-wider block mt-1">
              {data.locationCode || 'SIN UBICACIÓN'}
            </span>
          </div>

          {data.palletId && (
            <div className="text-center border-2 border-dashed border-black p-2">
              <span className="text-xs font-bold uppercase block">
                ID PALLET
              </span>
              <span className="text-lg font-mono font-bold">
                {data.palletId}
              </span>
            </div>
          )}

          <div className="space-y-2">
            <h3 className="text-sm font-black uppercase border-b-2 border-black pb-1">
              CONTENIDO Y BULTOS
            </h3>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-black text-xs uppercase">
                  <th className="py-1">SKU</th>
                  <th className="py-1">DESCRIPCIÓN</th>
                  <th className="py-1 text-right">BULTOS</th>
                  <th className="py-1 text-right">UNID/CAJA</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black text-sm font-bold">
                {displayItems.map((it: PalletLabelItem, idx: number) => (
                  <tr key={idx}>
                    <td className="py-2 font-mono">{it.sku}</td>
                    <td className="py-2">{it.description}</td>
                    <td className="py-2 text-right font-black text-lg">
                      {it.quantityBultos}
                    </td>
                    <td className="py-2 text-right">{it.unitsPerBox || 1}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="border-t-4 border-black pt-4 text-center">
            <p className="text-[10px] uppercase font-bold text-slate-600">
              SISTEMA LOGÍSTICO WMS / LOG FRED - CONTROL DE STOCK
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
