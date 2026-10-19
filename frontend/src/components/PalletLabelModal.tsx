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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 print:p-0 print:bg-white print:fixed print:inset-0 print:block">
      {/* ESTILOS ESPECÍFICOS DE IMPRESIÓN MONOCROMÁTICA A4 */}
      <style jsx global>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }
          body {
            background-color: #ffffff !important;
            color: #000000 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>

      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl print:shadow-none print:border-none print:bg-white print:w-full print:max-w-none print:h-screen">
        {/* CONTROLES DE PANTALLA (OCULTOS EN IMPRESIÓN) */}
        <div className="flex justify-between items-center bg-slate-950 p-4 border-b border-slate-800 print:hidden">
          <h3 className="font-bold text-amber-400 text-sm">
            Vista Previa - Rótulo de Pallet A4 (Monocromático / Alto Contraste)
          </h3>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl text-xs transition-colors"
            >
              🖨️ IMPRIMIR RÓTULO
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs"
            >
              Cerrar
            </button>
          </div>
        </div>

        {/* PLANTILLA DE IMPRESIÓN A4 MONOCROMÁTICA (BLANCO Y NEGRO PURO) */}
        <div className="p-8 bg-white text-black font-sans min-h-[550px] flex flex-col justify-between border-8 border-black print:border-[12px] print:border-black print:p-8 print:m-0 print:h-screen print:w-screen print:box-border print:justify-between">
          {/* ENCABEZADO: DEPÓSITO Y FECHA */}
          <div className="flex justify-between items-start border-b-8 border-black pb-4">
            <div>
              <span className="text-xl font-black uppercase tracking-wider block text-black">
                DEPÓSITO
              </span>
              <span className="text-5xl font-black uppercase tracking-tight text-black block mt-1">
                {data.warehouseName || 'GENERAL'}
              </span>
            </div>
            <div className="text-right">
              <span className="text-xl font-black uppercase tracking-wider block text-black">
                FECHA DE INGRESO
              </span>
              <span className="text-3xl font-black font-mono text-black block mt-1">
                {formattedDate}
              </span>
            </div>
          </div>

          {/* CÓDIGO SKU GIGANTE EN NEGRO ENMARCADO (GARANTIZA VISIBILIDAD EN B/N) */}
          <div className="my-4 text-center py-6 border-b-8 border-black">
            <span className="text-2xl font-black uppercase tracking-widest block text-black mb-2">
              CÓDIGO SKU
            </span>
            <div className="border-8 border-black bg-black text-white py-6 px-4 rounded-2xl print:bg-black print:text-white">
              <h1 className="text-8xl print:text-9xl font-black tracking-tighter font-mono leading-none m-0 p-0 text-white">
                {displaySku}
              </h1>
            </div>
            <p className="text-3xl font-black uppercase mt-4 text-black truncate">
              {displayProductName}
            </p>
          </div>

          {/* BULTOS DEL PALLET GIGANTE EN BLOQUE MONOCROMÁTICO */}
          <div className="border-8 border-black text-center p-6 bg-white mb-2">
            <span className="text-2xl font-black uppercase tracking-wider block text-black">
              BULTOS EN ESTE PALLET
            </span>
            <span className="text-8xl font-black font-mono text-black leading-none block mt-2">
              {displayBultos}
            </span>
          </div>

          {/* PIE DE PÁGINA */}
          <div className="flex justify-between items-center pt-3 text-sm font-black uppercase text-black border-t-8 border-black">
            <span>POSICIÓN: {data.locationCode || 'S/U'}</span>
            <span>REMITO: {data.containerNumber || 'N/A'}</span>
            <span>LOG FRED WMS</span>
          </div>
        </div>
      </div>
    </div>
  );
}
