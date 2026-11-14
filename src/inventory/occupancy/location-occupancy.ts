// dsh-logistica/src/inventory/occupancy/location-occupancy.ts

import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

/**
 * ÚNICA fuente del cálculo de capacidad y ocupación de ubicaciones.
 *
 * Unidad: metros cúbicos.
 *   - Capacidad de la ubicación: Location.capacity (m³). 0 = sin capacidad cargada.
 *   - Volumen ocupado: Σ (bultos almacenados × volumen unitario del producto).
 *
 * La usan InventoryService (malla, mantenimiento, dashboard) y
 * OccupationService (/inventory/occupation), así ambas pantallas muestran el
 * mismo número para la misma posición.
 */

export const MAX_DIMENSION_M = 20;
export const MAX_CAPACITY_M3 = 1000;
export const CAPACITY_DECIMALS = 3;

export type OccupancyStatus =
  'SIN_CAPACIDAD' | 'DISPONIBLE' | 'PARCIAL' | 'COMPLETO';

export interface LocationOccupancy {
  hasCapacity: boolean;
  /** null si la ubicación no tiene capacidad cargada. */
  maxCapacityM3: number | null;
  usedCapacityM3: number;
  /** null si la ubicación no tiene capacidad cargada. */
  occupancyPercentage: number | null;
  status: OccupancyStatus;
}

export function roundM3(value: number): number {
  const f = 10 ** CAPACITY_DECIMALS;
  return Math.round(value * f) / f;
}

function roundPct(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeLocationOccupancy(
  capacityM3: number | Prisma.Decimal | null | undefined,
  usedM3: number,
): LocationOccupancy {
  const capacity =
    capacityM3 === null || capacityM3 === undefined ? 0 : Number(capacityM3);
  const used = roundM3(Math.max(0, usedM3));

  if (!(capacity > 0)) {
    return {
      hasCapacity: false,
      maxCapacityM3: null,
      usedCapacityM3: used,
      occupancyPercentage: null,
      status: 'SIN_CAPACIDAD',
    };
  }

  const pct = roundPct((used / capacity) * 100);
  let status: OccupancyStatus = 'DISPONIBLE';
  if (pct >= 90) status = 'COMPLETO';
  else if (pct >= 50) status = 'PARCIAL';

  return {
    hasCapacity: true,
    maxCapacityM3: roundM3(capacity),
    usedCapacityM3: used,
    occupancyPercentage: pct,
    status,
  };
}

export interface WarehouseOccupancyTotals {
  /** Suma de capacidades de las ubicaciones CON capacidad cargada. */
  totalCapacityM3: number;
  /** Volumen ocupado en ubicaciones CON capacidad cargada. */
  usedCapacityM3: number;
  /** Volumen almacenado en ubicaciones sin capacidad (no entra en el %). */
  unmeasuredUsedM3: number;
  occupancyPercentage: number | null;
  locationsWithoutCapacity: number;
  occupiedLocations: number;
}

export function summarizeOccupancy(
  locations: LocationOccupancy[],
): WarehouseOccupancyTotals {
  let total = 0;
  let used = 0;
  let unmeasured = 0;
  let withoutCapacity = 0;
  let occupied = 0;

  for (const loc of locations) {
    if (loc.usedCapacityM3 > 0) occupied++;
    if (loc.hasCapacity) {
      total += loc.maxCapacityM3!;
      used += loc.usedCapacityM3;
    } else {
      withoutCapacity++;
      unmeasured += loc.usedCapacityM3;
    }
  }

  return {
    totalCapacityM3: roundM3(total),
    usedCapacityM3: roundM3(used),
    unmeasuredUsedM3: roundM3(unmeasured),
    occupancyPercentage: total > 0 ? roundPct((used / total) * 100) : null,
    locationsWithoutCapacity: withoutCapacity,
    occupiedLocations: occupied,
  };
}

type Db = { $queryRaw: Prisma.TransactionClient['$queryRaw'] };

/**
 * Volumen ocupado (m³) por ubicación, agregado en PostgreSQL.
 * Si se pasan warehouseIds, se limita a esos depósitos.
 */
export async function fetchUsedM3ByLocation(
  db: Db,
  warehouseIds?: string[],
): Promise<Map<string, number>> {
  const filter =
    warehouseIds && warehouseIds.length > 0
      ? Prisma.sql`AND i.warehouse_id = ANY(${warehouseIds}::uuid[])`
      : Prisma.empty;

  const rows = await db.$queryRaw<
    Array<{ location_id: string; used_m3: number }>
  >`
    SELECT i.location_id, SUM(i.quantity * p.volume_m3)::float8 AS used_m3
    FROM inventories i
    JOIN products p ON p.id = i.product_id
    WHERE i.quantity > 0 ${filter}
    GROUP BY i.location_id
  `;

  return new Map(rows.map((r) => [r.location_id, Number(r.used_m3) || 0]));
}

// =============================================================================
// CAPACIDAD A PARTIR DE MEDIDAS
// =============================================================================

export interface CapacityInput {
  capacityM3?: number | null;
  lengthM?: number | null;
  widthM?: number | null;
  heightM?: number | null;
}

export interface ResolvedCapacity {
  capacity: Prisma.Decimal;
  lengthM: Prisma.Decimal | null;
  widthM: Prisma.Decimal | null;
  heightM: Prisma.Decimal | null;
}

/**
 * Regla:
 *  - Si vienen las tres medidas, la capacidad es largo × ancho × alto
 *    (redondeada a 3 decimales) y se ignora un m³ directo.
 *  - Si no vienen medidas, se usa el m³ directo y las medidas quedan vacías.
 *  - Medidas parciales (1 o 2 de 3) son un error.
 */
export function resolveCapacity(input: CapacityInput): ResolvedCapacity {
  const dims = [input.lengthM, input.widthM, input.heightM];
  const given = dims.filter((d) => d !== null && d !== undefined).length;

  if (given > 0 && given < 3) {
    throw new BadRequestException(
      'Indique las tres medidas (largo, ancho y alto) o ninguna.',
    );
  }

  if (given === 3) {
    const [l, w, h] = dims as number[];
    for (const d of [l, w, h]) {
      if (!(d > 0) || d > MAX_DIMENSION_M) {
        throw new BadRequestException(
          `Cada medida debe ser mayor a 0 y como máximo ${MAX_DIMENSION_M} m.`,
        );
      }
    }
    const capacity = roundM3(l * w * h);
    if (!(capacity > 0) || capacity > MAX_CAPACITY_M3) {
      throw new BadRequestException(
        `La capacidad resultante (${capacity} m³) debe ser mayor a 0 y como máximo ${MAX_CAPACITY_M3} m³.`,
      );
    }
    return {
      capacity: new Prisma.Decimal(capacity),
      lengthM: new Prisma.Decimal(l),
      widthM: new Prisma.Decimal(w),
      heightM: new Prisma.Decimal(h),
    };
  }

  const direct = input.capacityM3;
  if (direct === null || direct === undefined || !(direct > 0)) {
    throw new BadRequestException(
      'Indique la capacidad en m³ o las tres medidas de la ubicación.',
    );
  }
  if (direct > MAX_CAPACITY_M3) {
    throw new BadRequestException(
      `La capacidad no puede superar ${MAX_CAPACITY_M3} m³.`,
    );
  }
  return {
    capacity: new Prisma.Decimal(roundM3(direct)),
    lengthM: null,
    widthM: null,
    heightM: null,
  };
}
