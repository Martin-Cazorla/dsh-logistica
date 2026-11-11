// dsh-logistica/src/common/sales.ts

import { UserRole } from '@prisma/client';
import { Permission, hasPermission } from '../auth/permissions';

/**
 * Módulo de Ventas (monetario). Deshabilitado por defecto: los modelos y DTOs
 * ya aceptan precios y totales, pero mientras SALES_MODULE_ENABLED !== 'true'
 * los valores monetarios se ignoran al escribir y no se exponen al leer.
 */
export function isSalesModuleEnabled(): boolean {
  return process.env.SALES_MODULE_ENABLED === 'true';
}

/** El usuario puede ver montos sólo con el módulo activo y permiso SALES_VIEW. */
export function canViewMoney(role: UserRole): boolean {
  return isSalesModuleEnabled() && hasPermission(role, Permission.SALES_VIEW);
}

const MONEY_KEYS = new Set([
  'unitPrice',
  'lineTotal',
  'discountPct',
  'subtotalAmount',
  'discountAmount',
  'taxAmount',
  'totalAmount',
]);

/**
 * Elimina recursivamente los campos monetarios de una respuesta. Se aplica
 * sobre objetos planos (resultados de Prisma); fechas y Decimals no-monetarios
 * se preservan.
 */
export function stripMoney<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => stripMoney(v)) as unknown as T;
  }
  if (
    value !== null &&
    typeof value === 'object' &&
    !(value instanceof Date) &&
    Object.getPrototypeOf(value) === Object.prototype
  ) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (MONEY_KEYS.has(key)) continue;
      out[key] = stripMoney(v);
    }
    return out as T;
  }
  return value;
}
