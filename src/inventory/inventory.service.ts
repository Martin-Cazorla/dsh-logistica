// dsh-logistica/src/inventory/inventory.service.ts

import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InboundDto, CreateWarehouseDto } from './dto/inbound.dto';

interface InventoryReduceItem {
  quantity: number;
  product?: {
    volumeM3?: any;
  } | null;
}

interface ContainerItemSum {
  quantityBultos: number;
  totalUnits: number;
}

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

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

        const locUsedM3 = loc.inventories.reduce(
          (acc: number, inv: InventoryReduceItem) => {
            const m3PerUnit = inv.product?.volumeM3
              ? Number(inv.product.volumeM3)
              : 0.05;
            return acc + inv.quantity * m3PerUnit;
          },
          0,
        );

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

      return {
        id: wh.id,
        name: wh.name,
        address: wh.address,
        totalCapacityM3: Number(totalCapacityM3.toFixed(2)),
        usedCapacityM3: Number(usedCapacityM3.toFixed(2)),
        occupancyPercentage,
        isOverloaded: occupancyPercentage > 100,
        totalLocations,
        occupiedLocations,
        locations: mappedLocations,
      };
    });
  }

  async getWarehousesList() {
    return this.prisma.warehouse.findMany({
      select: { id: true, name: true, address: true, code: true },
      orderBy: { name: 'asc' },
    });
  }

  async createWarehouse(dto: CreateWarehouseDto) {
    const cleanName = dto.name.trim();
    if (!cleanName) {
      throw new BadRequestException('El nombre del depósito es obligatorio.');
    }

    const baseCode =
      cleanName
        .replace(/[^a-zA-Z0-9]/g, '')
        .substring(0, 4)
        .toUpperCase() || 'DEP';
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const generatedCode = dto.code || `${baseCode}-${randomSuffix}`;

    return this.prisma.warehouse.create({
      data: {
        code: generatedCode,
        name: cleanName,
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

  async getLocationsByWarehouse(warehouseId: string) {
    const locations = await this.prisma.location.findMany({
      where: { warehouseId },
      orderBy: { code: 'asc' },
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
    const capacityVal = Math.round(Number(maxCapacityM3PerUnit)) || 2;

    for (const level of levels) {
      for (let pos = Number(positionStart); pos <= Number(positionEnd); pos++) {
        const code = `${category}-${cleanArea}-${level}${pos}`;

        locationsToCreate.push({
          warehouseId,
          code,
          aisle: areaName || 'General',
          rack: level,
          position: String(pos),
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
        'Existen ubicaciones seleccionadas con stock activo.',
      );
    }

    return this.prisma.location.deleteMany({
      where: { id: { in: locationIds } },
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
        unitsPerBox: inv.product.unitsPerBox || 1,
        weightPerBultoKg: weightKg,
        volumePerBultoM3: volumeM3,
        totalWeightKg: inv.quantity * weightKg,
        totalVolumeM3: Number((inv.quantity * volumeM3).toFixed(3)),
        updatedAt: inv.updatedAt,
      };
    });
  }

  // FASE 1: PRE-CARGA DE PACKING LIST
  async createPackingList(dto: InboundDto) {
    const { containerNumber, warehouseId, items } = dto;

    if (!containerNumber) {
      throw new BadRequestException('El número de contenedor es obligatorio.');
    }

    return this.prisma.inboundContainer.create({
      data: {
        containerNumber,
        warehouseId,
        status: 'PENDIENTE',
        items: {
          create: items.map((item) => ({
            sku: item.productSku,
            description: item.productName,
            quantityBultos: item.quantityBultos,
            unitsPerBox: item.unitsPerBox || 1,
            totalUnits: item.quantityBultos * (item.unitsPerBox || 1),
            weightPerBultoKg: item.weightPerBultoKg,
            volumePerBultoM3: item.volumePerBultoM3,
            sampleUnits: item.sampleUnits || 0,
            notes: item.notes || null,
            locationId: item.locationId || null,
          })),
        },
      },
      include: { items: true },
    });
  }

  // OBTENER HISTORIAL DE CONTENEDORES CON AUDITORÍA
  async getContainersHistory(status?: string) {
    const whereClause: any = {};
    if (status) whereClause.status = status as any;

    const containers = await this.prisma.inboundContainer.findMany({
      where: whereClause,
      include: {
        warehouse: true,
        items: {
          include: {
            controlledBy: {
              select: { firstName: true, lastName: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return containers.map((c: any) => ({
      id: c.id,
      containerNumber: c.containerNumber,
      warehouseId: c.warehouseId,
      warehouseName: c.warehouse.name,
      status: c.status,
      arrivalDate: c.createdAt,
      dischargeDate: c.dischargeDate,
      totalBultos: c.items.reduce(
        (acc: number, i: ContainerItemSum) => acc + i.quantityBultos,
        0,
      ),
      totalUnits: c.items.reduce(
        (acc: number, i: ContainerItemSum) => acc + i.totalUnits,
        0,
      ),
      items: c.items.map((i: any) => ({
        id: i.id,
        sku: i.sku,
        description: i.description,
        quantityBultos: i.quantityBultos,
        unitsPerBox: i.unitsPerBox,
        totalUnits: i.totalUnits,
        weightPerBultoKg: Number(i.weightPerBultoKg),
        volumePerBultoM3: Number(i.volumePerBultoM3),
        locationId: i.locationId,
        isControlled: i.isControlled,
        controlledBy: i.controlledBy
          ? `${i.controlledBy.firstName} ${i.controlledBy.lastName}`
          : null,
        controlledAt: i.controlledAt,
      })),
    }));
  }

  // ELIMINAR / ANULAR CONTENEDOR
  async deleteContainer(containerId: string) {
    const container = await this.prisma.inboundContainer.findUnique({
      where: { id: containerId },
    });

    if (!container) throw new NotFoundException('Contenedor no encontrado.');
    if (container.status === 'RECIBIDO') {
      throw new BadRequestException(
        'No se puede eliminar un contenedor que ya fue recibido e ingresado al stock.',
      );
    }

    return this.prisma.inboundContainer.delete({ where: { id: containerId } });
  }

  // FASE 2: PROCESAR ESTIBADO MÓVIL
  async processInbound(dto: {
    containerId: string;
    items: any[];
    userId?: string;
  }) {
    const { containerId, items, userId } = dto;

    const container = await this.prisma.inboundContainer.findUnique({
      where: { id: containerId },
    });

    if (!container) throw new NotFoundException('Contenedor no encontrado.');

    const activeUser = userId
      ? await this.prisma.user.findUnique({ where: { id: userId } })
      : await this.prisma.user.findFirst();

    if (!activeUser)
      throw new BadRequestException('No hay usuarios en el sistema.');

    return this.prisma.$transaction(async (tx) => {
      for (const item of items) {
        let product = await tx.product.findUnique({
          where: { sku: item.sku },
        });

        if (!product) {
          product = await tx.product.create({
            data: {
              sku: item.sku,
              name: item.description,
              unitsPerBox: item.unitsPerBox || 1,
              weightKg: item.weightPerBultoKg,
              volumeM3: item.volumePerBultoM3,
            },
          });
        }

        const existingInv = await tx.inventory.findFirst({
          where: {
            warehouseId: container.warehouseId,
            productId: product.id,
            locationId: item.locationId,
          },
        });

        if (existingInv) {
          await tx.inventory.update({
            where: { id: existingInv.id },
            data: {
              quantity: existingInv.quantity + item.quantityBultos,
              lotNumber: container.containerNumber,
            },
          });
        } else {
          await tx.inventory.create({
            data: {
              warehouseId: container.warehouseId,
              productId: product.id,
              locationId: item.locationId,
              quantity: item.quantityBultos,
              lotNumber: container.containerNumber,
            },
          });
        }

        await tx.stockMovement.create({
          data: {
            productId: product.id,
            warehouseId: container.warehouseId,
            userId: activeUser.id,
            type: 'INBOUND',
            quantity: item.quantityBultos,
            referenceCode: container.containerNumber,
          },
        });
      }

      await tx.inboundContainer.update({
        where: { id: containerId },
        data: {
          status: 'RECIBIDO',
          dischargeDate: new Date(),
        },
      });

      return {
        success: true,
        message: 'Contenedor procesado e ingresado al stock correctamente.',
      };
    });
  }

  // MOVER STOCK DE UNA UBICACIÓN A OTRA (REUBICACIÓN INTERNA DE PALLETS)
  async transferStock(dto: {
    inventoryId: string;
    targetLocationId: string;
    quantityBultos: number;
    userId?: string;
  }) {
    const { inventoryId, targetLocationId, quantityBultos, userId } = dto;

    const sourceInv = await this.prisma.inventory.findUnique({
      where: { id: inventoryId },
      include: { product: true },
    });

    if (!sourceInv)
      throw new NotFoundException('Inventario de origen no encontrado.');
    if (sourceInv.quantity < quantityBultos) {
      throw new BadRequestException(
        'La cantidad a mover supera el stock disponible en esta ubicación.',
      );
    }

    const activeUser = userId
      ? await this.prisma.user.findUnique({ where: { id: userId } })
      : await this.prisma.user.findFirst();

    if (!activeUser)
      throw new BadRequestException('Usuario no válido en el sistema.');

    return this.prisma.$transaction(async (tx) => {
      // 1. Restar o eliminar stock de la ubicación origen
      if (sourceInv.quantity === quantityBultos) {
        await tx.inventory.delete({ where: { id: sourceInv.id } });
      } else {
        await tx.inventory.update({
          where: { id: sourceInv.id },
          data: { quantity: sourceInv.quantity - quantityBultos },
        });
      }

      // 2. Incrementar o crear registro de stock en la ubicación destino
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
          data: { quantity: targetInv.quantity + quantityBultos },
        });
      } else {
        await tx.inventory.create({
          data: {
            warehouseId: sourceInv.warehouseId,
            productId: sourceInv.productId,
            locationId: targetLocationId,
            quantity: quantityBultos,
            lotNumber: sourceInv.lotNumber,
          },
        });
      }

      // 3. Registrar el movimiento de stock en la auditoría
      await tx.stockMovement.create({
        data: {
          productId: sourceInv.productId,
          warehouseId: sourceInv.warehouseId,
          sourceLocationId: sourceInv.locationId,
          targetLocationId: targetLocationId,
          userId: activeUser.id,
          type: 'TRANSFER_IN',
          quantity: quantityBultos,
          referenceCode: sourceInv.lotNumber || 'REUBICACION_PALLET',
        },
      });

      return { success: true, message: 'Stock reubicado correctamente.' };
    });
  }
}
