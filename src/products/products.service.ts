// dsh-logistica/src/products/products.service.ts

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

interface AvailabilityRow {
  product_id: string;
  available: number;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Catálogo para el alta de pedidos: SKU, datos logísticos y stock DISPONIBLE
   * (cantidad - reservado) en el depósito indicado, agregado en PostgreSQL.
   * Los precios se exponen sólo si `includePrices` (módulo de ventas + permiso).
   */
  async search(params: {
    search?: string;
    warehouseId?: string;
    limit?: number;
    includePrices: boolean;
  }) {
    const take = Math.min(Math.max(params.limit ?? 30, 1), 100);
    const term = params.search?.trim();

    const where: Prisma.ProductWhereInput = term
      ? {
          OR: [
            { sku: { contains: term, mode: 'insensitive' } },
            { name: { contains: term, mode: 'insensitive' } },
            { barcode: { contains: term, mode: 'insensitive' } },
          ],
        }
      : {};

    const products = await this.prisma.product.findMany({
      where,
      select: {
        id: true,
        sku: true,
        name: true,
        barcode: true,
        unitsPerBox: true,
        weightKg: true,
        volumeM3: true,
        unitPrice: true,
      },
      orderBy: { sku: 'asc' },
      take,
    });

    const ids = products.map((p) => p.id);
    const availability =
      ids.length === 0
        ? []
        : await this.prisma.$queryRaw<AvailabilityRow[]>`
            SELECT i.product_id, SUM(i.quantity - i.reserved)::int AS available
            FROM inventories i
            JOIN locations l ON l.id = i.location_id
            WHERE i.product_id = ANY(${ids}::uuid[])
              AND l.is_blocked = false
              ${params.warehouseId ? Prisma.sql`AND i.warehouse_id = ${params.warehouseId}::uuid` : Prisma.empty}
            GROUP BY i.product_id
          `;

    const availableMap = new Map(
      availability.map((a) => [a.product_id, Number(a.available)]),
    );

    return products.map((p) => ({
      id: p.id,
      sku: p.sku,
      name: p.name,
      barcode: p.barcode,
      unitsPerBox: p.unitsPerBox,
      weightKg: Number(p.weightKg),
      volumeM3: Number(p.volumeM3),
      availableBultos: availableMap.get(p.id) ?? 0,
      ...(params.includePrices ? { unitPrice: Number(p.unitPrice) } : {}),
    }));
  }
}
