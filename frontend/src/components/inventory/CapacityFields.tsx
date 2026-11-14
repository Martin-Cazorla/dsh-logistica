// frontend/src/components/inventory/CapacityFields.tsx

'use client';

import React from 'react';
import {
  formatM3,
  MAX_CAPACITY_M3,
  MAX_DIMENSION_M,
  parseDecimalInput,
  roundM3,
  validateMeasure,
} from '@/lib/decimal';

/**
 * Borrador de capacidad tal como lo escribe el operario (texto, con coma o
 * punto). Se cargan las tres medidas (la capacidad se calcula sola) o el m³
 * directo si no se conocen las medidas.
 */
export interface CapacityDraft {
  lengthM: string;
  widthM: string;
  heightM: string;
  capacityM3: string;
}

export const EMPTY_CAPACITY_DRAFT: CapacityDraft = {
  lengthM: '',
  widthM: '',
  heightM: '',
  capacityM3: '',
};

export interface CapacityPayload {
  capacity?: number;
  lengthM?: number;
  widthM?: number;
  heightM?: number;
}

export interface ResolvedDraft {
  error: string | null;
  /** m³ resultante (calculado o directo); null si es inválido o vacío. */
  capacityM3: number | null;
  usesDimensions: boolean;
  payload: CapacityPayload | null;
}

/** Misma regla que el backend (src/inventory/occupancy/location-occupancy.ts). */
export function resolveCapacityDraft(draft: CapacityDraft): ResolvedDraft {
  const dims = [draft.lengthM, draft.widthM, draft.heightM];
  const filled = dims.filter((d) => d.trim() !== '').length;

  if (filled > 0 && filled < 3) {
    return {
      error:
        'Complete las tres medidas (largo, ancho y alto) o déjelas vacías.',
      capacityM3: null,
      usesDimensions: true,
      payload: null,
    };
  }

  if (filled === 3) {
    const labels = ['Largo', 'Ancho', 'Alto'];
    for (let i = 0; i < 3; i++) {
      const err = validateMeasure(dims[i], `${labels[i]} (m)`, MAX_DIMENSION_M);
      if (err)
        return {
          error: err,
          capacityM3: null,
          usesDimensions: true,
          payload: null,
        };
    }
    const [l, w, h] = dims.map((d) => parseDecimalInput(d)!);
    const capacity = roundM3(l * w * h);
    if (capacity <= 0 || capacity > MAX_CAPACITY_M3) {
      return {
        error: `La capacidad resultante debe estar entre 0,001 y ${MAX_CAPACITY_M3} m³.`,
        capacityM3: capacity,
        usesDimensions: true,
        payload: null,
      };
    }
    return {
      error: null,
      capacityM3: capacity,
      usesDimensions: true,
      payload: { lengthM: l, widthM: w, heightM: h },
    };
  }

  const err = validateMeasure(
    draft.capacityM3,
    'Capacidad (m³)',
    MAX_CAPACITY_M3,
  );
  if (err)
    return {
      error: err,
      capacityM3: null,
      usesDimensions: false,
      payload: null,
    };
  const capacity = roundM3(parseDecimalInput(draft.capacityM3)!);
  return {
    error: null,
    capacityM3: capacity,
    usesDimensions: false,
    payload: { capacity },
  };
}

const inputBase =
  'w-full bg-slate-950 border border-slate-800 rounded-lg p-2 font-mono text-white focus:border-amber-500 focus:outline-none';

/**
 * Inputs de texto con teclado decimal (inputMode="decimal") en lugar de
 * type="number": type="number" rechaza la coma según el idioma del navegador
 * y los operarios escriben "1,5". La precisión (hasta 3 decimales) se valida
 * en resolveCapacityDraft y en el backend.
 */
export default function CapacityFields({
  value,
  onChange,
  compact = false,
}: {
  value: CapacityDraft;
  onChange: (next: CapacityDraft) => void;
  compact?: boolean;
}) {
  const resolved = resolveCapacityDraft(value);
  const anyDim = [value.lengthM, value.widthM, value.heightM].some(
    (d) => d.trim() !== '',
  );

  const field = (
    key: keyof CapacityDraft,
    label: string,
    placeholder: string,
    disabled = false,
  ) => (
    <label className="block">
      <span className="mb-1 block text-[11px] text-slate-400">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={placeholder}
        value={value[key]}
        disabled={disabled}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        className={`${inputBase} ${compact ? 'p-1.5 text-xs' : ''} disabled:opacity-40`}
      />
    </label>
  );

  return (
    <div className="space-y-2">
      <div
        className={`grid gap-2 ${compact ? 'grid-cols-4' : 'grid-cols-2 sm:grid-cols-4'}`}
      >
        {field('lengthM', 'Largo (m)', '1,000')}
        {field('widthM', 'Ancho (m)', '1,000')}
        {field('heightM', 'Alto (m)', '1,500')}
        {field(
          'capacityM3',
          anyDim ? 'm³ (calculado)' : 'o m³ directo',
          '1,250',
          anyDim,
        )}
      </div>
      <p
        className={`text-[11px] font-mono ${resolved.error && (anyDim || value.capacityM3.trim() !== '') ? 'text-red-400' : 'text-slate-400'}`}
        aria-live="polite"
      >
        {resolved.error && (anyDim || value.capacityM3.trim() !== '')
          ? resolved.error
          : resolved.capacityM3 !== null
            ? resolved.usesDimensions
              ? `${value.lengthM} × ${value.widthM} × ${value.heightM} = ${formatM3(resolved.capacityM3)} m³`
              : `Capacidad: ${formatM3(resolved.capacityM3)} m³`
            : 'Cargue las tres medidas o la capacidad en m³.'}
      </p>
    </div>
  );
}
