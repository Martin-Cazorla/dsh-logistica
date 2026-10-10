// src/inventory/inventory.service.ts

import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransferStockDto } from './dto/transfer-stock.dto';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resumen de Ocupación por Depósitos con Cálculo de Sobreexigencia (>100%)
   */
  async getOccupancySummary() {
    const warehouses = await this.prisma.warehouse.findMany({
      include: {
        locations: {
          include: {
            inventories: {
              include: {
                product: true,
              },
            },
          },
        },
      },
    });

    return warehouses.map((wh) => {
      let totalCapacityM3 = 0;
      let usedCapacityM3 = 0;

      const mappedLocations = wh.locations.map((loc) => {
        const locMaxM3 = loc.capacity || 10;
        totalCapacityM3 += locMaxM3;

        const locUsedM3 = loc.inventories.reduce((acc, inv) => {
          const m3PerUnit = inv.product?.volumeM3
            ? Number(inv.product.volumeM3)
            : 0.05;
          return acc + inv.quantity * m3PerUnit;
        }, 0);

        usedCapacityM3 += locUsedM3;
        const occupancyPercentage =
          locMaxM3 > 0 ? Math.round((locUsedM3 / locMaxM3) * 100) : 0;

        let status = 'DISPONIBLE';
        if (occupancyPercentage >= 90) status = 'COMPLETO';
        else if (occupancyPercentage >= 50) status = 'PARCIAL';

        const isRack =
          loc.rack &&
          ['A', 'B', 'C', 'D', 'E'].includes(loc.rack.toUpperCase());
        const isTecho =
          loc.aisle?.toUpperCase().includes('TECHO') ||
          loc.code.toUpperCase().includes('TECHO');

        return {
          id: loc.id,
          warehouseId: wh.id,
          code: loc.code,
          category: isRack ? 'RACK' : isTecho ? 'TECHO' : 'PASILLO',
          zoneName: loc.aisle || loc.notes || 'Zona General',
          rackLevel: loc.rack || 'A',
          moduleNumber: loc.position ? parseInt(loc.position, 10) || 1 : 1,
          maxCapacityM3: locMaxM3,
          usedCapacityM3: Number(locUsedM3.toFixed(2)),
          occupancyPercentage,
          status,
          comments: loc.notes || undefined,
        };
      });

      const totalLocations = mappedLocations.length;
      const occupiedLocations = mappedLocations.filter(
        (l) => l.usedCapacityM3 > 0,
      ).length;

      const occupancyPercentage =
        totalCapacityM3 > 0
          ? Math.round((usedCapacityM3 / totalCapacityM3) * 100)
          : 0;
      const isOverloaded = occupancyPercentage > 100;

      return {
        id: wh.id,
        name: wh.name,
        address: wh.address,
        totalCapacityM3: Number(totalCapacityM3.toFixed(2)),
        usedCapacityM3: Number(usedCapacityM3.toFixed(2)),
        occupancyPercentage,
        isOverloaded,
        totalLocations,
        occupiedLocations,
        locations: mappedLocations,
      };
    });
  }

  async getWarehousesList() {
    return this.prisma.warehouse.findMany({
      select: { id: true, name: true, address: true },
    });
  }

  async getStockList(warehouseId?: string, search?: string) {
    const whereClause: any = {};
    if (warehouseId) whereClause.warehouseId = warehouseId;

    if (search) {
      whereClause.OR = [
        { product: { name: { contains: search, mode: 'insensitive' } } },
        { product: { sku: { contains: search, mode: 'insensitive' } } },
        { location: { code: { contains: search, mode: 'insensitive' } } },
      ];
    }

    const inventories = await this.prisma.inventory.findMany({
      where: whereClause,
      include: {
        product: true,
        warehouse: true,
        location: true,
      },
    });

    return inventories.map((inv) => {
      const weightKg = inv.product.weightKg ? Number(inv.product.weightKg) : 0;
      const volumeM3 = inv.product.volumeM3 ? Number(inv.product.volumeM3) : 0;

      return {
        id: inv.id,
        productId: inv.productId,
        productSku: inv.product.sku,
        productName: inv.product.name,
        eanCode: inv.product.barcode || undefined,
        containerNumber: inv.lotNumber || undefined,
        warehouseId: inv.warehouseId,
        warehouseName: inv.warehouse.name,
        locationId: inv.locationId,
        locationCode: inv.location ? inv.location.code : 'Sin Ubicación',
        quantityBultos: inv.quantity,
        weightPerBultoKg: weightKg,
        volumePerBultoM3: volumeM3,
        totalWeightKg: inv.quantity * weightKg,
        totalVolumeM3: Number((inv.quantity * volumeM3).toFixed(3)),
        updatedAt: inv.updatedAt,
      };
    });
  }

  async getLocationsByWarehouse(warehouseId: string) {
    const locations = await this.prisma.location.findMany({
      where: { warehouseId },
    });
    return locations.map((loc) => {
      const isRack =
        loc.rack && ['A', 'B', 'C', 'D', 'E'].includes(loc.rack.toUpperCase());
      const isTecho =
        loc.aisle?.toUpperCase().includes('TECHO') ||
        loc.code.toUpperCase().includes('TECHO');

      return {
        id: loc.id,
        warehouseId: loc.warehouseId,
        code: loc.code,
        category: isRack ? 'RACK' : isTecho ? 'TECHO' : 'PASILLO',
        zoneName: loc.aisle || loc.notes || 'Zona General',
        rackLevel: loc.rack || 'A',
        moduleNumber: loc.position ? parseInt(loc.position, 10) || 1 : 1,
        maxCapacityM3: loc.capacity || 10,
        usedCapacityM3: 0,
        occupancyPercentage: 0,
        status: 'DISPONIBLE',
        comments: loc.notes || undefined,
      };
    });
  }

  async processInbound(dto: any, userId?: string) {
    const { warehouseId, containerNumber, items } = dto;

    let effectiveUserId = userId;
    if (!effectiveUserId) {
      const defaultUser = await this.prisma.user.findFirst();
      if (!defaultUser)
        throw new BadRequestException(
          'No hay usuarios registrados en el sistema.',
        );
      effectiveUserId = defaultUser.id;
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        let product = await tx.product.findUnique({
          where: { sku: item.productSku },
        });

        if (!product) {
          product = await tx.product.create({
            data: {
              sku: item.productSku,
              name: item.productName,
              barcode: item.eanCode || null,
              weightKg: item.weightPerBultoKg,
              volumeM3: item.volumePerBultoM3,
              unitsPerBox: 1,
              unitPrice: 0,
            },
          });
        }

        const existingInv = await tx.inventory.findFirst({
          where: {
            warehouseId,
            productId: product.id,
            locationId: item.locationId,
          },
        });

        if (existingInv) {
          await tx.inventory.update({
            where: { id: existingInv.id },
            data: {
              quantity: existingInv.quantity + item.quantityBultos,
              lotNumber: containerNumber || existingInv.lotNumber,
            },
          });
        } else {
          await tx.inventory.create({
            data: {
              warehouseId,
              productId: product.id,
              locationId: item.locationId,
              quantity: item.quantityBultos,
              lotNumber: containerNumber || null,
            },
          });
        }

        await tx.stockMovement.create({
          data: {
            productId: product.id,
            warehouseId,
            userId: effectiveUserId,
            type: 'INBOUND',
            quantity: item.quantityBultos,
          },
        });
      }
    });
  }

  async moveStock(dto: {
    inventoryStockId: string;
    targetLocationId: string;
    quantityBultosToMove: number;
  }) {
    const { inventoryStockId, targetLocationId, quantityBultosToMove } = dto;

    return this.prisma.$transaction(async (tx) => {
      const sourceInv = await tx.inventory.findUnique({
        where: { id: inventoryStockId },
      });

      if (!sourceInv || sourceInv.quantity < quantityBultosToMove) {
        throw new BadRequestException(
          'Cantidad insuficiente en la posición de origen.',
        );
      }

      if (sourceInv.quantity === quantityBultosToMove) {
        await tx.inventory.delete({ where: { id: inventoryStockId } });
      } else {
        await tx.inventory.update({
          where: { id: inventoryStockId },
          data: { quantity: sourceInv.quantity - quantityBultosToMove },
        });
      }

      const targetInv = await tx.inventory.findFirst({
        where: {
          warehouseId: sourceInv.warehouseId,
          productId: sourceInv.productId,
          locationId: targetLocationId,
        },
      });

      if (targetInv) {
        await tx.inventory.update({
          where: { id: targetInv.id },
          data: { quantity: targetInv.quantity + quantityBultosToMove },
        });
      } else {
        await tx.inventory.create({
          data: {
            warehouseId: sourceInv.warehouseId,
            productId: sourceInv.productId,
            locationId: targetLocationId,
            quantity: quantityBultosToMove,
            lotNumber: sourceInv.lotNumber,
          },
        });
      }
    });
  }

  async transferStock(dto: TransferStockDto) {
    return this.prisma.$transaction(async (tx) => {
      const sourceInv = await tx.inventory.findFirst({
        where: { warehouseId: dto.originWarehouseId, productId: dto.productId },
      });

      if (!sourceInv || sourceInv.quantity < dto.quantity) {
        throw new BadRequestException(
          'Stock insuficiente en depósito de origen.',
        );
      }

      await tx.inventory.update({
        where: { id: sourceInv.id },
        data: { quantity: sourceInv.quantity - dto.quantity },
      });

      const targetInv = await tx.inventory.findFirst({
        where: {
          warehouseId: dto.destinationWarehouseId,
          productId: dto.productId,
        },
      });

      if (targetInv) {
        await tx.inventory.update({
          where: { id: targetInv.id },
          data: { quantity: targetInv.quantity + dto.quantity },
        });
      } else {
        const defaultLocation = await tx.location.findFirst({
          where: { warehouseId: dto.destinationWarehouseId },
        });

        if (!defaultLocation)
          throw new BadRequestException(
            'El depósito destino no posee ubicaciones.',
          );

        await tx.inventory.create({
          data: {
            warehouseId: dto.destinationWarehouseId,
            productId: dto.productId,
            locationId: defaultLocation.id,
            quantity: dto.quantity,
          },
        });
      }
    });
  }

  async getInventoryByWarehouse(warehouseId: string) {
    return this.prisma.inventory.findMany({
      where: { warehouseId },
      include: { product: true, location: true },
    });
  }

  async createWarehouse(dto: {
    name: string;
    code?: string;
    address?: string;
  }) {
    const generatedCode =
      dto.code ||
      dto.name.substring(0, 3).toUpperCase() +
        Math.floor(100 + Math.random() * 900);
    return this.prisma.warehouse.create({
      data: {
        code: generatedCode,
        name: dto.name,
        address: dto.address || null,
      },
    });
  }

  async deleteWarehouse(warehouseId: string) {
    const invCount = await this.prisma.inventory.count({
      where: { warehouseId },
    });
    if (invCount > 0) {
      throw new BadRequestException(
        'No se puede eliminar un depósito que posee stock activo.',
      );
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.location.deleteMany({ where: { warehouseId } });
      await tx.warehouse.delete({ where: { id: warehouseId } });
    });
  }

  async generateLocationsBatch(dto: {
    warehouseId: string;
    category: 'RACK' | 'PASILLO' | 'TECHO';
    areaName: string;
    levels: string[];
    positionStart: number;
    positionEnd: number;
    maxCapacityM3PerUnit: number;
  }) {
    const {
      warehouseId,
      category,
      areaName,
      levels,
      positionStart,
      positionEnd,
      maxCapacityM3PerUnit,
    } = dto;
    const locationsToCreate = [];

    const cleanArea = (areaName || 'GENERAL')
      .replace(/\s+/g, '-')
      .toUpperCase();
    const capacityVal = Number(maxCapacityM3PerUnit) || 2.5;

    for (const level of levels) {
      for (let pos = Number(positionStart); pos <= Number(positionEnd); pos++) {
        let code = '';
        if (category === 'RACK') {
          code = `RACK-${cleanArea}-${level}${pos}`;
        } else if (category === 'PASILLO') {
          code = `PASILLO-${cleanArea}-${level}${pos}`;
        } else {
          code = `TECHO-${cleanArea}-${level}${pos}`;
        }

        locationsToCreate.push({
          warehouseId,
          code,
          aisle: areaName || 'General',
          rack: level,
          position: String(pos), // Prisma exige tipo String
          capacity: capacityVal,
        });
      }
    }

    return this.prisma.location.createMany({
      data: locationsToCreate,
      skipDuplicates: true,
    });
  }

  async deleteLocationsBatch(locationIds: string[]) {
    const invCount = await this.prisma.inventory.count({
      where: { locationId: { in: locationIds } },
    });
    if (invCount > 0) {
      throw new BadRequestException(
        'Existen ubicaciones seleccionadas que poseen bultos en inventario.',
      );
    }

    return this.prisma.location.deleteMany({
      where: { id: { in: locationIds } },
    });
  }

  async clearAllInventoryData() {
    return this.prisma.$transaction(async (tx) => {
      await tx.stockMovement.deleteMany({});
      await tx.inventory.deleteMany({});
      await tx.location.deleteMany({});
      await tx.warehouse.deleteMany({});
      return {
        message: 'Todos los datos de inventario y depósitos fueron eliminados.',
      };
    });
  }
}
