import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TransferStockDto } from './dto/transfer-stock.dto';
import { MovementType } from '@prisma/client';

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Transferencia atómica de stock entre ubicaciones/depósitos.
   */
  async transferStock(dto: TransferStockDto) {
    const {
      productId,
      originWarehouseId,
      originLocationId,
      destinationWarehouseId,
      destinationLocationId,
      quantity,
      notes,
      userId,
    } = dto;

    return await this.prisma.$transaction(async (tx) => {
      // 1. Buscar el stock disponible en la ubicación de origen
      const originInventory = await tx.inventory.findFirst({
        where: {
          productId,
          warehouseId: originWarehouseId,
          locationId: originLocationId,
        },
      });

      if (
        !originInventory ||
        originInventory.quantity - originInventory.reserved < quantity
      ) {
        throw new BadRequestException(
          'Stock insuficiente en la ubicación de origen.',
        );
      }

      // 2. Descontar cantidad en origen
      await tx.inventory.update({
        where: { id: originInventory.id },
        data: {
          quantity: { decrement: quantity },
        },
      });

      // 3. Buscar o crear el registro de stock en destino
      const destInventory = await tx.inventory.findFirst({
        where: {
          productId,
          warehouseId: destinationWarehouseId,
          locationId: destinationLocationId,
        },
      });

      if (destInventory) {
        await tx.inventory.update({
          where: { id: destInventory.id },
          data: {
            quantity: { increment: quantity },
          },
        });
      } else {
        await tx.inventory.create({
          data: {
            productId,
            warehouseId: destinationWarehouseId,
            locationId: destinationLocationId,
            quantity: quantity,
            reserved: 0,
          },
        });
      }

      // 4. Registrar auditoría de movimiento (StockMovement)
      const stockMovement = await tx.stockMovement.create({
        data: {
          productId,
          warehouseId: originWarehouseId,
          locationId: originLocationId,
          quantity,
          type: MovementType.TRANSFER_OUT,
          userId,
          notes:
            notes ||
            `Transferencia hacia depósito/ubicación ${destinationLocationId}`,
        },
      });

      return {
        message: 'Transferencia realizada con éxito',
        movementId: stockMovement.id,
      };
    });
  }

  /**
   * Obtener inventario consolidado por depósito
   */
  async getInventoryByWarehouse(warehouseId: string) {
    return await this.prisma.inventory.findMany({
      where: { warehouseId },
      include: {
        product: true,
        location: true,
        warehouse: true,
      },
    });
  }
}
