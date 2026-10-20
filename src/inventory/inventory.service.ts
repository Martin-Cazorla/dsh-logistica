// dsh-logistica/src/inventory/inventory.service.ts

import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InboundDto, CreateWarehouseDto } from './dto/inbound.dto';
import { CreateManualStockDto } from './dto/create-manual-stock.dto';

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
        const locMaxM3 = loc.capacity ? Number(loc.capacity) : 10;
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
        maxCapacityM3: loc.capacity ? Number(loc.capacity) : 10,
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
    maxCapacityM3PerUnit: number | string;
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

    const parsedCap =
      typeof maxCapacityM3PerUnit === 'string'
        ? parseFloat(maxCapacityM3PerUnit.replace(',', '.'))
        : Number(maxCapacityM3PerUnit);

    const capacityVal = !isNaN(parsedCap) && parsedCap > 0 ? parsedCap : 2.5;

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

  async updateLocationsCapacity(
    updates: Array<{ id: string; capacity: number }>,
  ) {
    return this.prisma.$transaction(
      updates.map((u) =>
        this.prisma.location.update({
          where: { id: u.id },
          data: { capacity: u.capacity },
        }),
      ),
    );
  }

  async deleteLocationsBatch(locationIds: string[]) {
    if (!locationIds || locationIds.length === 0) {
      return { count: 0 };
    }

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
        product: {
          include: {
            comboParentItems: {
              include: {
                childProduct: true,
              },
            },
          },
        },
        warehouse: true,
        location: true,
      },
    });

    return inventories.map((inv: any) => {
      const weightKg = inv.product?.weightKg ? Number(inv.product.weightKg) : 0;
      const volumeM3 = inv.product?.volumeM3 ? Number(inv.product.volumeM3) : 0;

      const rawComponents = inv.product?.comboParentItems || [];
      const componentsList = Array.isArray(rawComponents)
        ? rawComponents.map((c: any) => ({
            childSku: c.childProduct?.sku || c.childSku || '',
            description: c.childProduct?.name || c.description || '',
            quantityPerCombo: Number(c.quantityPerCombo || 1),
          }))
        : [];

      return {
        id: inv.id,
        productId: inv.productId,
        productSku: inv.product?.sku || 'S/SKU',
        productName: inv.product?.name || 'S/Nombre',
        eanCode: inv.product?.barcode || undefined,
        containerNumber: inv.lotNumber || undefined,
        warehouseId: inv.warehouseId,
        warehouseName: inv.warehouse?.name || 'S/Depósito',
        locationId: inv.locationId,
        locationCode: inv.location ? inv.location.code : 'Sin Ubicación',
        quantityBultos: inv.quantity,
        unitsPerBox: inv.product?.unitsPerBox || 1,
        weightPerBultoKg: weightKg,
        volumePerBultoM3: volumeM3,
        totalWeightKg: inv.quantity * weightKg,
        totalVolumeM3: Number((inv.quantity * volumeM3).toFixed(3)),
        isCombo: componentsList.length > 0,
        components: componentsList,
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
          create: items.map((item: any) => ({
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
            rawComponents:
              item.isCombo && item.components ? item.components : null,
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

    const allSkus = new Set<string>();
    containers.forEach((c: any) => {
      c.items.forEach((i: any) => allSkus.add(i.sku));
    });

    const productsWithComponents = await this.prisma.product.findMany({
      where: { sku: { in: Array.from(allSkus) } },
      include: {
        comboParentItems: {
          include: {
            childProduct: true,
          },
        },
      },
    });

    const productMap = new Map<string, any>();
    productsWithComponents.forEach((p: any) => productMap.set(p.sku, p));

    return containers.map((c: any) => ({
      id: c.id,
      containerNumber: c.containerNumber,
      warehouseId: c.warehouseId,
      warehouseName: c.warehouse?.name || 'Sin Depósito',
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
      items: c.items.map((i: any) => {
        const prod = productMap.get(i.sku);
        const dbComponents = prod?.comboParentItems || [];

        let componentsList: any[] = [];
        if (i.rawComponents && Array.isArray(i.rawComponents)) {
          componentsList = i.rawComponents.map((comp: any) => ({
            childSku: comp.childSku || comp.sku || '',
            description: comp.description || '',
            quantityPerCombo: Number(
              comp.quantityPerCombo || comp.quantity || 1,
            ),
          }));
        } else if (dbComponents.length > 0) {
          componentsList = dbComponents.map((comp: any) => ({
            childSku: comp.childProduct?.sku || '',
            description: comp.childProduct?.name || '',
            quantityPerCombo: Number(comp.quantityPerCombo || 1),
          }));
        }

        return {
          id: i.id,
          sku: i.sku,
          description: i.description,
          quantityBultos: i.quantityBultos,
          unitsPerBox: i.unitsPerBox,
          totalUnits: i.totalUnits,
          weightPerBultoKg: Number(i.weightPerBultoKg || 0),
          volumePerBultoM3: Number(i.volumePerBultoM3 || 0),
          locationId: i.locationId,
          isControlled: i.isControlled,
          controlledBy: i.controlledBy
            ? `${i.controlledBy.firstName} ${i.controlledBy.lastName}`
            : null,
          controlledAt: i.controlledAt,
          isCombo: componentsList.length > 0,
          components: componentsList,
        };
      }),
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

  // AUXILIAR: VALIDADOR REGEX UUID V4
  private isValidUuid(id?: string): boolean {
    if (!id) return false;
    const uuidRegex =
      /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
    return uuidRegex.test(id);
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

    let activeUser = null;
    if (this.isValidUuid(userId)) {
      activeUser = await this.prisma.user.findUnique({
        where: { id: userId },
      });
    }
    if (!activeUser) {
      activeUser = await this.prisma.user.findFirst();
    }

    if (!activeUser)
      throw new BadRequestException(
        'No hay usuarios registrados en el sistema.',
      );

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
        } else {
          product = await tx.product.update({
            where: { id: product.id },
            data: {
              unitsPerBox: item.unitsPerBox || product.unitsPerBox,
              weightKg: item.weightPerBultoKg || product.weightKg,
              volumeM3: item.volumePerBultoM3 || product.volumeM3,
            },
          });
        }

        if (item.parentSku && item.parentSku !== item.sku) {
          let parentProduct = await tx.product.findUnique({
            where: { sku: item.parentSku },
          });

          if (!parentProduct) {
            parentProduct = await tx.product.create({
              data: {
                sku: item.parentSku,
                name: `Combo ${item.parentSku}`,
                unitsPerBox: 1,
              },
            });
          }

          await tx.comboComponent.upsert({
            where: {
              parentProductId_childProductId: {
                parentProductId: parentProduct.id,
                childProductId: product.id,
              },
            },
            update: {},
            create: {
              parentProductId: parentProduct.id,
              childProductId: product.id,
              quantityPerCombo: 1,
            },
          });
        }

        const effectiveWarehouseId = item.warehouseId || container.warehouseId;

        const existingInv = await tx.inventory.findFirst({
          where: {
            warehouseId: effectiveWarehouseId,
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
              warehouseId: effectiveWarehouseId,
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
            warehouseId: effectiveWarehouseId,
            targetLocationId: item.locationId,
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

  // MOVER STOCK DE UNA UBICACIÓN/DEPÓSITO A OTRO
  async transferStock(dto: {
    inventoryId: string;
    targetLocationId: string;
    targetWarehouseId?: string;
    quantityBultos: number;
    userId?: string;
  }) {
    const {
      inventoryId,
      targetLocationId,
      targetWarehouseId,
      quantityBultos,
      userId,
    } = dto;

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

    let activeUser = null;
    if (this.isValidUuid(userId)) {
      activeUser = await this.prisma.user.findUnique({
        where: { id: userId },
      });
    }
    if (!activeUser) {
      activeUser = await this.prisma.user.findFirst();
    }

    if (!activeUser)
      throw new BadRequestException('Usuario no válido en el sistema.');

    return this.prisma.$transaction(async (tx) => {
      const targetLocation = await tx.location.findUnique({
        where: { id: targetLocationId },
      });

      if (!targetLocation)
        throw new NotFoundException('Ubicación destino no encontrada.');

      const destinationWarehouseId =
        targetWarehouseId || targetLocation.warehouseId;

      // 1. Restar o eliminar stock del origen
      if (sourceInv.quantity === quantityBultos) {
        await tx.inventory.delete({ where: { id: sourceInv.id } });
      } else {
        await tx.inventory.update({
          where: { id: sourceInv.id },
          data: { quantity: sourceInv.quantity - quantityBultos },
        });
      }

      // 2. Incrementar o crear registro en el destino
      const targetInv = await tx.inventory.findFirst({
        where: {
          warehouseId: destinationWarehouseId,
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
            warehouseId: destinationWarehouseId,
            productId: sourceInv.productId,
            locationId: targetLocationId,
            quantity: quantityBultos,
            lotNumber: sourceInv.lotNumber,
          },
        });
      }

      // 3. Registrar el movimiento
      await tx.stockMovement.create({
        data: {
          productId: sourceInv.productId,
          warehouseId: destinationWarehouseId,
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

  // ---------------------------------------------------------------------------
  // CARGA MANUAL DE STOCK E INVENTARIO POR UBICACIÓN
  // ---------------------------------------------------------------------------
  async createManualStock(dto: CreateManualStockDto) {
    const { warehouseId, locationId, items, userId } = dto;

    let activeUser = null;
    if (this.isValidUuid(userId)) {
      activeUser = await this.prisma.user.findUnique({
        where: { id: userId },
      });
    }
    if (!activeUser) {
      activeUser = await this.prisma.user.findFirst();
    }

    if (!activeUser) {
      throw new BadRequestException('Usuario no válido en el sistema.');
    }

    return await this.prisma.$transaction(async (tx) => {
      const results = [];

      for (const item of items) {
        // 1. Verificar/Crear el producto según SKU
        let product = await tx.product.findUnique({
          where: { sku: item.productSku },
        });

        if (!product) {
          product = await tx.product.create({
            data: {
              sku: item.productSku,
              name: item.productName,
              unitsPerBox: item.unitsPerBox || 1,
              weightKg: item.weightPerBultoKg || 10,
              volumeM3: item.volumePerBultoM3 || 0.036,
            },
          });
        }

        // 2. Buscar si ya existe registro de este producto en la misma ubicación
        const existingStock = await tx.inventory.findFirst({
          where: {
            warehouseId,
            locationId,
            productId: product.id,
          },
        });

        let stockRecord;

        if (existingStock) {
          stockRecord = await tx.inventory.update({
            where: { id: existingStock.id },
            data: {
              quantity: existingStock.quantity + item.quantityBultos,
              updatedAt: new Date(),
            },
          });
        } else {
          stockRecord = await tx.inventory.create({
            data: {
              warehouseId,
              locationId,
              productId: product.id,
              quantity: item.quantityBultos,
              lotNumber: 'CARGA_MANUAL',
            },
          });
        }

        // 3. Registrar auditoría/movimiento de stock
        await tx.stockMovement.create({
          data: {
            productId: product.id,
            warehouseId,
            targetLocationId: locationId,
            userId: activeUser.id,
            type: 'INBOUND',
            quantity: item.quantityBultos,
            referenceCode: 'CARGA_MANUAL_POSICION',
          },
        });

        results.push(stockRecord);
      }

      return {
        success: true,
        message: 'Stock manual registrado e ingresado a la posición con éxito.',
        records: results,
      };
    });
  }

  async getStockByLocation(locationId: string) {
    const inventories = await this.prisma.inventory.findMany({
      where: { locationId },
      include: {
        product: true,
        warehouse: true,
        location: true,
      },
    });

    return inventories.map((inv: any) => ({
      id: inv.id,
      productId: inv.productId,
      productSku: inv.product?.sku || 'S/SKU',
      productName: inv.product?.name || 'S/Nombre',
      quantityBultos: inv.quantity,
      unitsPerBox: inv.product?.unitsPerBox || 1,
      weightPerBultoKg: inv.product?.weightKg
        ? Number(inv.product.weightKg)
        : 0,
      volumePerBultoM3: inv.product?.volumeM3
        ? Number(inv.product.volumeM3)
        : 0,
      warehouseName: inv.warehouse?.name,
      locationCode: inv.location?.code,
      updatedAt: inv.updatedAt,
    }));
  }
}
