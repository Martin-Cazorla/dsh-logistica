import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ProcessPickingDto, PickItemDto } from '../dto/picking-order.dto';

@Injectable()
export class PickingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Asigna un pedido a un Picker y cambia su estado a IN_PICKING
   */
  async assignAndStartPicking(orderId: string, pickerId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(
        `El pedido con ID "${orderId}" no fue encontrado.`,
      );
    }

    if (order.status !== 'PENDING') {
      throw new ConflictException(
        `El pedido no está en estado PENDING. Estado actual: "${order.status}".`,
      );
    }

    const picker = await this.prisma.user.findUnique({
      where: { id: pickerId },
    });

    if (!picker || !picker.isActive) {
      throw new BadRequestException(
        `El picker asignado no existe o no está activo.`,
      );
    }

    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        pickerId,
        status: 'IN_PICKING',
      },
      include: {
        customer: true,
        picker: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
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
          },
        },
      },
    });
  }

  /**
   * Procesa la confirmación del picking descontando stock e inventario en una transacción ACID
   */
  async confirmPicking(orderId: string, processPickingDto: ProcessPickingDto) {
    const { pickedItems } = processPickingDto;

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException(
        `El pedido con ID "${orderId}" no fue encontrado.`,
      );
    }

    if (order.status !== 'IN_PICKING') {
      throw new ConflictException(
        `El pedido debe estar en estado IN_PICKING para ser confirmado. Estado actual: "${order.status}".`,
      );
    }

    // Ejecutamos la reducción de stock físico en una transacción atómica atómica ACID
    return this.prisma.$transaction(async (tx) => {
      for (const item of pickedItems) {
        const inventory = await tx.inventory.findFirst({
          where: {
            warehouseId: order.sourceWarehouseId,
            locationId: item.locationId,
            productId: item.productId,
          },
        });

        if (!inventory || inventory.quantity < item.bultos) {
          throw new BadRequestException(
            `Stock insuficiente en la ubicación seleccionada para el producto ID "${item.productId}". Disponible: ${inventory?.quantity || 0}, Requerido: ${item.bultos}`,
          );
        }

        // Descontamos el stock físico
        await tx.inventory.update({
          where: { id: inventory.id },
          data: {
            quantity: { decrement: item.bultos },
          },
        });

        // Actualizamos la cantidad pickeada en la orden
        const orderItem = order.items.find(
          (i) => i.productId === item.productId,
        );
        if (orderItem) {
          await tx.orderItem.update({
            where: { id: orderItem.id },
            data: {
              pickedQty: { increment: item.bultos },
            },
          });
        }
      }

      // Actualizamos estado del pedido a PICKED
      return tx.order.update({
        where: { id: orderId },
        data: {
          status: 'PICKED',
        },
        include: {
          customer: true,
          items: {
            include: {
              product: true,
            },
          },
        },
      });
    });
  }

  /**
   * Obtiene la lista de pedidos asignados al picker autenticado actual
   */
  async getMyPendingPickings(pickerId: string) {
    return this.prisma.order.findMany({
      where: {
        pickerId,
        status: 'IN_PICKING',
      },
      include: {
        customer: {
          include: {
            addresses: true,
          },
        },
        deliveryAddress: true,
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
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
