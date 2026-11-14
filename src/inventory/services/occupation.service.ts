// dsh-logistica/src/inventory/services/occupation.service.ts

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  WarehouseOccupationDto,
  LocationOccupationDto,
} from '../dto/occupation-response.dto';
import {
  computeLocationOccupancy,
  fetchUsedM3ByLocation,
  roundM3,
  summarizeOccupancy,
} from '../occupancy/location-occupancy';

/**
 * Ocupación de depósitos en m³ (GET /inventory/occupation).
 *
 * Corrección: antes comparaba `capacity` (m³) contra la cantidad de BULTOS
 * (currentBultos / capacity), mezclando unidades. Ahora usa exactamente el
 * mismo cálculo que InventoryService (src/inventory/occupancy/
 * location-occupancy.ts): volumen ocupado = Σ bultos × volumen unitario del
 * producto, sobre la capacidad en m³ de la ubicación.
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
    const [warehouses, usedByLocation, bultosRows] = await Promise.all([
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
              lengthM: true,
              widthM: true,
              heightM: true,
            },
            orderBy: { code: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      }),
      fetchUsedM3ByLocation(this.prisma, warehouseIds),
      this.prisma.inventory.groupBy({
        by: ['locationId'],
        where: {
          quantity: { gt: 0 },
          ...(warehouseIds ? { warehouseId: { in: warehouseIds } } : {}),
        },
        _sum: { quantity: true },
      }),
    ]);

    const bultosByLocation = new Map(
      bultosRows.map((r) => [r.locationId, r._sum.quantity ?? 0]),
    );

    return warehouses.map((warehouse) => {
      const locations: LocationOccupationDto[] = warehouse.locations.map(
        (loc) => {
          const occ = computeLocationOccupancy(
            loc.capacity,
            usedByLocation.get(loc.id) ?? 0,
          );
          return {
            id: loc.id,
            code: loc.code,
            type: loc.type,
            aisle: loc.aisle ?? null,
            rack: loc.rack ?? null,
            position: loc.position ?? null,
            lengthM: loc.lengthM === null ? null : Number(loc.lengthM),
            widthM: loc.widthM === null ? null : Number(loc.widthM),
            heightM: loc.heightM === null ? null : Number(loc.heightM),
            ...occ,
            availableM3: occ.hasCapacity
              ? roundM3(Math.max(0, occ.maxCapacityM3! - occ.usedCapacityM3))
              : null,
            currentBultos: bultosByLocation.get(loc.id) ?? 0,
            isFull: occ.hasCapacity && (occ.occupancyPercentage ?? 0) >= 100,
          };
        },
      );

      const totals = summarizeOccupancy(locations);

      return {
        warehouseId: warehouse.id,
        warehouseName: warehouse.name,
        totalLocations: locations.length,
        locationsWithoutCapacity: totals.locationsWithoutCapacity,
        totalCapacityM3: totals.totalCapacityM3,
        usedCapacityM3: totals.usedCapacityM3,
        unmeasuredUsedM3: totals.unmeasuredUsedM3,
        availableM3: roundM3(
          Math.max(0, totals.totalCapacityM3 - totals.usedCapacityM3),
        ),
        occupancyPercentage: totals.occupancyPercentage,
        locations,
      };
    });
  }
}
