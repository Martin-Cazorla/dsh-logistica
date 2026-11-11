// dsh-logistica/src/inventory/services/occupation.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  WarehouseOccupationDto,
  LocationOccupationDto,
} from '../dto/occupation-response.dto';

interface LocationUsageRow {
  location_id: string;
  current_bultos: number;
}

/**
 * Ocupación por BULTOS (complementa la ocupación volumétrica en m³ de
 * InventoryService#getOccupancySummary).
 *
 * Antes:
 *  - getAllWarehousesOccupation hacía 1 + N consultas (una por depósito), cada
 *    una cargando todas las filas de inventario.
 * Ahora: 2 consultas en total, con la suma de bultos agregada en PostgreSQL.
 *
 * ATENCIÓN (deuda de modelo): `Location.capacity` se usa como m³ en
 * InventoryService y en el frontend; este servicio lo compara contra bultos.
 * Si se necesita capacidad en bultos, agregar un campo dedicado
 * (p. ej. `maxBultos Int?`) en lugar de reutilizar `capacity`.
 */
@Injectable()
export class OccupationService {
  constructor(private readonly prisma: PrismaService) {}

  async getWarehouseOccupation(
    warehouseId: string,
  ): Promise<WarehouseOccupationDto> {
    const [result] = await this.computeOccupation([warehouseId]);
    if (!result) {
      throw new NotFoundException(
        `El depósito con ID "${warehouseId}" no fue encontrado.`,
      );
    }
    return result;
  }

  async getAllWarehousesOccupation(): Promise<WarehouseOccupationDto[]> {
    return this.computeOccupation();
  }

  private async computeOccupation(
    warehouseIds?: string[],
  ): Promise<WarehouseOccupationDto[]> {
    const warehouseFilter = warehouseIds
      ? Prisma.sql`AND i.warehouse_id = ANY(${warehouseIds}::uuid[])`
      : Prisma.empty;

    const [warehouses, usageRows] = await Promise.all([
      this.prisma.warehouse.findMany({
        where: warehouseIds ? { id: { in: warehouseIds } } : { isActive: true },
        select: {
          id: true,
          name: true,
          locations: {
            select: {
              id: true,
              code: true,
              type: true,
              aisle: true,
              rack: true,
              position: true,
              capacity: true,
            },
            orderBy: { code: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.$queryRaw<LocationUsageRow[]>`
        SELECT i.location_id, SUM(i.quantity)::int AS current_bultos
        FROM inventories i
        WHERE i.quantity > 0 ${warehouseFilter}
        GROUP BY i.location_id
      `,
    ]);

    const bultosByLocation = new Map(
      usageRows.map((r) => [r.location_id, Number(r.current_bultos)]),
    );

    return warehouses.map((warehouse) => {
      let totalMaxCapacity = 0;
      let totalCurrentBultos = 0;

      const locations: LocationOccupationDto[] = warehouse.locations.map(
        (loc) => {
          const currentBultos = bultosByLocation.get(loc.id) ?? 0;
          const maxCapacity = Number(loc.capacity);
          const availableBultos = Math.max(0, maxCapacity - currentBultos);
          const occupationPercentage =
            maxCapacity > 0
              ? Number(((currentBultos / maxCapacity) * 100).toFixed(2))
              : 0;

          totalMaxCapacity += maxCapacity;
          totalCurrentBultos += currentBultos;

          return {
            id: loc.id,
            code: loc.code,
            type: loc.type,
            aisle: loc.aisle ?? null,
            rack: loc.rack ?? null,
            position: loc.position ?? null,
            capacity: maxCapacity,
            currentBultos,
            occupationPercentage,
            availableBultos,
            isFull: maxCapacity > 0 && currentBultos >= maxCapacity,
          };
        },
      );

      return {
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        totalLocations: warehouse.locations.length,
        totalMaxCapacityBultos: totalMaxCapacity,
        totalCurrentBultos,
        totalAvailableBultos: Math.max(
          0,
          totalMaxCapacity - totalCurrentBultos,
        ),
        globalOccupationPercentage:
          totalMaxCapacity > 0
            ? Number(((totalCurrentBultos / totalMaxCapacity) * 100).toFixed(2))
            : 0,
        locations,
      };
    });
  }
}
