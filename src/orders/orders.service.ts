import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto, CreateOrderItemDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createOrderDto: CreateOrderDto) {
    const {
      orderNumber,
      customerId,
      addressId,
      sourceWarehouseId,
      sellerId,
      transportId,
      currency,
      paymentTerm,
      deliveryDateFrom,
      deliveryDateTo,
      items,
    } = createOrderDto;

    const existingOrder = await this.prisma.order.findFirst({
      where: { orderNumber },
    });

    if (existingOrder) {
      throw new ConflictException(
        `Ya existe un pedido registrado con el número "${orderNumber}".`,
      );
    }

    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      include: { addresses: true },
    });

    if (!customer) {
      throw new NotFoundException(
        `El cliente con ID "${customerId}" no fue encontrado.`,
      );
    }

    const selectedAddress = customer.addresses.find((a) => a.id === addressId);
    if (!selectedAddress) {
      throw new BadRequestException(
        `La dirección asignada no pertenece al cliente seleccionado.`,
      );
    }

    const warehouse = await this.prisma.warehouse.findUnique({
      where: { id: sourceWarehouseId },
    });

    if (!warehouse) {
      throw new NotFoundException(
        `El depósito de origen con ID "${sourceWarehouseId}" no fue encontrado.`,
      );
    }

    let totalBultos = 0;
    let totalWeightKg = 0;

    const preparedItems = await Promise.all(
      items.map(async (item: CreateOrderItemDto) => {
        const product = await this.prisma.product.findUnique({
          where: { id: item.productId },
        });

        if (!product) {
          throw new NotFoundException(
            `El producto con ID "${item.productId}" no fue encontrado.`,
          );
        }

        const totalUnits = item.bultos * product.unitsPerBox;
        const itemWeight = Number(product.weightKg) * totalUnits;

        totalBultos += item.bultos;
        totalWeightKg += itemWeight;

        return {
          productId: item.productId,
          bultos: item.bultos,
          totalUnits: totalUnits,
          unitPrice: item.unitPrice ?? product.unitPrice,
        };
      }),
    );

    return this.prisma.order.create({
      data: {
        orderNumber,
        customerId,
        addressId,
        sourceWarehouseId,
        sellerId: sellerId ?? null,
        transportId: transportId ?? null,
        currency,
        paymentTerm,
        status: 'PENDING',
        deliveryDateFrom: deliveryDateFrom ? new Date(deliveryDateFrom) : null,
        deliveryDateTo: deliveryDateTo ? new Date(deliveryDateTo) : null,
        totalBultos,
        totalWeightKg,
        items: {
          create: preparedItems,
        },
      },
      include: {
        customer: {
          include: {
            addresses: true,
          },
        },
        deliveryAddress: true,
        sourceWarehouse: true,
        transport: true,
        items: {
          include: {
            product: true,
          },
        },
      },
    });
  }

  async findAll() {
    return this.prisma.order.findMany({
      include: {
        customer: true,
        deliveryAddress: true,
        sourceWarehouse: true,
        transport: true,
        items: {
          include: {
            product: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      include: {
        customer: true,
        deliveryAddress: true,
        sourceWarehouse: true,
        transport: true,
        items: {
          include: {
            product: {
              include: {
                inventories: {
                  include: {
                    location: true,
                  },
                },
              },
            },
            picker: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
      },
    });

    if (!order) {
      throw new NotFoundException(
        `El pedido con ID "${id}" no fue encontrado.`,
      );
    }

    return order;
  }
}
