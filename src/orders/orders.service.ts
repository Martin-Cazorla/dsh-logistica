// dsh-logistica/src/orders/orders.service.ts

import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity } from '../audit/audit.actions';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  canViewMoney,
  isSalesModuleEnabled,
  stripMoney,
} from '../common/sales';
import {
  CancelOrderDto,
  CreateOrderDto,
  ListOrdersQueryDto,
} from './dto/create-order.dto';
import { releasePendingReservations } from './services/pick-reservations';

const USER_NAME = { select: { id: true, firstName: true, lastName: true } };

const ORDER_LIST_INCLUDE = {
  customer: { select: { id: true, name: true, cuit: true } },
  deliveryAddress: true,
  sourceWarehouse: { select: { id: true, name: true, code: true } },
  transport: { select: { id: true, name: true } },
  createdBy: USER_NAME,
  pickerAssignments: {
    select: { user: USER_NAME, assignedAt: true },
    orderBy: { assignedAt: 'asc' },
  },
  route: { select: { id: true, code: true, status: true } },
  items: {
    include: {
      product: {
        select: {
          id: true,
          sku: true,
          name: true,
          unitsPerBox: true,
          weightKg: true,
          volumeM3: true,
        },
      },
    },
  },
} satisfies Prisma.OrderInclude;

const CANCELLABLE: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.IN_PICKING,
];

@Injectable()
export class OrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ---------------------------------------------------------------------------
  // ALTA DE PEDIDOS
  // ---------------------------------------------------------------------------

  async create(dto: CreateOrderDto, actor: AuthenticatedUser) {
    const productIds = dto.items.map((i) => i.productId);
    if (new Set(productIds).size !== productIds.length) {
      throw new BadRequestException(
        'El pedido contiene productos repetidos. Agrupe las cantidades en una sola línea.',
      );
    }

    if (
      dto.deliveryDateFrom &&
      dto.deliveryDateTo &&
      new Date(dto.deliveryDateFrom) > new Date(dto.deliveryDateTo)
    ) {
      throw new BadRequestException(
        'La fecha de entrega "desde" no puede ser posterior a "hasta".',
      );
    }

    const [address, warehouse, products, customer] = await Promise.all([
      this.prisma.customerAddress.findFirst({
        where: { id: dto.addressId, customerId: dto.customerId },
        select: { id: true },
      }),
      this.prisma.warehouse.findUnique({
        where: { id: dto.sourceWarehouseId },
        select: { id: true, isActive: true },
      }),
      this.prisma.product.findMany({
        where: { id: { in: productIds } },
        select: {
          id: true,
          unitsPerBox: true,
          weightKg: true,
          volumeM3: true,
          unitPrice: true,
        },
      }),
      this.prisma.customer.findUnique({
        where: { id: dto.customerId },
        select: { id: true, isActive: true },
      }),
    ]);

    if (!customer || !customer.isActive) {
      throw new BadRequestException('El cliente no existe o está inactivo.');
    }
    if (!address) {
      throw new BadRequestException(
        'La dirección de entrega no pertenece al cliente seleccionado.',
      );
    }
    if (!warehouse || !warehouse.isActive) {
      throw new NotFoundException(
        'El depósito de origen no existe o está inactivo.',
      );
    }

    const productMap = new Map(products.map((p) => [p.id, p]));
    const missing = productIds.filter((id) => !productMap.has(id));
    if (missing.length > 0) {
      throw new NotFoundException(
        `Productos no encontrados: ${missing.join(', ')}.`,
      );
    }

    const salesEnabled = isSalesModuleEnabled();
    let totalBultos = 0;
    let totalWeightKg = new Prisma.Decimal(0);
    let totalVolumeM3 = new Prisma.Decimal(0);
    let subtotal = new Prisma.Decimal(0);

    const preparedItems = dto.items.map((item) => {
      const product = productMap.get(item.productId)!;
      const totalUnits = item.bultos * product.unitsPerBox;

      totalBultos += item.bultos;
      // weightKg / volumeM3 del producto son POR BULTO
      totalWeightKg = totalWeightKg.add(
        new Prisma.Decimal(product.weightKg).mul(item.bultos),
      );
      totalVolumeM3 = totalVolumeM3.add(
        new Prisma.Decimal(product.volumeM3).mul(item.bultos),
      );

      if (!salesEnabled) {
        return {
          productId: item.productId,
          bultos: item.bultos,
          totalUnits,
          unitPrice: new Prisma.Decimal(0),
          discountPct: null,
          lineTotal: null,
        };
      }

      const unitPrice = new Prisma.Decimal(item.unitPrice ?? product.unitPrice);
      const discountPct = new Prisma.Decimal(item.discountPct ?? 0);
      const lineTotal = unitPrice
        .mul(totalUnits)
        .mul(new Prisma.Decimal(100).sub(discountPct))
        .div(100)
        .toDecimalPlaces(2);
      subtotal = subtotal.add(lineTotal);

      return {
        productId: item.productId,
        bultos: item.bultos,
        totalUnits,
        unitPrice,
        discountPct,
        lineTotal,
      };
    });

    const taxAmount = salesEnabled
      ? subtotal
          .mul(dto.taxPct ?? 0)
          .div(100)
          .toDecimalPlaces(2)
      : null;

    const orderNumber = dto.orderNumber?.trim() || this.generateOrderNumber();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            orderNumber,
            customerId: dto.customerId,
            addressId: dto.addressId,
            sourceWarehouseId: dto.sourceWarehouseId,
            sellerId: dto.sellerId ?? null,
            transportId: dto.transportId ?? null,
            createdById: actor.id,
            currency: dto.currency,
            paymentTerm: dto.paymentTerm,
            notes: dto.notes?.trim() || null,
            status: OrderStatus.PENDING,
            deliveryDateFrom: dto.deliveryDateFrom
              ? new Date(dto.deliveryDateFrom)
              : null,
            deliveryDateTo: dto.deliveryDateTo
              ? new Date(dto.deliveryDateTo)
              : null,
            totalBultos,
            totalWeightKg,
            totalVolumeM3,
            subtotalAmount: salesEnabled ? subtotal : null,
            discountAmount: null,
            taxAmount,
            totalAmount:
              salesEnabled && taxAmount ? subtotal.add(taxAmount) : 0,
            items: { create: preparedItems },
          },
          include: ORDER_LIST_INCLUDE,
        });

        await this.audit.log(
          {
            actor,
            action: AuditAction.ORDER_CREATED,
            entityType: AuditEntity.ORDER,
            entityId: order.id,
            metadata: {
              orderNumber,
              customerId: dto.customerId,
              items: dto.items.length,
              totalBultos,
            },
          },
          tx,
        );

        return this.present(order, actor);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          `Ya existe un pedido registrado con el número "${orderNumber}".`,
        );
      }
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // CONSULTAS
  // ---------------------------------------------------------------------------

  async findAll(query: ListOrdersQueryDto, actor: AuthenticatedUser) {
    const limit = query.limit ?? 50;
    const page = query.page ?? 1;

    const where: Prisma.OrderWhereInput = {};
    if (query.status) where.status = query.status;
    const term = query.search?.trim();
    if (term) {
      where.OR = [
        { orderNumber: { contains: term, mode: 'insensitive' } },
        { customer: { name: { contains: term, mode: 'insensitive' } } },
        { customer: { cuit: { contains: term } } },
      ];
    }

    const [total, orders] = await Promise.all([
      this.prisma.order.count({ where }),
      this.prisma.order.findMany({
        where,
        include: ORDER_LIST_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      items: orders.map((o) => this.present(o, actor)),
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, actor: AuthenticatedUser) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        ...ORDER_LIST_INCLUDE,
        picker: USER_NAME,
        checkedBy: USER_NAME,
        items: {
          include: {
            product: {
              select: {
                id: true,
                sku: true,
                name: true,
                unitsPerBox: true,
                weightKg: true,
                volumeM3: true,
              },
            },
            picker: USER_NAME,
          },
        },
        routeStops: {
          select: {
            id: true,
            sequence: true,
            status: true,
            expectedBultos: true,
            loadedBultos: true,
            loadedAt: true,
            deliveredBultos: true,
            deliveredAt: true,
            recipientName: true,
            route: { select: { id: true, code: true, scheduledDate: true } },
            loadedBy: USER_NAME,
            deliveredBy: USER_NAME,
          },
          orderBy: { createdAt: 'asc' },
        },
        movements: {
          select: {
            id: true,
            type: true,
            quantity: true,
            lotNumber: true,
            createdAt: true,
            productId: true,
            sourceLocation: { select: { id: true, code: true } },
            user: USER_NAME,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(
        `El pedido con ID "${id}" no fue encontrado.`,
      );
    }

    return this.present(order, actor);
  }

  // ---------------------------------------------------------------------------
  // CANCELACIÓN
  // ---------------------------------------------------------------------------

  /**
   * Sólo se cancelan pedidos sin bultos ya retirados de las ubicaciones
   * (stock intacto). Libera las reservas de las tareas de picking pendientes.
   */
  async cancel(id: string, dto: CancelOrderDto, actor: AuthenticatedUser) {
    await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{ id: string; status: OrderStatus; order_number: string }>
      >`SELECT id, status, order_number FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
      const order = locked[0];
      if (!order) throw new NotFoundException('Pedido no encontrado.');

      if (!CANCELLABLE.includes(order.status)) {
        throw new ConflictException(
          `No se puede cancelar un pedido en estado ${order.status}.`,
        );
      }

      const picked = await tx.orderItem.aggregate({
        where: { orderId: id },
        _sum: { pickedQty: true },
      });
      if ((picked._sum.pickedQty ?? 0) > 0) {
        throw new ConflictException(
          'El pedido ya tiene bultos pickeados. Devuélvalos a su ubicación antes de cancelarlo.',
        );
      }

      await releasePendingReservations(tx, id);

      await tx.order.update({
        where: { id },
        data: { status: OrderStatus.CANCELLED },
      });

      await this.audit.log(
        {
          actor,
          action: AuditAction.ORDER_CANCELLED,
          entityType: AuditEntity.ORDER,
          entityId: id,
          metadata: { orderNumber: order.order_number, reason: dto.reason },
        },
        tx,
      );
    });

    return this.findOne(id, actor);
  }

  // ---------------------------------------------------------------------------

  private present<T extends object>(order: T, actor: AuthenticatedUser): T {
    return canViewMoney(actor.role) ? order : stripMoney(order);
  }

  private generateOrderNumber(): string {
    const now = new Date();
    const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    return `PED-${ymd}-${randomBytes(3).toString('hex').toUpperCase()}`;
  }
}
