import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class OrderCheckingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Puntos de Control 1: Audita y confirma que los bultos armados coinciden con lo pedido
   */
  async verifyOrderItems(orderId: string, auditorId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });

    if (!order) {
      throw new NotFoundException(
        `El pedido con ID "${orderId}" no fue encontrado.`,
      );
    }

    if (order.status !== 'PICKED') {
      throw new ConflictException(
        `El pedido debe estar en estado PICKED para realizar el control de armado. Estado actual: "${order.status}".`,
      );
    }

    // Validar que cada ítem tenga sus bultos completos pickeados
    const incompleteItems = order.items.filter(
      (item) => item.pickedQty < item.bultos,
    );

    if (incompleteItems.length > 0) {
      throw new BadRequestException(
        `El pedido presenta inconsistencias en el armado. Hay bultos faltantes en ${incompleteItems.length} producto(s).`,
      );
    }

    // Cambiamos el estado a CHECKED (Listo para ser incluido en Hoja de Ruta / Carga)
    return this.prisma.order.update({
      where: { id: orderId },
      data: {
        status: 'CHECKED',
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
  }
}
