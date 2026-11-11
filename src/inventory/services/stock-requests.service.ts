// dsh-logistica/src/inventory/services/stock-requests.service.ts

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  StockRequestStatus,
  StockRequestType,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AuditAction, AuditEntity } from '../../audit/audit.actions';
import { AuthenticatedUser } from '../../auth/interfaces/authenticated-user.interface';
import { Permission, hasPermission } from '../../auth/permissions';
import { InventoryGateway } from '../inventory.gateway';
import {
  CreateStockRequestDto,
  ListStockRequestsQueryDto,
  ReviewStockRequestDto,
} from '../dto/stock-request.dto';

type Tx = Prisma.TransactionClient;

const USER_NAME = { select: { id: true, firstName: true, lastName: true } };

const REQUEST_INCLUDE = {
  product: { select: { sku: true, name: true } },
  location: { select: { code: true } },
  warehouse: { select: { name: true } },
  requestedBy: USER_NAME,
  reviewedBy: USER_NAME,
} satisfies Prisma.StockAdjustmentRequestInclude;

type RequestRow = Prisma.StockAdjustmentRequestGetPayload<{
  include: typeof REQUEST_INCLUDE;
}>;

function name(u: { firstName: string; lastName: string } | null) {
  return u ? `${u.firstName} ${u.lastName}`.trim() : null;
}

function toView(r: RequestRow) {
  return {
    id: r.id,
    type: r.type,
    status: r.status,
    inventoryId: r.inventoryId,
    productSku: r.product.sku,
    productName: r.product.name,
    locationCode: r.location.code,
    warehouseName: r.warehouse.name,
    lotNumber: r.lotNumber,
    systemQty: r.systemQty,
    countedQty: r.countedQty,
    quantityDelta: r.quantityDelta,
    reason: r.reason,
    requestedBy: name(r.requestedBy),
    requestedById: r.requestedById,
    reviewedBy: name(r.reviewedBy),
    reviewedAt: r.reviewedAt,
    reviewNotes: r.reviewNotes,
    createdAt: r.createdAt,
  };
}

/**
 * Conteos y ajustes con aprobación previa (doble firma).
 * - El operario registra el conteo / descuento: el stock no cambia.
 * - Un Gestor o Administrador distinto del solicitante (salvo ADMIN) aprueba:
 *   recién ahí se modifica Inventory y se genera el StockMovement ADJUSTMENT.
 * - Si el stock del sistema cambió entre el conteo y la aprobación, la
 *   aprobación se rechaza (el conteo quedó desactualizado).
 */
@Injectable()
export class StockRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly gateway: InventoryGateway,
  ) {}

  async create(dto: CreateStockRequestDto, actor: AuthenticatedUser) {
    const inv = await this.prisma.inventory.findUnique({
      where: { id: dto.inventoryId },
      select: {
        id: true,
        warehouseId: true,
        locationId: true,
        productId: true,
        lotNumber: true,
        quantity: true,
      },
    });
    if (!inv)
      throw new NotFoundException('Registro de inventario no encontrado.');

    let countedQty: number;
    if (dto.type === StockRequestType.COUNT) {
      countedQty = dto.countedQty!;
    } else {
      if (dto.quantity! > inv.quantity) {
        throw new BadRequestException(
          `No puede solicitar descontar ${dto.quantity} bultos: hay ${inv.quantity}.`,
        );
      }
      countedQty = inv.quantity - dto.quantity!;
    }
    const delta = countedQty - inv.quantity;

    const request = await this.prisma.$transaction(async (tx) => {
      const created = await tx.stockAdjustmentRequest.create({
        data: {
          inventoryId: inv.id,
          warehouseId: inv.warehouseId,
          locationId: inv.locationId,
          productId: inv.productId,
          lotNumber: inv.lotNumber,
          type: dto.type,
          systemQty: inv.quantity,
          countedQty,
          quantityDelta: delta,
          reason: dto.reason.trim(),
          // Un conteo sin diferencias no requiere aprobación
          status:
            delta === 0
              ? StockRequestStatus.APPROVED
              : StockRequestStatus.PENDING,
          requestedById: actor.id,
          ...(delta === 0
            ? {
                reviewedById: actor.id,
                reviewedAt: new Date(),
                reviewNotes: 'Sin diferencias',
              }
            : {}),
        },
        include: REQUEST_INCLUDE,
      });

      await this.audit.log(
        {
          actor,
          action: AuditAction.STOCK_REQUEST_CREATED,
          entityType: AuditEntity.STOCK_REQUEST,
          entityId: created.id,
          metadata: {
            inventoryId: inv.id,
            type: dto.type,
            systemQty: inv.quantity,
            countedQty,
            delta,
            reason: dto.reason.trim(),
          },
        },
        tx,
      );

      return created;
    });

    return toView(request);
  }

  async list(query: ListStockRequestsQueryDto, actor: AuthenticatedUser) {
    const canReview = hasPermission(actor.role, Permission.INVENTORY_MODIFY);
    const rows = await this.prisma.stockAdjustmentRequest.findMany({
      where: {
        ...(query.status ? { status: query.status } : {}),
        // Quien no revisa sólo ve sus propias solicitudes
        ...(canReview ? {} : { requestedById: actor.id }),
      },
      include: REQUEST_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    return rows.map(toView);
  }

  async approve(
    id: string,
    dto: ReviewStockRequestDto,
    actor: AuthenticatedUser,
  ) {
    let warehouseId = '';

    const result = await this.prisma.$transaction(async (tx) => {
      const request = await this.lockPending(tx, id, actor);
      warehouseId = request.warehouse_id;

      const delta = request.quantity_delta;
      const now = new Date();

      // Estado actual del stock (bloqueado)
      const invRows = request.inventory_id
        ? await tx.$queryRaw<
            Array<{ id: string; quantity: number; reserved: number }>
          >`
            SELECT id, quantity, reserved FROM inventories
            WHERE id = ${request.inventory_id}::uuid
            FOR UPDATE
          `
        : [];
      const inv = invRows[0];
      const currentQty = inv ? Number(inv.quantity) : 0;

      if (currentQty !== request.system_qty) {
        throw new ConflictException(
          `El stock cambió desde el conteo (antes ${request.system_qty}, ahora ${currentQty}). Rechace la solicitud y vuelva a contar.`,
        );
      }

      if (delta < 0) {
        const reserved = inv ? Number(inv.reserved) : 0;
        if (currentQty + delta < reserved) {
          throw new ConflictException(
            `No se puede descontar: ${reserved} bultos están reservados para picking.`,
          );
        }
        await tx.inventory.update({
          where: { id: inv!.id },
          data: { quantity: { decrement: -delta } },
        });
      } else if (delta > 0) {
        await tx.inventory.upsert({
          where: {
            locationId_productId_lotNumber: {
              locationId: request.location_id,
              productId: request.product_id,
              lotNumber: request.lot_number,
            },
          },
          create: {
            warehouseId: request.warehouse_id,
            locationId: request.location_id,
            productId: request.product_id,
            lotNumber: request.lot_number,
            quantity: delta,
          },
          update: { quantity: { increment: delta } },
        });
      }

      if (delta !== 0) {
        await tx.stockMovement.create({
          data: {
            warehouseId: request.warehouse_id,
            productId: request.product_id,
            sourceLocationId: delta < 0 ? request.location_id : null,
            targetLocationId: delta > 0 ? request.location_id : null,
            userId: actor.id,
            type: 'ADJUSTMENT',
            quantity: Math.abs(delta),
            lotNumber: request.lot_number,
            referenceCode: `SOLICITUD_${request.type}`,
            notes: `${request.reason} | Aprobado por ${actor.fullName}`.slice(
              0,
              255,
            ),
          },
        });
      }

      if (inv) {
        await tx.inventory.deleteMany({
          where: { id: inv.id, quantity: 0, reserved: 0 },
        });
      }

      const updated = await tx.stockAdjustmentRequest.update({
        where: { id },
        data: {
          status: StockRequestStatus.APPROVED,
          reviewedById: actor.id,
          reviewedAt: now,
          reviewNotes: dto.notes?.trim() || null,
        },
        include: REQUEST_INCLUDE,
      });

      await this.audit.log(
        {
          actor,
          action: AuditAction.STOCK_REQUEST_APPROVED,
          entityType: AuditEntity.STOCK_REQUEST,
          entityId: id,
          metadata: {
            inventoryId: request.inventory_id,
            delta,
            requestedById: request.requested_by_id,
            notes: dto.notes ?? null,
          },
        },
        tx,
      );

      return updated;
    });

    this.gateway.emitOccupancyChanged([warehouseId]);
    return toView(result);
  }

  async reject(
    id: string,
    dto: ReviewStockRequestDto,
    actor: AuthenticatedUser,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const request = await this.lockPending(tx, id, actor);

      const updated = await tx.stockAdjustmentRequest.update({
        where: { id },
        data: {
          status: StockRequestStatus.REJECTED,
          reviewedById: actor.id,
          reviewedAt: new Date(),
          reviewNotes: dto.notes?.trim() || null,
        },
        include: REQUEST_INCLUDE,
      });

      await this.audit.log(
        {
          actor,
          action: AuditAction.STOCK_REQUEST_REJECTED,
          entityType: AuditEntity.STOCK_REQUEST,
          entityId: id,
          metadata: {
            requestedById: request.requested_by_id,
            notes: dto.notes ?? null,
          },
        },
        tx,
      );

      return updated;
    });

    return toView(result);
  }

  private async lockPending(tx: Tx, id: string, actor: AuthenticatedUser) {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        status: StockRequestStatus;
        type: StockRequestType;
        inventory_id: string | null;
        warehouse_id: string;
        location_id: string;
        product_id: string;
        lot_number: string;
        system_qty: number;
        quantity_delta: number;
        reason: string;
        requested_by_id: string;
      }>
    >`
      SELECT id, status, type, inventory_id, warehouse_id, location_id, product_id,
             lot_number, system_qty, quantity_delta, reason, requested_by_id
      FROM stock_adjustment_requests
      WHERE id = ${id}::uuid
      FOR UPDATE
    `;
    const request = rows[0];
    if (!request) throw new NotFoundException('Solicitud no encontrada.');
    if (request.status !== StockRequestStatus.PENDING) {
      throw new ConflictException(`La solicitud ya fue ${request.status}.`);
    }
    if (request.requested_by_id === actor.id && actor.role !== UserRole.ADMIN) {
      throw new ForbiddenException(
        'Segregación de funciones: no puede aprobar su propia solicitud.',
      );
    }
    return request;
  }
}
