import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  WarehouseOccupationDto,
  LocationOccupationDto,
} from '../dto/occupation-response.dto';

@Injectable()
export class OccupationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calcula el índice de ocupación física de un depósito específico
   * sumando las capacidades máximas y la cantidad actual de bultos
   * almacenados en sus ubicaciones.
   */
  async getWarehouseOccupation(
    warehouseId: string,
  ): Promise<WarehouseOccupationDto> {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      include: {
        locations: {
          include: {
            inventories: true,
          },
        },
      },
    });

    if (!warehouse) {
      throw new NotFoundException(
        `El depósito con ID "${warehouseId}" no fue encontrado.`,
      );
    }

    let totalMaxCapacityBultos = 0;
    let totalCurrentBultos = 0;

    const locationsOccupation: LocationOccupationDto[] =
      warehouse.locations.map((loc) => {
        const currentBultos = loc.inventories.reduce(
          (acc, inv) => acc + inv.quantity,
          0,
        );

        // Se utilizan las propiedades nativas del schema de Prisma
        const maxCapacity = loc.maxCapacity || 0;
        const availableBultos = Math.max(0, maxCapacity - currentBultos);
        const occupationPercentage =
          maxCapacity > 0
            ? Number(((currentBultos / maxCapacity) * 100).toFixed(2))
            : 0;

        totalMaxCapacityBultos += maxCapacity;
        totalCurrentBultos += currentBultos;

        return {
          id: loc.id,
          code: loc.code,
          type: loc.type,
          aisle: loc.aisle ?? null,
          rack: loc.rack ?? null,
          level: loc.level ?? null,
          position: loc.position ?? null,
          maxCapacity: maxCapacity,
          currentBultos: currentBultos,
          occupationPercentage: occupationPercentage,
          availableBultos: availableBultos,
          isFull: currentBultos >= maxCapacity && maxCapacity > 0,
        };
      });

    const globalOccupationPercentage =
      totalMaxCapacityBultos > 0
        ? Number(
            ((totalCurrentBultos / totalMaxCapacityBultos) * 100).toFixed(2),
          )
        : 0;

    const totalAvailableBultos = Math.max(
      0,
      totalMaxCapacityBultos - totalCurrentBultos,
    );

    return {
      warehouseId: warehouse.id,
      warehouseName: warehouse.name,
      totalLocations: warehouse.locations.length,
      totalMaxCapacityBultos: totalMaxCapacityBultos,
      totalCurrentBultos: totalCurrentBultos,
      totalAvailableBultos: totalAvailableBultos,
      globalOccupationPercentage: globalOccupationPercentage,
      locations: locationsOccupation,
    };
  }

  /**
   * Obtiene la métrica consolidada de ocupación de todos los depósitos registrados.
   */
  async getAllWarehousesOccupation(): Promise<WarehouseOccupationDto[]> {
    const warehouses = await this.prisma.warehouse.findMany({
      select: { id: true },
    });

    const occupations = await Promise.all(
      warehouses.map((w) => this.getWarehouseOccupation(w.id)),
    );

    return occupations;
  }
}
