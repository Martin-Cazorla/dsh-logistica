// frontend/src/lib/decimal.ts

/**
 * Entrada decimal tolerante: los operarios escriben "1,5" o "1.5".
 * Devuelve null si el texto está vacío o no es un número válido.
 */
export function parseDecimalInput(
  raw: string | number | null | undefined,
): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const normalized = raw.trim().replace(/\s/g, '').replace(',', '.');
  if (normalized === '') return null;
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

/** Cantidad de decimales del texto ingresado ("1,250" -> 3). */
export function decimalPlaces(raw: string): number {
  const normalized = raw.trim().replace(',', '.');
  const idx = normalized.indexOf('.');
  return idx < 0 ? 0 : normalized.length - idx - 1;
}

/**
 * Valida un valor de medida/capacidad: número > 0, hasta 3 decimales y
 * menor o igual a `max`. Devuelve el mensaje de error o null si es válido.
 */
export function validateMeasure(
  raw: string,
  label: string,
  max: number,
): string | null {
  const value = parseDecimalInput(raw);
  if (value === null)
    return `${label}: ingrese un número (use coma o punto decimal).`;
  if (decimalPlaces(raw) > 3) return `${label}: hasta 3 decimales.`;
  if (!(value > 0)) return `${label}: debe ser mayor a 0.`;
  if (value > max) return `${label}: máximo ${max.toLocaleString('es-AR')}.`;
  return null;
}

export function roundM3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Formato de m³ con 3 decimales y coma: 1.5 -> "1,500". */
export function formatM3(
  value: number | null | undefined,
  decimals = 3,
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return value.toLocaleString('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Número para mostrar en un input de texto editable ("1.5" -> "1,5"). */
export function toInputText(value: number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value).replace('.', ',');
}

export const MAX_DIMENSION_M = 20;
export const MAX_CAPACITY_M3 = 1000;
