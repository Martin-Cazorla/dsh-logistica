// dsh-logistica/src/inventory/services/stock-availability.service.ts

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { fetchAvailableStock } from '../../orders/services/pick-reservations';

export interface AvailabilityItem {
  productId: string;
  sku: string;
  name: string;
  unitsPerBox: number;
  /** Disponible por depósito (warehouseId -> bultos). */
  byWarehouse: Record<string, number>;
  total: number;
}

/**
 * Consulta de stock DISPONIBLE por producto y depósito, pensada para el
 * Vendedor: no expone ubicaciones, racks, pasillos ni lotes.
 * Disponible = físico − reservado por pedidos en curso (fetchAvailableStock,
 * la misma regla que usa la reserva del picking).
 */
@Injectable()
export class StockAvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  async search(params: { search?: string; limit?: number }) {
    const take = Math.min(Math.max(params.limit ?? 40, 1), 100);
    const term = params.search?.trim();

    const warehouses = await this.prisma.warehouse.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const warehouseIds = warehouses.map((w) => w.id);

    const where: Prisma.ProductWhereInput = term
      ? {
          OR: [
            { sku: { contains: term, mode: 'insensitive' } },
            { name: { contains: term, mode: 'insensitive' } },
            { barcode: { contains: term, mode: 'insensitive' } },
          ],
        }
      : // Sin búsqueda: sólo productos con stock en algún depósito activo
        {
          inventories: {
            some: { quantity: { gt: 0 }, warehouseId: { in: warehouseIds } },
          },
        };

    const products = await this.prisma.product.findMany({
      where,
      select: { id: true, sku: true, name: true, unitsPerBox: true },
      orderBy: { sku: 'asc' },
      take,
    });

    const rows = await fetchAvailableStock(this.prisma, {
      productIds: products.map((p) => p.id),
      warehouseIds,
    });

    const items: AvailabilityItem[] = products.map((p) => {
      const byWarehouse: Record<string, number> = {};
      for (const w of warehouses) byWarehouse[w.id] = 0;
      for (const r of rows) {
        if (r.productId === p.id) byWarehouse[r.warehouseId] = r.available;
      }
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        unitsPerBox: p.unitsPerBox,
        byWarehouse,
        total: Object.values(byWarehouse).reduce((a, b) => a + b, 0),
      };
    });

    return { warehouses, items, generatedAt: new Date().toISOString() };
  }
}
