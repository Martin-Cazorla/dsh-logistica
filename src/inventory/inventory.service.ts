// dsh-logistica/src/inventory/inventory.service.ts

import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InboundStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { InboundDto, CreateWarehouseDto } from './dto/inbound.dto';
import { CreateManualStockDto } from './dto/create-manual-stock.dto';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { AdjustStockDto } from './dto/adjust-stock.dto';
import { ProcessInboundDto } from './dto/process-inbound.dto';
import { GenerateBatchLocationsDto } from './dto/generate-batch-locations.dto';
import { LocationCapacityUpdateDto } from './dto/update-locations-capacity.dto';
import { InventoryGateway } from './inventory.gateway';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity } from '../audit/audit.actions';

type Tx = Prisma.TransactionClient;

/** Valor centinela de lote (Inventory.lotNumber es NOT NULL). */
export const NO_LOT = 'SIN_LOTE';
const MANUAL_LOT = 'CARGA_MANUAL';
const DEFAULT_LOCATION_CAPACITY_M3 = 10;
const MAX_BATCH_LOCATIONS = 5000;
const RACK_LEVELS = ['A', 'B', 'C', 'D', 'E'];

interface LocationRow {
  id: string;
  warehouseId: string;
  code: string;
  aisle: string;
  rack: string;
  position: string;
  capacity: Prisma.Decimal;
  notes: string | null;
}

export interface ComponentView {
  childSku: string;
  description: string;
  quantityPerCombo: number;
}

interface RawComponent {
  childSku?: string;
  sku?: string;
  description?: string;
  quantityPerCombo?: number | string;
  quantity?: number | string;
}

const LOCATION_SELECT = {
  id: true,
  warehouseId: true,
  code: true,
  aisle: true,
  rack: true,
  position: true,
  capacity: true,
  notes: true,
} satisfies Prisma.LocationSelect;

@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: InventoryGateway,
    private readonly audit: AuditService,
  ) {}

  // ===========================================================================
  // OCUPACIÓN
  // ===========================================================================

  /**
   * Antes: findMany(warehouse -> locations -> inventories -> product) cargaba en
   * memoria TODO el inventario con su producto para sumar volúmenes en JS.
   * Ahora: las ubicaciones se traen con un select mínimo y el volumen usado se
   * agrega en PostgreSQL con un único GROUP BY.
   */
  async getOccupancySummary() {
    const [warehouses, usageRows] = await Promise.all([
      this.prisma.warehouse.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          address: true,
          locations: { select: LOCATION_SELECT, orderBy: { code: 'asc' } },
        },
        orderBy: { name: 'asc' },
      }),
      this.prisma.$queryRaw<Array<{ location_id: string; used_m3: number }>>`
        SELECT i.location_id, SUM(i.quantity * p.volume_m3)::float8 AS used_m3
        FROM inventories i
        JOIN products p ON p.id = i.product_id
        WHERE i.quantity > 0
        GROUP BY i.location_id
      `,
    ]);

    const usedByLocation = new Map(
      usageRows.map((r) => [r.location_id, Number(r.used_m3) || 0]),
    );

    return warehouses.map((wh) => {
      let totalCapacityM3 = 0;
      let usedCapacityM3 = 0;

      const mappedLocations = wh.locations.map((loc) => {
        const view = this.toLocationView(loc, usedByLocation.get(loc.id) ?? 0);
        totalCapacityM3 += view.maxCapacityM3;
        usedCapacityM3 += view.usedCapacityM3;
        return view;
      });

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
        totalLocations: mappedLocations.length,
        occupiedLocations: mappedLocations.filter((l) => l.usedCapacityM3 > 0)
          .length,
        locations: mappedLocations,
      };
    });
  }

  // ===========================================================================
  // DEPÓSITOS
  // ===========================================================================

  async getWarehousesList() {
    return this.prisma.warehouse.findMany({
      where: { isActive: true },
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
    const generatedCode = dto.code?.trim() || `${baseCode}-${randomSuffix}`;

    try {
      return await this.prisma.warehouse.create({
        data: {
          code: generatedCode,
          name: cleanName,
          address: dto.address || null,
        },
      });
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException(
          `Ya existe un depósito con el código "${generatedCode}".`,
        );
      }
      throw error;
    }
  }

  /**
   * Si el depósito tiene historial (pedidos, movimientos o contenedores) se
   * desactiva en lugar de borrarse: borrarlo rompía las FK (error 500) o, de
   * haber cascada, destruiría la trazabilidad.
   */
  async deleteWarehouse(warehouseId: string) {
    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: {
        id: true,
        _count: {
          select: {
            inventories: { where: { quantity: { gt: 0 } } },
            stockMovements: true,
            sourceOrders: true,
            inboundContainers: true,
          },
        },
      },
    });

    if (!warehouse) throw new NotFoundException('Depósito no encontrado.');

    if (warehouse._count.inventories > 0) {
      throw new BadRequestException(
        'No se puede eliminar un depósito que posee stock activo.',
      );
    }

    const hasHistory =
      warehouse._count.stockMovements > 0 ||
      warehouse._count.sourceOrders > 0 ||
      warehouse._count.inboundContainers > 0;

    if (hasHistory) {
      await this.prisma.warehouse.update({
        where: { id: warehouseId },
        data: { isActive: false },
      });
      this.gateway.emitOccupancyChanged([warehouseId]);
      return {
        success: true,
        softDeleted: true,
        message:
          'El depósito posee historial operativo: se desactivó en lugar de eliminarse.',
      };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.inventory.deleteMany({ where: { warehouseId } });
      await tx.location.deleteMany({ where: { warehouseId } });
      await tx.warehouse.delete({ where: { id: warehouseId } });
    });

    this.gateway.emitOccupancyChanged([warehouseId]);
    return { success: true, softDeleted: false };
  }

  // ===========================================================================
  // UBICACIONES
  // ===========================================================================

  async getLocationsByWarehouse(warehouseId: string) {
    const locations = await this.prisma.location.findMany({
      where: { warehouseId },
      select: LOCATION_SELECT,
      orderBy: { code: 'asc' },
    });
    return locations.map((loc) => this.toLocationView(loc, 0));
  }

  async generateLocationsBatch(dto: GenerateBatchLocationsDto) {
    const {
      warehouseId,
      category,
      areaName,
      levels,
      positionStart,
      positionEnd,
      maxCapacityM3PerUnit,
    } = dto;

    if (positionEnd < positionStart) {
      throw new BadRequestException(
        'La posición final debe ser mayor o igual a la inicial.',
      );
    }

    const total = levels.length * (positionEnd - positionStart + 1);
    if (total > MAX_BATCH_LOCATIONS) {
      throw new BadRequestException(
        `Se intentan generar ${total} ubicaciones; el máximo por lote es ${MAX_BATCH_LOCATIONS}.`,
      );
    }

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true },
    });
    if (!warehouse) throw new NotFoundException('Depósito no encontrado.');

    const cleanArea = (areaName || 'GENERAL')
      .trim()
      .replace(/\s+/g, '-')
      .toUpperCase();
    const capacity = new Prisma.Decimal(
      maxCapacityM3PerUnit > 0 ? maxCapacityM3PerUnit : 2.5,
    );

    const locationsToCreate: Prisma.LocationCreateManyInput[] = [];
    for (const rawLevel of levels) {
      const level = rawLevel.trim().toUpperCase();
      for (let pos = positionStart; pos <= positionEnd; pos++) {
        locationsToCreate.push({
          warehouseId,
          code: `${category}-${cleanArea}-${level}${pos}`,
          aisle: areaName?.trim() || 'General',
          rack: level,
          position: String(pos),
          capacity,
        });
      }
    }

    const result = await this.prisma.location.createMany({
      data: locationsToCreate,
      skipDuplicates: true,
    });

    this.gateway.emitOccupancyChanged([warehouseId]);
    return result;
  }

  async updateLocationsCapacity(updates: LocationCapacityUpdateDto[]) {
    const results = await this.prisma.$transaction(
      updates.map((u) =>
        this.prisma.location.update({
          where: { id: u.id },
          data: { capacity: new Prisma.Decimal(u.capacity) },
          select: { id: true, warehouseId: true },
        }),
      ),
    );

    this.gateway.emitOccupancyChanged([
      ...new Set(results.map((r) => r.warehouseId)),
    ]);
    return { count: results.length };
  }

  async deleteLocationsBatch(locationIds: string[]) {
    if (!locationIds || locationIds.length === 0) {
      return { count: 0 };
    }

    const invCount = await this.prisma.inventory.count({
      where: { locationId: { in: locationIds }, quantity: { gt: 0 } },
    });
    if (invCount > 0) {
      throw new BadRequestException(
        'Existen ubicaciones seleccionadas con stock activo.',
      );
    }

    const warehouses = await this.prisma.location.findMany({
      where: { id: { in: locationIds } },
      select: { warehouseId: true },
      distinct: ['warehouseId'],
    });

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        await tx.inventory.deleteMany({
          where: { locationId: { in: locationIds }, quantity: 0 },
        });
        return tx.location.deleteMany({ where: { id: { in: locationIds } } });
      });
      this.gateway.emitOccupancyChanged(warehouses.map((w) => w.warehouseId));
      return result;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new BadRequestException(
          'Algunas ubicaciones tienen historial de movimientos o contenedores asociados. Bloquéelas en lugar de eliminarlas para conservar la trazabilidad.',
        );
      }
      throw error;
    }
  }

  // ===========================================================================
  // STOCK
  // ===========================================================================

  async getStockList(warehouseId?: string, search?: string) {
    const where: Prisma.InventoryWhereInput = { quantity: { gt: 0 } };
    if (warehouseId) where.warehouseId = warehouseId;

    const term = search?.trim();
    if (term) {
      where.OR = [
        { product: { name: { contains: term, mode: 'insensitive' } } },
        { product: { sku: { contains: term, mode: 'insensitive' } } },
        { location: { code: { contains: term, mode: 'insensitive' } } },
      ];
    }

    const inventories = await this.prisma.inventory.findMany({
      where,
      select: {
        id: true,
        productId: true,
        warehouseId: true,
        locationId: true,
        lotNumber: true,
        quantity: true,
        updatedAt: true,
        product: {
          select: {
            sku: true,
            name: true,
            barcode: true,
            unitsPerBox: true,
            weightKg: true,
            volumeM3: true,
            comboParentItems: {
              select: {
                quantityPerCombo: true,
                childProduct: { select: { sku: true, name: true } },
              },
            },
          },
        },
        warehouse: { select: { name: true } },
        location: { select: { code: true } },
      },
      orderBy: [{ product: { sku: 'asc' } }, { location: { code: 'asc' } }],
    });

    return inventories.map((inv) => {
      const weightKg = Number(inv.product.weightKg);
      const volumeM3 = Number(inv.product.volumeM3);
      const components: ComponentView[] = inv.product.comboParentItems.map(
        (c) => ({
          childSku: c.childProduct.sku,
          description: c.childProduct.name,
          quantityPerCombo: c.quantityPerCombo,
        }),
      );

      return {
        id: inv.id,
        productId: inv.productId,
        productSku: inv.product.sku,
        productName: inv.product.name,
        eanCode: inv.product.barcode ?? undefined,
        containerNumber: this.lotForDisplay(inv.lotNumber),
        warehouseId: inv.warehouseId,
        warehouseName: inv.warehouse.name,
        locationId: inv.locationId,
        locationCode: inv.location.code,
        quantityBultos: inv.quantity,
        unitsPerBox: inv.product.unitsPerBox,
        weightPerBultoKg: weightKg,
        volumePerBultoM3: volumeM3,
        totalWeightKg: Number((inv.quantity * weightKg).toFixed(2)),
        totalVolumeM3: Number((inv.quantity * volumeM3).toFixed(3)),
        isCombo: components.length > 0,
        components,
        updatedAt: inv.updatedAt,
      };
    });
  }

  async getStockByLocation(locationId: string) {
    const inventories = await this.prisma.inventory.findMany({
      where: { locationId, quantity: { gt: 0 } },
      select: {
        id: true,
        productId: true,
        quantity: true,
        updatedAt: true,
        product: {
          select: {
            sku: true,
            name: true,
            unitsPerBox: true,
            weightKg: true,
            volumeM3: true,
          },
        },
        warehouse: { select: { name: true } },
        location: { select: { code: true } },
      },
    });

    return inventories.map((inv) => ({
      id: inv.id,
      productId: inv.productId,
      productSku: inv.product.sku,
      productName: inv.product.name,
      quantityBultos: inv.quantity,
      unitsPerBox: inv.product.unitsPerBox,
      weightPerBultoKg: Number(inv.product.weightKg),
      volumePerBultoM3: Number(inv.product.volumeM3),
      warehouseName: inv.warehouse.name,
      locationCode: inv.location.code,
      updatedAt: inv.updatedAt,
    }));
  }

  // ===========================================================================
  // FASE 1: PRE-CARGA DE PACKING LIST
  // ===========================================================================

  async createPackingList(dto: InboundDto) {
    const { containerNumber, warehouseId, items } = dto;

    if (!containerNumber?.trim()) {
      throw new BadRequestException('El número de contenedor es obligatorio.');
    }

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: warehouseId },
      select: { id: true, isActive: true },
    });
    if (!warehouse || !warehouse.isActive) {
      throw new NotFoundException('Depósito no encontrado o inactivo.');
    }

    return this.prisma.inboundContainer.create({
      data: {
        containerNumber: containerNumber.trim(),
        warehouseId,
        status: InboundStatus.PENDIENTE,
        items: {
          create: items.map((item) => {
            const unitsPerBox = item.unitsPerBox || 1;
            return {
              sku: item.productSku,
              description: item.productName,
              quantityBultos: item.quantityBultos,
              unitsPerBox,
              totalUnits: item.quantityBultos * unitsPerBox,
              weightPerBultoKg: item.weightPerBultoKg ?? 0,
              volumePerBultoM3: item.volumePerBultoM3 ?? 0,
              sampleUnits: item.sampleUnits || 0,
              notes: item.notes || null,
              locationId: item.locationId || null,
              rawComponents:
                item.isCombo && item.components && item.components.length > 0
                  ? (item.components as unknown as Prisma.InputJsonValue)
                  : Prisma.JsonNull,
            };
          }),
        },
      },
      include: { items: true },
    });
  }

  // ===========================================================================
  // HISTORIAL DE CONTENEDORES
  // ===========================================================================

  async getContainersHistory(status?: string) {
    const where: Prisma.InboundContainerWhereInput = {};
    if (status) {
      if (!Object.values(InboundStatus).includes(status as InboundStatus)) {
        throw new BadRequestException(
          `Estado de contenedor inválido: ${status}`,
        );
      }
      where.status = status as InboundStatus;
    }

    const containers = await this.prisma.inboundContainer.findMany({
      where,
      include: {
        warehouse: { select: { name: true } },
        items: {
          include: {
            controlledBy: { select: { firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const allSkus = [
      ...new Set(containers.flatMap((c) => c.items.map((i) => i.sku))),
    ];

    const productsWithComponents =
      allSkus.length === 0
        ? []
        : await this.prisma.product.findMany({
            where: { sku: { in: allSkus } },
            select: {
              sku: true,
              comboParentItems: {
                select: {
                  quantityPerCombo: true,
                  childProduct: { select: { sku: true, name: true } },
                },
              },
            },
          });

    const productMap = new Map(productsWithComponents.map((p) => [p.sku, p]));

    return containers.map((c) => ({
      id: c.id,
      containerNumber: c.containerNumber,
      warehouseId: c.warehouseId,
      warehouseName: c.warehouse?.name || 'Sin Depósito',
      status: c.status,
      arrivalDate: c.createdAt,
      dischargeDate: c.dischargeDate,
      totalBultos: c.items.reduce((acc, i) => acc + i.quantityBultos, 0),
      totalUnits: c.items.reduce((acc, i) => acc + i.totalUnits, 0),
      items: c.items.map((i) => {
        let componentsList: ComponentView[] = [];

        if (Array.isArray(i.rawComponents)) {
          componentsList = (i.rawComponents as unknown as RawComponent[]).map(
            (comp) => ({
              childSku: comp.childSku || comp.sku || '',
              description: comp.description || '',
              quantityPerCombo: Number(
                comp.quantityPerCombo || comp.quantity || 1,
              ),
            }),
          );
        } else {
          const dbComponents = productMap.get(i.sku)?.comboParentItems ?? [];
          componentsList = dbComponents.map((comp) => ({
            childSku: comp.childProduct.sku,
            description: comp.childProduct.name,
            quantityPerCombo: comp.quantityPerCombo,
          }));
        }

        return {
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
          isCombo: componentsList.length > 0,
          components: componentsList,
        };
      }),
    }));
  }

  async deleteContainer(containerId: string) {
    // Borrado condicional atómico: no puede eliminarse si en paralelo otro
    // operario lo está recibiendo.
    const result = await this.prisma.inboundContainer.deleteMany({
      where: { id: containerId, status: { not: InboundStatus.RECIBIDO } },
    });

    if (result.count === 0) {
      const exists = await this.prisma.inboundContainer.findUnique({
        where: { id: containerId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException('Contenedor no encontrado.');
      throw new BadRequestException(
        'No se puede eliminar un contenedor que ya fue recibido e ingresado al stock.',
      );
    }

    return { success: true };
  }

  // ===========================================================================
  // FASE 2: PROCESAR ESTIBADO
  // ===========================================================================

  /**
   * Correcciones críticas:
   * - Bloqueo FOR UPDATE del contenedor + verificación de estado PENDIENTE:
   *   antes, un doble click o dos operarios procesando a la vez ingresaban el
   *   stock DOS veces.
   * - El usuario responsable es el del JWT (antes, si el userId del frontend no
   *   era un UUID válido, se tomaba `user.findFirst()`: un usuario arbitrario).
   * - El depósito se deriva de la ubicación (antes podía grabarse inventario
   *   con warehouseId distinto al de su ubicación).
   * - Upsert por la clave única (ubicación, producto, lote): no pisa el lote de
   *   un registro existente y es seguro ante inserciones concurrentes.
   * - Se registra quién controló cada ítem del contenedor.
   */
  async processInbound(dto: ProcessInboundDto, actor: AuthenticatedUser) {
    const { containerId, items } = dto;
    const touchedWarehouses = new Set<string>();

    const result = await this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<
          Array<{ id: string; status: InboundStatus; container_number: string }>
        >`
          SELECT id, status, container_number
          FROM inbound_containers
          WHERE id = ${containerId}::uuid
          FOR UPDATE
        `;
        const container = locked[0];

        if (!container) {
          throw new NotFoundException('Contenedor no encontrado.');
        }
        if (container.status !== InboundStatus.PENDIENTE) {
          throw new ConflictException(
            `El contenedor ya fue procesado (estado: ${container.status}).`,
          );
        }

        const lot = container.container_number?.trim() || NO_LOT;
        const locationMap = await this.loadUsableLocations(
          tx,
          items.map((i) => i.locationId),
        );

        // Productos: un upsert por SKU distinto
        const productIdBySku = new Map<string, string>();
        for (const item of items) {
          if (productIdBySku.has(item.sku)) continue;
          const product = await tx.product.upsert({
            where: { sku: item.sku },
            create: {
              sku: item.sku,
              name: item.description,
              unitsPerBox: item.unitsPerBox || 1,
              weightKg: item.weightPerBultoKg ?? 0,
              volumeM3: item.volumePerBultoM3 ?? 0,
            },
            update: {
              ...(item.unitsPerBox ? { unitsPerBox: item.unitsPerBox } : {}),
              ...(item.weightPerBultoKg
                ? { weightKg: item.weightPerBultoKg }
                : {}),
              ...(item.volumePerBultoM3
                ? { volumeM3: item.volumePerBultoM3 }
                : {}),
            },
            select: { id: true },
          });
          productIdBySku.set(item.sku, product.id);
        }

        // Combos padre / hijo
        for (const item of items) {
          if (!item.parentSku || item.parentSku === item.sku) continue;

          const parent = await tx.product.upsert({
            where: { sku: item.parentSku },
            create: {
              sku: item.parentSku,
              name: `Combo ${item.parentSku}`,
              unitsPerBox: 1,
            },
            update: {},
            select: { id: true },
          });

          const childId = productIdBySku.get(item.sku)!;
          await tx.comboComponent.upsert({
            where: {
              parentProductId_childProductId: {
                parentProductId: parent.id,
                childProductId: childId,
              },
            },
            update: {},
            create: {
              parentProductId: parent.id,
              childProductId: childId,
              quantityPerCombo: 1,
            },
          });
        }

        // Stock + movimientos
        for (const item of items) {
          const location = locationMap.get(item.locationId)!;
          const productId = productIdBySku.get(item.sku)!;

          await this.incrementStock(tx, {
            warehouseId: location.warehouseId,
            locationId: location.id,
            productId,
            lotNumber: lot,
            quantity: item.quantityBultos,
          });

          await tx.stockMovement.create({
            data: {
              productId,
              warehouseId: location.warehouseId,
              targetLocationId: location.id,
              userId: actor.id,
              type: 'INBOUND',
              quantity: item.quantityBultos,
              lotNumber: lot,
              referenceCode: container.container_number,
              notes: item.notes?.slice(0, 255) || null,
            },
          });

          touchedWarehouses.add(location.warehouseId);
        }

        const now = new Date();

        await tx.inboundContainerItem.updateMany({
          where: { containerId },
          data: {
            isControlled: true,
            controlledById: actor.id,
            controlledAt: now,
          },
        });

        await tx.inboundContainer.update({
          where: { id: containerId },
          data: { status: InboundStatus.RECIBIDO, dischargeDate: now },
        });

        await this.audit.log(
          {
            actor,
            action: AuditAction.STOCK_INBOUND,
            entityType: AuditEntity.INBOUND_CONTAINER,
            entityId: containerId,
            metadata: {
              containerNumber: container.container_number,
              lines: items.length,
              bultos: items.reduce((acc, i) => acc + i.quantityBultos, 0),
              warehouses: [...touchedWarehouses],
            },
          },
          tx,
        );

        return {
          success: true,
          message: 'Contenedor procesado e ingresado al stock correctamente.',
        };
      },
      { timeout: 60000 },
    );

    this.gateway.emitOccupancyChanged([...touchedWarehouses]);
    return result;
  }

  // ===========================================================================
  // REUBICACIÓN (MISMO DEPÓSITO O INTER-DEPÓSITO)
  // ===========================================================================

  /**
   * Antes: la lectura del origen y la validación de cantidad ocurrían FUERA de
   * la transacción y luego se escribía `quantity: source.quantity - n` (valor
   * absoluto calculado en memoria). Dos reubicaciones simultáneas del mismo
   * pallet podían "mover" más stock del existente (lost update) y generar
   * stock duplicado en destino.
   * Ahora: decremento condicional atómico + upsert en destino + doble
   * movimiento TRANSFER_OUT / TRANSFER_IN.
   */
  async transferStock(dto: TransferStockDto, actor: AuthenticatedUser) {
    const { inventoryId, targetLocationId, quantityBultos } = dto;
    let affected: string[] = [];

    const result = await this.prisma.$transaction(async (tx) => {
      const source = await tx.inventory.findUnique({
        where: { id: inventoryId },
        select: {
          id: true,
          warehouseId: true,
          locationId: true,
          productId: true,
          lotNumber: true,
          expiresAt: true,
          quantity: true,
          reserved: true,
        },
      });

      if (!source) {
        throw new NotFoundException(
          'No se encontró el registro de inventario en la ubicación de origen especificada.',
        );
      }

      if (source.locationId === targetLocationId) {
        throw new BadRequestException(
          'La ubicación de destino debe ser distinta a la de origen.',
        );
      }

      const target = (
        await this.loadUsableLocations(tx, [targetLocationId])
      ).get(targetLocationId)!;

      await this.decrementStock(tx, source.id, quantityBultos, source.reserved);

      await this.incrementStock(tx, {
        warehouseId: target.warehouseId,
        locationId: target.id,
        productId: source.productId,
        lotNumber: source.lotNumber,
        quantity: quantityBultos,
        expiresAt: source.expiresAt,
      });

      const reference = `REUBICACION_${source.lotNumber}`.slice(0, 100);
      const notes = dto.notes?.trim() || null;

      await tx.stockMovement.createMany({
        data: [
          {
            productId: source.productId,
            warehouseId: source.warehouseId,
            sourceLocationId: source.locationId,
            targetLocationId: target.id,
            userId: actor.id,
            type: 'TRANSFER_OUT',
            quantity: quantityBultos,
            lotNumber: source.lotNumber,
            referenceCode: reference,
            notes,
          },
          {
            productId: source.productId,
            warehouseId: target.warehouseId,
            sourceLocationId: source.locationId,
            targetLocationId: target.id,
            userId: actor.id,
            type: 'TRANSFER_IN',
            quantity: quantityBultos,
            lotNumber: source.lotNumber,
            referenceCode: reference,
            notes,
          },
        ],
      });

      await this.purgeIfEmpty(tx, source.id);

      await this.audit.log(
        {
          actor,
          action: AuditAction.STOCK_TRANSFERRED,
          entityType: AuditEntity.INVENTORY,
          entityId: source.id,
          metadata: {
            productId: source.productId,
            lotNumber: source.lotNumber,
            quantity: quantityBultos,
            fromLocationId: source.locationId,
            fromWarehouseId: source.warehouseId,
            toLocationId: target.id,
            toWarehouseId: target.warehouseId,
          },
        },
        tx,
      );

      affected = [source.warehouseId, target.warehouseId];

      return {
        success: true,
        message: 'Stock reubicado correctamente.',
      };
    });

    this.gateway.emitOccupancyChanged(affected);
    return result;
  }

  // ===========================================================================
  // DESCUENTO / AJUSTE MANUAL
  // ===========================================================================

  async adjustStock(dto: AdjustStockDto, actor: AuthenticatedUser) {
    let warehouseId = '';

    const result = await this.prisma.$transaction(async (tx) => {
      const inv = await tx.inventory.findUnique({
        where: { id: dto.inventoryId },
        select: {
          id: true,
          warehouseId: true,
          locationId: true,
          productId: true,
          lotNumber: true,
          reserved: true,
        },
      });

      if (!inv) {
        throw new NotFoundException('Registro de inventario no encontrado.');
      }

      const remaining = await this.decrementStock(
        tx,
        inv.id,
        dto.quantityBultos,
        inv.reserved,
      );

      await tx.stockMovement.create({
        data: {
          productId: inv.productId,
          warehouseId: inv.warehouseId,
          sourceLocationId: inv.locationId,
          userId: actor.id,
          type: 'ADJUSTMENT',
          quantity: dto.quantityBultos,
          lotNumber: inv.lotNumber,
          referenceCode: 'DESCUENTO_MANUAL',
          notes: dto.reason.trim(),
        },
      });

      await this.purgeIfEmpty(tx, inv.id);
      warehouseId = inv.warehouseId;

      await this.audit.log(
        {
          actor,
          action: AuditAction.STOCK_ADJUSTED,
          entityType: AuditEntity.INVENTORY,
          entityId: inv.id,
          metadata: {
            productId: inv.productId,
            locationId: inv.locationId,
            lotNumber: inv.lotNumber,
            quantity: -dto.quantityBultos,
            remaining,
            reason: dto.reason.trim(),
          },
        },
        tx,
      );

      return {
        success: true,
        remainingQuantity: remaining,
        message: `Se descontaron ${dto.quantityBultos} bultos. Stock restante: ${remaining}.`,
      };
    });

    this.gateway.emitOccupancyChanged([warehouseId]);
    return result;
  }

  /** Historial auditable de descuentos (reemplaza el historial en localStorage). */
  async getAdjustmentHistory(limit = 100) {
    const movements = await this.prisma.stockMovement.findMany({
      where: { type: 'ADJUSTMENT' },
      select: {
        id: true,
        quantity: true,
        notes: true,
        createdAt: true,
        product: { select: { sku: true } },
        sourceLocation: { select: { code: true } },
        user: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 500),
    });

    return movements.map((m) => ({
      id: m.id,
      productSku: m.product.sku,
      quantityBultos: m.quantity,
      reason: m.notes ?? '',
      performedBy: `${m.user.firstName} ${m.user.lastName}`.trim(),
      timestamp: m.createdAt.toLocaleString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
      }),
      locationCode: m.sourceLocation?.code ?? '',
    }));
  }

  // ===========================================================================
  // CARGA MANUAL DE STOCK POR UBICACIÓN
  // ===========================================================================

  async createManualStock(dto: CreateManualStockDto, actor: AuthenticatedUser) {
    const { locationId, items } = dto;
    let warehouseId = '';

    const result = await this.prisma.$transaction(
      async (tx) => {
        const location = (await this.loadUsableLocations(tx, [locationId])).get(
          locationId,
        )!;
        warehouseId = location.warehouseId;

        const records: Array<{
          id: string;
          productId: string;
          quantity: number;
        }> = [];

        for (const item of items) {
          const product = await tx.product.upsert({
            where: { sku: item.productSku },
            create: {
              sku: item.productSku,
              name: item.productName,
              unitsPerBox: item.unitsPerBox || 1,
              weightKg: item.weightPerBultoKg ?? 10,
              volumeM3: item.volumePerBultoM3 ?? 0.036,
            },
            update: {},
            select: { id: true },
          });

          const stockRecord = await this.incrementStock(tx, {
            warehouseId: location.warehouseId,
            locationId: location.id,
            productId: product.id,
            lotNumber: MANUAL_LOT,
            quantity: item.quantityBultos,
          });

          await tx.stockMovement.create({
            data: {
              productId: product.id,
              warehouseId: location.warehouseId,
              targetLocationId: location.id,
              userId: actor.id,
              type: 'INBOUND',
              quantity: item.quantityBultos,
              lotNumber: MANUAL_LOT,
              referenceCode: 'CARGA_MANUAL_POSICION',
              notes: item.notes?.trim() || null,
            },
          });

          records.push(stockRecord);
        }

        await this.audit.log(
          {
            actor,
            action: AuditAction.STOCK_MANUAL_LOAD,
            entityType: AuditEntity.LOCATION,
            entityId: location.id,
            metadata: {
              warehouseId: location.warehouseId,
              items: items.map((i) => ({
                sku: i.productSku,
                quantity: i.quantityBultos,
              })),
            },
          },
          tx,
        );

        return {
          success: true,
          message:
            'Stock manual registrado e ingresado a la posición con éxito.',
          records,
        };
      },
      { timeout: 30000 },
    );

    this.gateway.emitOccupancyChanged([warehouseId]);
    return result;
  }

  // ===========================================================================
  // AUXILIARES DE CONCURRENCIA
  // ===========================================================================

  /**
   * Suma stock con INSERT ... ON CONFLICT DO UPDATE (Prisma usa upsert nativo
   * cuando el where es la clave única). Dos ingresos simultáneos a la misma
   * posición/producto/lote ya no pueden crear filas duplicadas ni perder una
   * de las sumas.
   */
  private incrementStock(
    tx: Tx,
    params: {
      warehouseId: string;
      locationId: string;
      productId: string;
      lotNumber: string;
      quantity: number;
      expiresAt?: Date | null;
    },
  ) {
    return tx.inventory.upsert({
      where: {
        locationId_productId_lotNumber: {
          locationId: params.locationId,
          productId: params.productId,
          lotNumber: params.lotNumber,
        },
      },
      create: {
        warehouseId: params.warehouseId,
        locationId: params.locationId,
        productId: params.productId,
        lotNumber: params.lotNumber,
        quantity: params.quantity,
        expiresAt: params.expiresAt ?? null,
      },
      update: { quantity: { increment: params.quantity } },
      select: { id: true, productId: true, quantity: true },
    });
  }

  /**
   * Decremento condicional: `UPDATE ... SET quantity = quantity - n
   * WHERE id = ? AND quantity >= n + reserved`. Si otra transacción consumió el
   * stock en paralelo, count = 0 y se aborta. Devuelve la cantidad restante.
   */
  private async decrementStock(
    tx: Tx,
    inventoryId: string,
    quantity: number,
    reserved: number,
  ): Promise<number> {
    const updated = await tx.inventory.updateMany({
      where: { id: inventoryId, quantity: { gte: quantity + reserved } },
      data: { quantity: { decrement: quantity } },
    });

    if (updated.count === 0) {
      const current = await tx.inventory.findUnique({
        where: { id: inventoryId },
        select: { quantity: true, reserved: true },
      });
      const available = current ? current.quantity - current.reserved : 0;
      throw new BadRequestException(
        `La cantidad solicitada (${quantity}) supera el stock disponible (${available}) en la ubicación origen.`,
      );
    }

    const after = await tx.inventory.findUnique({
      where: { id: inventoryId },
      select: { quantity: true },
    });
    return after?.quantity ?? 0;
  }

  /** Elimina el registro sólo si sigue en cero dentro de la misma transacción. */
  private async purgeIfEmpty(tx: Tx, inventoryId: string) {
    await tx.inventory.deleteMany({
      where: { id: inventoryId, quantity: 0, reserved: 0 },
    });
  }

  /** Valida en una sola consulta que las ubicaciones existan, estén activas y no bloqueadas. */
  private async loadUsableLocations(tx: Tx, locationIds: string[]) {
    const ids = [...new Set(locationIds)];
    const locations = await tx.location.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        code: true,
        warehouseId: true,
        isBlocked: true,
        warehouse: { select: { isActive: true } },
      },
    });

    const map = new Map(locations.map((l) => [l.id, l]));

    for (const id of ids) {
      const loc = map.get(id);
      if (!loc) {
        throw new NotFoundException(`Ubicación "${id}" no encontrada.`);
      }
      if (loc.isBlocked) {
        throw new BadRequestException(
          `La ubicación ${loc.code} está bloqueada.`,
        );
      }
      if (!loc.warehouse.isActive) {
        throw new BadRequestException(
          `La ubicación ${loc.code} pertenece a un depósito inactivo.`,
        );
      }
    }

    return map;
  }

  // ===========================================================================
  // AUXILIARES DE PRESENTACIÓN
  // ===========================================================================

  private toLocationView(loc: LocationRow, usedM3: number) {
    const capacity = Number(loc.capacity);
    const maxCapacityM3 =
      capacity > 0 ? capacity : DEFAULT_LOCATION_CAPACITY_M3;
    const occupancyPercentage =
      maxCapacityM3 > 0 ? Math.round((usedM3 / maxCapacityM3) * 100) : 0;

    let status = 'DISPONIBLE';
    if (occupancyPercentage >= 90) status = 'COMPLETO';
    else if (occupancyPercentage >= 50) status = 'PARCIAL';

    const isRack = !!loc.rack && RACK_LEVELS.includes(loc.rack.toUpperCase());
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
      maxCapacityM3,
      usedCapacityM3: Number(usedM3.toFixed(2)),
      occupancyPercentage,
      status,
      comments: loc.notes || undefined,
    };
  }

  private lotForDisplay(lot: string): string | undefined {
    return lot && lot !== NO_LOT ? lot : undefined;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
