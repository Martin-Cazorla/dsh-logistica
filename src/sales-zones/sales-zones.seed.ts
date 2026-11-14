// dsh-logistica/src/sales-zones/sales-zones.seed.ts

import { Prisma, PrismaClient } from '@prisma/client';
import { SALES_ZONES_SEED } from './sales-zones.seed-data';
import { zoneLookupKey, zoneLookupKeySql } from './geo-normalize';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * Carga las zonas iniciales. Idempotente: si una localidad ya existe (por
 * ejemplo porque se la movió de zona desde la pantalla de administración),
 * NO se pisa su zona.
 */
export async function seedSalesZones(db: Db) {
  let created = 0;
  for (const z of SALES_ZONES_SEED) {
    const zone = await db.salesZone.upsert({
      where: { province_name: { province: z.province, name: z.name } },
      update: { sortOrder: z.sortOrder },
      create: { name: z.name, province: z.province, sortOrder: z.sortOrder },
    });

    const seen = new Set<string>();
    const rows: Prisma.ZoneLocalityCreateManyInput[] = [];
    for (const label of z.localities) {
      const key = zoneLookupKey(z.localityProvince, label);
      const id = `${key.province}|${key.locality}`;
      if (seen.has(id)) continue;
      seen.add(id);
      rows.push({ zoneId: zone.id, province: key.province, locality: key.locality, label });
    }
    const res = await db.zoneLocality.createMany({ data: rows, skipDuplicates: true });
    created += res.count;
  }
  return { zones: SALES_ZONES_SEED.length, localitiesCreated: created };
}

/**
 * Recalcula zone_id de las direcciones buscando provincia + localidad
 * normalizadas en zone_localities (sólo zonas activas). Todo en la base, en
 * una única sentencia. `where` permite acotar a un subconjunto.
 */
export async function assignAddressZones(
  db: Db,
  where: Prisma.Sql = Prisma.sql`TRUE`,
): Promise<number> {
  const key = zoneLookupKeySql(Prisma.sql`a.province`, Prisma.sql`a.city`);
  return db.$executeRaw`
    UPDATE customer_addresses a
    SET zone_id = (
      SELECT zl.zone_id
      FROM zone_localities zl
      JOIN sales_zones z ON z.id = zl.zone_id AND z.is_active
      WHERE zl.province = ${key.province} AND zl.locality = ${key.locality}
    )
    WHERE ${where}`;
}

/** Combinaciones provincia/localidad de direcciones activas sin zona. */
export async function listUnassignedLocalities(db: Db) {
  const key = zoneLookupKeySql(Prisma.sql`a.province`, Prisma.sql`a.city`);
  const rows = await db.$queryRaw<
    Array<{ province: string; locality: string; province_label: string; locality_label: string; addresses: bigint; customers: bigint }>
  >`
    SELECT ${key.province} AS province,
           ${key.locality} AS locality,
           mode() WITHIN GROUP (ORDER BY a.province) AS province_label,
           mode() WITHIN GROUP (ORDER BY a.city) AS locality_label,
           COUNT(*) AS addresses,
           COUNT(DISTINCT a.customer_id) AS customers
    FROM customer_addresses a
    WHERE a.is_active AND a.zone_id IS NULL
    GROUP BY 1, 2
    ORDER BY 1, 2`;
  return rows.map((r) => ({
    province: r.province,
    locality: r.locality,
    provinceLabel: r.province_label,
    localityLabel: r.locality_label,
    addresses: Number(r.addresses),
    customers: Number(r.customers),
  }));
}
