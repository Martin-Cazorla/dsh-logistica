// dsh-logistica/src/sales-zones/sales-zones.service.ts

import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditEntity } from '../audit/audit.actions';
import { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import {
  BUENOS_AIRES_KEY,
  CABA_KEY,
  normalizeGeo,
  provinceKey,
  zoneLookupKey,
  zoneLookupKeySql,
} from './geo-normalize';
import { assignAddressZones, listUnassignedLocalities } from './sales-zones.seed';
import { AssignLocalityDto } from './dto/assign-locality.dto';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class SalesZonesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Zona de una dirección según provincia + localidad normalizadas.
   * Devuelve null si no hay coincidencia ("Sin zona asignada").
   */
  async resolveZoneId(
    province: string,
    city: string,
    db: Db = this.prisma,
  ): Promise<string | null> {
    const key = zoneLookupKey(province, city);
    const match = await db.zoneLocality.findUnique({
      where: { province_locality: key },
      select: { zoneId: true, zone: { select: { isActive: true } } },
    });
    return match?.zone.isActive ? match.zoneId : null;
  }

  /** Zonas con sus localidades y la cantidad de direcciones activas de cada una. */
  async findAll() {
    const zones = await this.prisma.salesZone.findMany({
      include: {
        localities: { orderBy: { locality: 'asc' } },
        _count: { select: { addresses: { where: { isActive: true } } } },
      },
      orderBy: [{ province: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });

    // Direcciones activas por (provincia, localidad) normalizadas, en la base.
    const key = zoneLookupKeySql(Prisma.sql`a.province`, Prisma.sql`a.city`);
    const counts = await this.prisma.$queryRaw<
      Array<{ province: string; locality: string; n: bigint }>
    >`SELECT ${key.province} AS province, ${key.locality} AS locality, COUNT(*) AS n
      FROM customer_addresses a WHERE a.is_active GROUP BY 1, 2`;
    const byKey = new Map(
      counts.map((c) => [`${c.province}|${c.locality}`, Number(c.n)]),
    );

    return zones.map((z) => ({
      id: z.id,
      name: z.name,
      province: z.province,
      sortOrder: z.sortOrder,
      isActive: z.isActive,
      addressCount: z._count.addresses,
      localities: z.localities.map((l) => ({
        id: l.id,
        province: l.province,
        locality: l.locality,
        label: l.label ?? l.locality,
        addressCount: byKey.get(`${l.province}|${l.locality}`) ?? 0,
      })),
    }));
  }

  unassigned() {
    return listUnassignedLocalities(this.prisma);
  }

  /**
   * Asigna una localidad a una zona (crea la regla o la mueve de zona) y
   * recalcula en la base la zona de todas las direcciones que coinciden.
   */
  async assignLocality(dto: AssignLocalityDto, actor: AuthenticatedUser) {
    const zone = await this.prisma.salesZone.findUnique({
      where: { id: dto.zoneId },
    });
    if (!zone) throw new NotFoundException('La zona no existe.');

    const key = zoneLookupKey(dto.province, dto.locality);
    if (!key.province || !key.locality) {
      throw new BadRequestException('Provincia y localidad son obligatorias.');
    }
    // La localidad debe ser de la misma provincia que la zona (CABA cuenta
    // como parte de Buenos Aires para el análisis comercial).
    const zoneProvince = provinceKey(zone.province);
    const sameProvince =
      key.province === zoneProvince ||
      (zoneProvince === BUENOS_AIRES_KEY && key.province === CABA_KEY);
    if (!sameProvince) {
      throw new BadRequestException(
        `La localidad pertenece a otra provincia que la zona "${zone.name}" (${zone.province}).`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const before = await tx.zoneLocality.findUnique({
        where: { province_locality: key },
      });
      const rule = await tx.zoneLocality.upsert({
        where: { province_locality: key },
        update: { zoneId: zone.id, label: dto.label?.trim() || before?.label },
        create: {
          ...key,
          zoneId: zone.id,
          label: dto.label?.trim() || dto.locality.trim(),
        },
      });
      const updated = await this.reassign(tx, key);

      await this.audit.log(
        {
          actor,
          action: AuditAction.ZONE_LOCALITY_ASSIGNED,
          entityType: AuditEntity.SALES_ZONE,
          entityId: zone.id,
          metadata: {
            province: key.province,
            locality: key.locality,
            fromZoneId: before?.zoneId ?? null,
            toZoneId: zone.id,
            addressesUpdated: updated,
          },
        },
        tx,
      );
      return { ...rule, addressesUpdated: updated };
    });
  }

  /** Quita una localidad de su zona: sus direcciones quedan "Sin zona asignada". */
  async removeLocality(id: string, actor: AuthenticatedUser) {
    const rule = await this.prisma.zoneLocality.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('La localidad no existe.');

    return this.prisma.$transaction(async (tx) => {
      await tx.zoneLocality.delete({ where: { id } });
      const key = { province: rule.province, locality: rule.locality };
      const updated = await this.reassign(tx, key);
      await this.audit.log(
        {
          actor,
          action: AuditAction.ZONE_LOCALITY_REMOVED,
          entityType: AuditEntity.SALES_ZONE,
          entityId: rule.zoneId,
          metadata: { ...key, addressesUpdated: updated },
        },
        tx,
      );
      return { removed: id, addressesUpdated: updated };
    });
  }

  /** Recalcula la zona de las direcciones que coinciden con una clave. */
  private reassign(
    tx: Prisma.TransactionClient,
    key: { province: string; locality: string },
  ) {
    const k = zoneLookupKeySql(Prisma.sql`a.province`, Prisma.sql`a.city`);
    return assignAddressZones(
      tx,
      Prisma.sql`${k.province} = ${normalizeGeo(key.province)} AND ${k.locality} = ${normalizeGeo(key.locality)}`,
    );
  }
}
