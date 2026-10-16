// frontend/src/components/PalletLabelModal.tsx

'use client';

import React from 'react';
import { PalletLabelData } from '@/types/inventory.types';

interface Props {
  data: PalletLabelData | null;
  onClose: () => void;
}

export default function PalletLabelModal({ data, onClose }: Props) {
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

  const displaySku = data.productSku || 'N/A';
  const displayProductName = data.productName || 'Producto General';
  const displayBultos = data.quantityBultos || 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 print:p-0 print:bg-white print:fixed print:inset-0">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl print:shadow-none print:border-none print:bg-white print:w-full print:max-w-none">
        {/* CONTROLES (OCULTOS EN IMPRESIÓN) */}
        <div className="flex justify-between items-center bg-slate-950 p-4 border-b border-slate-800 print:hidden">
          <h3 className="font-bold text-amber-400 text-sm">
            Vista Previa - Rótulo de Pallet A4 (Lectura a 5m)
          </h3>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs transition-colors"
            >
              🖨️ IMPRIMIR RÓTULO
            </button>
            <button
              onClick={onClose}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs"
            >
              Cerrar
            </button>
          </div>
        </div>

        {/* PLANTILLA DE IMPRESIÓN A4 ALTO CONTRASTE */}
        <div className="p-8 bg-white text-black font-sans min-h-[550px] flex flex-col justify-between border-8 border-black print:border-8 print:m-0 print:h-screen">
          {/* DEPÓSITO Y FECHA */}
          <div className="flex justify-between items-center border-b-8 border-black pb-4">
            <div>
              <span className="text-xl font-black uppercase tracking-wider block text-slate-600">
                DEPÓSITO
              </span>
              <span className="text-4xl font-black uppercase tracking-tight">
                {data.warehouseName || 'GENERAL'}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xl font-black uppercase tracking-wider block text-slate-600">
                FECHA DE INGRESO
              </span>
              <span className="text-3xl font-black font-mono">
                {formattedDate}
              </span>
            </div>
          </div>

          {/* SKU GIGANTE */}
          <div className="my-6 text-center py-8 border-b-8 border-black">
            <span className="text-2xl font-black uppercase tracking-widest block text-slate-600 mb-2">
              CÓDIGO SKU
            </span>
            <h1 className="text-8xl font-black tracking-tighter font-mono bg-black text-white py-6 rounded-2xl leading-none">
              {displaySku}
            </h1>
            <p className="text-3xl font-bold uppercase mt-4 text-slate-900 truncate">
              {displayProductName}
            </p>
          </div>

          {/* BULTOS DEL PALLET GIGANTE */}
          <div className="bg-amber-300 p-6 border-8 border-black text-center mb-4">
            <span className="text-2xl font-black uppercase tracking-wider block text-slate-900">
              BULTOS EN ESTE PALLET
            </span>
            <span className="text-7xl font-black font-mono text-black leading-none">
              {displayBultos}
            </span>
          </div>

          {/* PIE */}
          <div className="flex justify-between items-center pt-2 text-xs font-bold uppercase text-slate-600 border-t-4 border-black">
            <span>REMITO / CONTENEDOR: {data.containerNumber || 'N/A'}</span>
            <span>LOG FRED - SISTEMA DE GESTIÓN WMS</span>
          </div>
        </div>
      </div>
    </div>
  );
}
