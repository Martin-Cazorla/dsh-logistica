// dsh-logistica/src/analytics/analytics.service.ts

import { BadRequestException, Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { canViewMoney } from '../common/sales';
import {
  BUENOS_AIRES_KEY,
  CABA_KEY,
  localityKeySql,
  normalizeGeo,
  provinceKey,
  provinceKeySql,
} from '../sales-zones/geo-normalize';
import {
  AnalyticsFiltersDto,
  SalesByZoneQueryDto,
  TopZonesQueryDto,
} from './dto/sales-by-zone-query.dto';

const TZ = 'America/Argentina/Buenos_Aires';
const TZ_OFFSET = '-03:00'; // Argentina no usa horario de verano
const DAY_MS = 86_400_000;
const DEFAULT_DAYS = 90;
const MAX_DAYS = 731;
const NO_ZONE = 'none';
const NO_ZONE_LABEL = 'Sin zona asignada';
const NO_SELLER_LABEL = 'Sin vendedor asignado';

const DEFAULT_STATUSES = Object.values(OrderStatus).filter(
  (s) => s !== OrderStatus.CANCELLED,
);

export type Level = 'province' | 'zone' | 'locality';

export interface Metrics {
  orders: number;
  customers: number;
  bultos: number;
  weightKg: number;
  volumeM3: number;
  amount?: number;
}

type AdditiveKey = 'orders' | 'bultos' | 'weightKg' | 'volumeM3' | 'amount';

interface Period {
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  days: number;
  start: Date;
  end: Date;
  prevStart: Date;
}

interface AggRow {
  key: string | null;
  label: string | null;
  sort: number | null;
  orders: bigint;
  customers: bigint;
  bultos: unknown;
  kg: unknown;
  m3: unknown;
  amount?: unknown;
  p_orders: bigint;
  p_customers: bigint;
  p_bultos: unknown;
  p_kg: unknown;
  p_m3: unknown;
  p_amount?: unknown;
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

/** Fecha YYYY-MM-DD de hoy en Argentina. */
function todayAr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date());
}
const startOfDayAr = (d: string) => new Date(`${d}T00:00:00${TZ_OFFSET}`);
const isoDateAr = (d: Date) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
/** Parámetro timestamp (las columnas son timestamp sin zona, en UTC). */
const ts = (d: Date) => Prisma.sql`${d.toISOString()}::timestamp`;

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------------------
  // Período y filtros
  // ---------------------------------------------------------------------------

  private period(from?: string, to?: string, defaultDays = DEFAULT_DAYS): Period {
    const toStr = to ?? todayAr();
    const end = new Date(startOfDayAr(toStr).getTime() + DAY_MS);
    const start = from
      ? startOfDayAr(from)
      : new Date(end.getTime() - defaultDays * DAY_MS);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Rango de fechas inválido.');
    }
    if (start >= end) {
      throw new BadRequestException('La fecha "desde" no puede ser posterior a "hasta".');
    }
    const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
    if (days > MAX_DAYS) {
      throw new BadRequestException(`El rango no puede superar ${MAX_DAYS} días.`);
    }
    const prevStart = new Date(start.getTime() - days * DAY_MS);
    return {
      from: isoDateAr(start),
      to: toStr,
      previousFrom: isoDateAr(prevStart),
      previousTo: isoDateAr(new Date(start.getTime() - DAY_MS)),
      days,
      start,
      end,
      prevStart,
    };
  }

  /**
   * Pedidos del período actual + el anterior de igual duración, con las
   * claves geográficas ya calculadas. Todo se agrega luego en la base.
   */
  private baseCte(f: AnalyticsFiltersDto, p: Period, withAmount: boolean) {
    const statuses = f.statuses?.length ? f.statuses : DEFAULT_STATUSES;
    const conds: Prisma.Sql[] = [
      Prisma.sql`o.created_at >= ${ts(p.prevStart)}`,
      Prisma.sql`o.created_at < ${ts(p.end)}`,
      Prisma.sql`o.status::text = ANY(${statuses}::text[])`,
    ];
    if (f.warehouseId) {
      conds.push(Prisma.sql`o.source_warehouse_id = ${f.warehouseId}::uuid`);
    }
    if (f.sellerId === 'none') conds.push(Prisma.sql`o.seller_id IS NULL`);
    else if (f.sellerId) conds.push(Prisma.sql`o.seller_id = ${f.sellerId}::uuid`);

    const zoneProvince = provinceKeySql(Prisma.sql`z.province`, Prisma.sql`''`);
    const addrProvince = provinceKeySql(Prisma.sql`a.province`, Prisma.sql`a.city`);

    return Prisma.sql`base AS (
      SELECT o.customer_id,
             o.seller_id,
             o.total_bultos,
             o.total_weight_kg,
             o.total_volume_m3,
             ${withAmount ? Prisma.sql`o.total_amount` : Prisma.sql`0::numeric`} AS total_amount,
             (o.created_at >= ${ts(p.start)}) AS is_current,
             a.zone_id,
             z.name AS zone_name,
             z.sort_order AS zone_sort,
             CASE WHEN z.id IS NOT NULL THEN ${zoneProvince} ELSE ${addrProvince} END AS prov_key,
             COALESCE(z.province, a.province) AS prov_label,
             ${localityKeySql(Prisma.sql`a.city`)} AS loc_key,
             a.city AS loc_label
      FROM orders o
      JOIN customer_addresses a ON a.id = o.address_id
      LEFT JOIN sales_zones z ON z.id = a.zone_id
      WHERE ${Prisma.join(conds, ' AND ')}
    )`;
  }

  private aggregates(withAmount: boolean) {
    const cur = Prisma.sql`FILTER (WHERE is_current)`;
    const prev = Prisma.sql`FILTER (WHERE NOT is_current)`;
    return Prisma.sql`
      COUNT(*) ${cur} AS orders,
      COUNT(DISTINCT customer_id) ${cur} AS customers,
      COALESCE(SUM(total_bultos) ${cur}, 0) AS bultos,
      COALESCE(SUM(total_weight_kg) ${cur}, 0) AS kg,
      COALESCE(SUM(total_volume_m3) ${cur}, 0) AS m3,
      COUNT(*) ${prev} AS p_orders,
      COUNT(DISTINCT customer_id) ${prev} AS p_customers,
      COALESCE(SUM(total_bultos) ${prev}, 0) AS p_bultos,
      COALESCE(SUM(total_weight_kg) ${prev}, 0) AS p_kg,
      COALESCE(SUM(total_volume_m3) ${prev}, 0) AS p_m3
      ${withAmount ? Prisma.sql`, COALESCE(SUM(total_amount) ${cur}, 0) AS amount, COALESCE(SUM(total_amount) ${prev}, 0) AS p_amount` : Prisma.empty}`;
  }

  private metrics(r: AggRow, prefix: '' | 'p_', withAmount: boolean): Metrics {
    const g = (k: string) => (r as unknown as Record<string, unknown>)[prefix + k];
    const m: Metrics = {
      orders: num(g('orders')),
      customers: num(g('customers')),
      bultos: num(g('bultos')),
      weightKg: round(num(g('kg')), 2),
      volumeM3: round(num(g('m3')), 3),
    };
    if (withAmount) m.amount = round(num(g('amount')), 2);
    return m;
  }

  /** Provincias (normalizadas) que tienen zonas comerciales activas. */
  private async provincesWithZones(): Promise<Set<string>> {
    const zones = await this.prisma.salesZone.findMany({
      where: { isActive: true },
      select: { province: true },
      distinct: ['province'],
    });
    return new Set(zones.map((z) => provinceKey(z.province)));
  }

  private provinceLabel(key: string, raw: string | null) {
    if (key === CABA_KEY) return 'CABA';
    if (key === BUENOS_AIRES_KEY) return 'Buenos Aires';
    return raw?.trim() || key;
  }

  // ---------------------------------------------------------------------------
  // GET /analytics/sales-by-zone
  // ---------------------------------------------------------------------------

  async salesByZone(q: SalesByZoneQueryDto, role: UserRole) {
    const withAmount = canViewMoney(role);
    const p = this.period(q.from, q.to);
    const province = q.province ? normalizeGeo(q.province) : undefined;

    let level: Level = 'province';
    if (province) {
      const zoned = await this.provincesWithZones();
      level = q.zoneId || !zoned.has(province) ? 'locality' : 'zone';
    } else if (q.zoneId) {
      throw new BadRequestException('Para filtrar por zona indique la provincia.');
    }

    // Alcance del nivel (dentro del CTE "base")
    const scope: Prisma.Sql[] = [];
    if (province) scope.push(Prisma.sql`prov_key = ${province}`);
    if (q.zoneId === NO_ZONE) scope.push(Prisma.sql`zone_id IS NULL`);
    else if (q.zoneId) scope.push(Prisma.sql`zone_id = ${q.zoneId}::uuid`);
    const where = scope.length ? Prisma.sql`WHERE ${Prisma.join(scope, ' AND ')}` : Prisma.empty;

    const group =
      level === 'province'
        ? { key: Prisma.sql`prov_key`, label: Prisma.sql`mode() WITHIN GROUP (ORDER BY prov_label)`, sort: Prisma.sql`NULL::int` }
        : level === 'zone'
          ? { key: Prisma.sql`COALESCE(zone_id::text, ${NO_ZONE})`, label: Prisma.sql`MAX(zone_name)`, sort: Prisma.sql`MIN(zone_sort)` }
          : { key: Prisma.sql`loc_key`, label: Prisma.sql`mode() WITHIN GROUP (ORDER BY loc_label)`, sort: Prisma.sql`NULL::int` };

    const cte = this.baseCte(q, p, withAmount);
    const agg = this.aggregates(withAmount);

    const [rows, totalsRows] = await Promise.all([
      this.prisma.$queryRaw<AggRow[]>`
        WITH ${cte}
        SELECT ${group.key} AS key, ${group.label} AS label, ${group.sort} AS sort, ${agg}
        FROM base ${where}
        GROUP BY 1`,
      this.prisma.$queryRaw<AggRow[]>`
        WITH ${cte}
        SELECT NULL AS key, NULL AS label, NULL::int AS sort, ${agg}
        FROM base ${where}`,
    ]);

    const totals = this.metrics(totalsRows[0], '', withAmount);
    const prevTotals = this.metrics(totalsRows[0], 'p_', withAmount);
    const additive: AdditiveKey[] = ['orders', 'bultos', 'weightKg', 'volumeM3'];
    if (withAmount) additive.push('amount');

    const result = rows.map((r) => {
      const key = r.key ?? '';
      const current = this.metrics(r, '', withAmount);
      const previous = this.metrics(r, 'p_', withAmount);
      const share: Partial<Record<AdditiveKey, number>> = {};
      const change: Partial<Record<AdditiveKey | 'customers', number | null>> = {};
      for (const k of additive) {
        const t = totals[k] ?? 0;
        share[k] = t > 0 ? round(((current[k] ?? 0) / t) * 100, 1) : 0;
      }
      for (const k of [...additive, 'customers'] as const) {
        const prev = previous[k] ?? 0;
        const cur = current[k] ?? 0;
        // null = sin actividad en el período anterior (zona "nueva")
        change[k] = prev > 0 ? round(((cur - prev) / prev) * 100, 1) : cur > 0 ? null : 0;
      }
      let label: string;
      if (level === 'province') label = this.provinceLabel(key, r.label);
      else if (level === 'zone') label = key === NO_ZONE ? NO_ZONE_LABEL : (r.label ?? key);
      else label = key === CABA_KEY ? 'CABA' : (r.label?.trim() || key);

      return {
        key,
        label,
        sortOrder: r.sort ?? null,
        drillable: level !== 'locality',
        metrics: current,
        previous,
        share,
        change,
      };
    });

    result.sort(
      (a, b) =>
        b.metrics.orders - a.metrics.orders ||
        b.metrics.bultos - a.metrics.bultos ||
        a.label.localeCompare(b.label),
    );

    const details =
      level === 'locality'
        ? await this.localityDetails(cte, where, withAmount)
        : null;

    return {
      level,
      moneyVisible: withAmount,
      context: await this.context(province, q.zoneId),
      period: {
        from: p.from,
        to: p.to,
        previousFrom: p.previousFrom,
        previousTo: p.previousTo,
        days: p.days,
      },
      totals,
      previousTotals: prevTotals,
      rows: result.map((r) =>
        details
          ? {
              ...r,
              topCustomers: details.top.get(r.key) ?? [],
              sellers: details.sellers.get(r.key) ?? [],
            }
          : r,
      ),
    };
  }

  /** Nombres para el breadcrumb. */
  private async context(
    province: string | undefined,
    zoneId: string | undefined,
  ) {
    if (!province) return { province: null, zone: null };
    let provinceLabel = this.provinceLabel(province, null);
    if (provinceLabel === province) {
      // Provincia sin alias conocido: tomar cómo está escrita en las direcciones
      const sample = await this.prisma.$queryRaw<Array<{ label: string }>>`
        SELECT mode() WITHIN GROUP (ORDER BY a.province) AS label FROM customer_addresses a
        WHERE ${provinceKeySql(Prisma.sql`a.province`, Prisma.sql`a.city`)} = ${province}`;
      provinceLabel = sample[0]?.label?.trim() || province;
    }
    let zone: { id: string; name: string } | null = null;
    if (zoneId === NO_ZONE) zone = { id: NO_ZONE, name: NO_ZONE_LABEL };
    else if (zoneId) {
      const z = await this.prisma.salesZone.findUnique({
        where: { id: zoneId },
        select: { id: true, name: true },
      });
      zone = z ?? { id: zoneId, name: 'Zona' };
    }
    return { province: { key: province, label: provinceLabel }, zone };
  }

  /** Top 5 clientes y vendedores por localidad (período actual). */
  private async localityDetails(cte: Prisma.Sql, where: Prisma.Sql, withAmount: boolean) {
    const scope = where === Prisma.empty ? Prisma.sql`WHERE is_current` : Prisma.sql`${where} AND is_current`;
    const [top, sellers] = await Promise.all([
      this.prisma.$queryRaw<
        Array<{ loc_key: string; customer_id: string; name: string; orders: bigint; bultos: unknown; kg: unknown; amount?: unknown }>
      >`
        WITH ${cte},
        ranked AS (
          SELECT b.loc_key, b.customer_id, c.name,
                 COUNT(*) AS orders,
                 COALESCE(SUM(b.total_bultos), 0) AS bultos,
                 COALESCE(SUM(b.total_weight_kg), 0) AS kg
                 ${withAmount ? Prisma.sql`, COALESCE(SUM(b.total_amount), 0) AS amount` : Prisma.empty},
                 ROW_NUMBER() OVER (
                   PARTITION BY b.loc_key
                   ORDER BY COUNT(*) DESC, SUM(b.total_bultos) DESC, c.name
                 ) AS rn
          FROM base b
          JOIN customers c ON c.id = b.customer_id
          ${scope}
          GROUP BY b.loc_key, b.customer_id, c.name
        )
        SELECT * FROM ranked WHERE rn <= 5 ORDER BY loc_key, rn`,
      this.prisma.$queryRaw<
        Array<{ loc_key: string; seller_id: string | null; name: string | null; orders: bigint; bultos: unknown }>
      >`
        WITH ${cte}
        SELECT b.loc_key, b.seller_id,
               MAX(u.first_name || ' ' || u.last_name) AS name,
               COUNT(*) AS orders,
               COALESCE(SUM(b.total_bultos), 0) AS bultos
        FROM base b
        LEFT JOIN users u ON u.id = b.seller_id
        ${scope}
        GROUP BY b.loc_key, b.seller_id
        ORDER BY b.loc_key, orders DESC`,
    ]);

    const topMap = new Map<string, Array<Record<string, unknown>>>();
    for (const t of top) {
      const list = topMap.get(t.loc_key) ?? [];
      list.push({
        customerId: t.customer_id,
        name: t.name,
        orders: num(t.orders),
        bultos: num(t.bultos),
        weightKg: round(num(t.kg), 2),
        ...(withAmount ? { amount: round(num(t.amount), 2) } : {}),
      });
      topMap.set(t.loc_key, list);
    }
    const sellerMap = new Map<string, Array<Record<string, unknown>>>();
    for (const s of sellers) {
      const list = sellerMap.get(s.loc_key) ?? [];
      list.push({
        sellerId: s.seller_id,
        name: s.seller_id ? (s.name?.trim() || 'Usuario') : NO_SELLER_LABEL,
        orders: num(s.orders),
        bultos: num(s.bultos),
      });
      sellerMap.set(s.loc_key, list);
    }
    return { top: topMap, sellers: sellerMap };
  }

  // ---------------------------------------------------------------------------
  // GET /analytics/top-zones (tarjeta del Dashboard)
  // ---------------------------------------------------------------------------

  async topZones(q: TopZonesQueryDto) {
    const days = q.days ?? 30;
    const limit = q.limit ?? 3;
    const p = this.period(undefined, undefined, days);
    const cte = this.baseCte({}, p, false);

    // Zona si la dirección la tiene; si no, la provincia (provincias sin zonas).
    const rows = await this.prisma.$queryRaw<
      Array<{ zone_id: string | null; zone_name: string | null; prov_key: string; prov_label: string | null; orders: bigint; bultos: unknown; p_orders: bigint }>
    >`
      WITH ${cte}
      SELECT zone_id, MAX(zone_name) AS zone_name, prov_key, mode() WITHIN GROUP (ORDER BY prov_label) AS prov_label,
             COUNT(*) FILTER (WHERE is_current) AS orders,
             COALESCE(SUM(total_bultos) FILTER (WHERE is_current), 0) AS bultos,
             COUNT(*) FILTER (WHERE NOT is_current) AS p_orders
      FROM base
      GROUP BY zone_id, prov_key
      HAVING COUNT(*) FILTER (WHERE is_current) > 0
      ORDER BY orders DESC, bultos DESC
      LIMIT ${limit}`;

    const total = await this.prisma.$queryRaw<Array<{ orders: bigint }>>`
      WITH ${cte} SELECT COUNT(*) FILTER (WHERE is_current) AS orders FROM base`;
    const totalOrders = num(total[0]?.orders);

    return {
      period: { from: p.from, to: p.to, days: p.days },
      totalOrders,
      items: rows.map((r) => {
        const orders = num(r.orders);
        const prev = num(r.p_orders);
        const provinceLabel = this.provinceLabel(r.prov_key, r.prov_label);
        return {
          province: r.prov_key,
          provinceLabel,
          zoneId: r.zone_id ?? (r.prov_key === BUENOS_AIRES_KEY ? NO_ZONE : null),
          label: r.zone_name ?? (r.prov_key === BUENOS_AIRES_KEY ? `${NO_ZONE_LABEL} (Buenos Aires)` : provinceLabel),
          orders,
          bultos: num(r.bultos),
          share: totalOrders > 0 ? round((orders / totalOrders) * 100, 1) : 0,
          change: prev > 0 ? round(((orders - prev) / prev) * 100, 1) : null,
        };
      }),
    };
  }

  // ---------------------------------------------------------------------------
  // GET /analytics/filters
  // ---------------------------------------------------------------------------

  async filters(role: UserRole) {
    const [warehouses, sellers] = await Promise.all([
      this.prisma.warehouse.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.user.findMany({
        where: { salesOrders: { some: {} } },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      }),
    ]);
    const p = this.period();
    return {
      moneyVisible: canViewMoney(role),
      defaults: { from: p.from, to: p.to, statuses: DEFAULT_STATUSES },
      statuses: Object.values(OrderStatus),
      warehouses,
      sellers: sellers.map((s) => ({
        id: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
      })),
    };
  }
}
