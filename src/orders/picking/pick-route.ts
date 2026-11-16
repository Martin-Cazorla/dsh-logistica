// dsh-logistica/src/orders/picking/pick-route.ts

/**
 * PLANIFICACIÓN DE PICKING MULTI-DEPÓSITO CON RECORRIDO LINEAL
 * =============================================================
 *
 * Modelo físico de una ubicación en este WMS:
 *   - warehouse -> depósito (un pedido puede recorrer varios)
 *   - aisle     -> zona / pasillo (p. ej. "Rack Izquierda", "Pasillo F")
 *   - position  -> número de módulo a lo largo del pasillo (1, 2, 3, ...)
 *   - rack      -> nivel en altura (A = piso, B, C, ...)
 *   - routeOrder (opcional) -> orden manual de recorrido definido por el depósito
 *
 * Recorrido (barrido lineal en un solo sentido):
 *   1. Se recorre un depósito por vez, en el orden que decide el plan (el que
 *      cubre más bultos del pedido primero).
 *   2. Dentro del depósito, las ubicaciones con `routeOrder` van primero, en
 *      ese orden (layouts que no siguen la convención de nombres).
 *   3. El resto se ordena correlativamente: pasillo (orden "natural":
 *      "Pasillo 2" < "Pasillo 10"), módulo ascendente y nivel ascendente.
 *
 * Propiedades garantizadas:
 *   - Cada depósito aparece en UN único bloque contiguo de la secuencia.
 *   - Dentro de un depósito, cada pasillo es un bloque contiguo y el módulo
 *     es monótono creciente: el operario avanza de punta a punta sin volver
 *     atrás ni pasar dos veces por el mismo pasillo.
 *
 * No se trabaja con mercadería con vencimiento: la elección de stock no usa
 * fechas de lote.
 */

export interface RoutableLocation {
  id: string;
  code: string;
  aisle: string;
  rack: string;
  position: string;
  routeOrder: number | null;
  /** Depósito de la ubicación. Opcional para vistas de un único depósito. */
  warehouseId?: string;
  warehouseCode?: string;
}

export interface RouteRank {
  rank: number;
  warehouseId: string;
  zone: string;
  zoneIndex: number;
  module: number;
  level: string;
  /** Siempre 'ASC' (recorrido lineal). Se conserva por compatibilidad. */
  direction: 'ASC' | 'DESC';
}

const naturalCollator = new Intl.Collator('es', {
  numeric: true,
  sensitivity: 'base',
});

function parseModule(position: string): number {
  const match = /\d+/.exec(position ?? '');
  return match ? parseInt(match[0], 10) : 0;
}

function normalizeZone(location: RoutableLocation): string {
  return (location.aisle || 'GENERAL').trim().toUpperCase();
}

function normalizeLevel(location: RoutableLocation): string {
  return (location.rack || 'A').trim().toUpperCase();
}

function hasManualOrder(l: RoutableLocation): boolean {
  return l.routeOrder !== null && l.routeOrder !== undefined;
}

/** Orden lineal de las ubicaciones de UN depósito. */
function compareWithinWarehouse(
  a: RoutableLocation,
  b: RoutableLocation,
): number {
  const ma = hasManualOrder(a);
  const mb = hasManualOrder(b);
  if (ma !== mb) return ma ? -1 : 1;
  if (ma && mb) {
    return (
      (a.routeOrder as number) - (b.routeOrder as number) ||
      naturalCollator.compare(a.code, b.code)
    );
  }

  const zoneCmp = naturalCollator.compare(normalizeZone(a), normalizeZone(b));
  if (zoneCmp !== 0) return zoneCmp;

  const moduleCmp = parseModule(a.position) - parseModule(b.position);
  if (moduleCmp !== 0) return moduleCmp;

  const levelCmp = naturalCollator.compare(
    normalizeLevel(a),
    normalizeLevel(b),
  );
  if (levelCmp !== 0) return levelCmp;

  return naturalCollator.compare(a.code, b.code);
}

/**
 * Devuelve un ranking total de recorrido para las ubicaciones dadas.
 *
 * `warehouseOrder` fija en qué orden se visitan los depósitos; los que no
 * figuran van al final, ordenados por código. Es determinista: a igual
 * entrada, igual salida.
 */
export function rankLocationsForRoute(
  locations: RoutableLocation[],
  warehouseOrder: string[] = [],
): Map<string, RouteRank> {
  const unique = [...new Map(locations.map((l) => [l.id, l])).values()];

  const orderIndex = new Map(warehouseOrder.map((id, i) => [id, i]));
  const codeOf = new Map<string, string>();
  for (const l of unique) {
    const wid = l.warehouseId ?? '';
    if (!codeOf.has(wid)) codeOf.set(wid, l.warehouseCode ?? wid);
  }
  const warehouses = [...codeOf.keys()].sort((a, b) => {
    const ia = orderIndex.get(a) ?? Number.MAX_SAFE_INTEGER;
    const ib = orderIndex.get(b) ?? Number.MAX_SAFE_INTEGER;
    if (ia !== ib) return ia - ib;
    return naturalCollator.compare(codeOf.get(a)!, codeOf.get(b)!);
  });

  const result = new Map<string, RouteRank>();
  let rank = 0;

  for (const wid of warehouses) {
    const inWarehouse = unique
      .filter((l) => (l.warehouseId ?? '') === wid)
      .sort(compareWithinWarehouse);

    const zoneIndex = new Map<string, number>();
    for (const loc of inWarehouse) {
      const zone = normalizeZone(loc);
      if (!hasManualOrder(loc) && !zoneIndex.has(zone)) {
        zoneIndex.set(zone, zoneIndex.size);
      }
      result.set(loc.id, {
        rank: rank++,
        warehouseId: wid,
        zone,
        zoneIndex: hasManualOrder(loc) ? -1 : zoneIndex.get(zone)!,
        module: parseModule(loc.position),
        level: normalizeLevel(loc),
        direction: 'ASC',
      });
    }
  }

  return result;
}

// =============================================================================
// ASIGNACIÓN DE STOCK A LÍNEAS DE PICKING
// =============================================================================

export interface PickDemand {
  orderItemId: string;
  productId: string;
  quantity: number;
}

export interface StockCandidate {
  inventoryId: string;
  productId: string;
  locationId: string;
  warehouseId: string;
  lotNumber: string;
  available: number;
}

export interface PlannedPick {
  orderItemId: string;
  productId: string;
  inventoryId: string;
  locationId: string;
  warehouseId: string;
  lotNumber: string;
  quantity: number;
  sequence: number;
  rank: RouteRank;
}

export interface PickPlan {
  picks: PlannedPick[];
  /** Depósitos visitados, en el orden del recorrido. */
  warehouseOrder: string[];
  shortages: Array<{
    orderItemId: string;
    productId: string;
    missing: number;
  }>;
}

/** Tope de ubicaciones por línea dentro de un mismo depósito. */
export const MAX_STOPS_PER_LINE = 3;

/**
 * Elige de qué ubicaciones de UN depósito sale una línea, con la estrategia
 * "vaciar ubicaciones primero":
 *   - Se toman primero las ubicaciones con MENOS disponible (quedan vacías y
 *     liberan posiciones); desempate por orden de recorrido.
 *   - Tope de fragmentación: al llegar a la última parada permitida
 *     (maxStops), se elige la ubicación más chica que cubra el resto en vez de
 *     seguir fraccionando.
 *   - Si ninguna cubre el resto, se toma de las más grandes primero (menos
 *     paradas) hasta agotar el depósito; el llamador completa con otro.
 *
 * Ej.: pedido 10, A=9, B=20 -> 9 de A (queda vacía) + 1 de B.
 * No modifica `stock`: devuelve las tomas.
 */
export function selectLocationsForLine<
  T extends { locationId: string; available: number },
>(
  stock: T[],
  wanted: number,
  rankOf: (c: T) => number,
  maxStops = MAX_STOPS_PER_LINE,
): Array<{ candidate: T; take: number }> {
  const ascending = stock
    .filter((c) => c.available > 0)
    .sort((a, b) => a.available - b.available || rankOf(a) - rankOf(b));

  const result: Array<{ candidate: T; take: number }> = [];
  const used = new Set<T>();
  let remaining = wanted;

  while (remaining > 0) {
    const left = ascending.filter((c) => !used.has(c));
    if (left.length === 0) break;

    let next: T;
    if (result.length < maxStops - 1) {
      next = left[0];
    } else {
      // Última parada permitida (o ya excedida): la más chica que cubra el
      // resto; si ninguna cubre, la más grande.
      next =
        left.find((c) => c.available >= remaining) ?? left[left.length - 1];
    }

    const take = Math.min(next.available, remaining);
    result.push({ candidate: next, take });
    used.add(next);
    remaining -= take;
  }

  return result;
}

/**
 * Decide de qué depósito / ubicación sale cada línea y en qué orden se
 * recorre.
 *
 * Prioridad del depósito: el que más bultos del pedido puede cubrir (suma por
 * línea de min(pedido, disponible)); desempate por código de depósito.
 *
 * Por cada línea:
 *   1. Menos depósitos: un depósito que cubra la línea completa, prefiriendo
 *      los que ya están en el plan y, entre ellos, el de mayor prioridad.
 *   2. Vaciado: dentro del depósito, primero las ubicaciones con menos
 *      disponible, con tope de MAX_STOPS_PER_LINE paradas por línea
 *      (selectLocationsForLine); desempate por orden de recorrido.
 *   3. Si ningún depósito cubre la línea, se completa con los siguientes
 *      depósitos (primero los ya usados, luego por prioridad) con el mismo
 *      criterio en cada uno.
 *
 * No hay lógica de lote / vencimiento / FIFO por ingreso que respetar: el
 * vaciado es el único criterio dentro del depósito.
 *
 * Al final TODAS las tomas se ordenan por depósito (en el orden de uso) y
 * por recorrido lineal, y se numeran 1..n (sequence).
 */
export function planPicks(
  demands: PickDemand[],
  candidates: StockCandidate[],
  ranks: Map<string, RouteRank>,
): PickPlan {
  const pool = candidates
    .filter((c) => c.available > 0)
    .map((c) => ({ ...c }));

  const rankOf = (c: StockCandidate) =>
    ranks.get(c.locationId)?.rank ?? Number.MAX_SAFE_INTEGER;

  // Prioridad de depósitos según cobertura del pedido completo
  const availableBy = (warehouseId: string, productId: string) =>
    pool
      .filter((c) => c.warehouseId === warehouseId && c.productId === productId)
      .reduce((acc, c) => acc + c.available, 0);

  const warehouseIds = [...new Set(pool.map((c) => c.warehouseId))];
  const coverage = new Map(
    warehouseIds.map((w) => [
      w,
      demands.reduce(
        (acc, d) => acc + Math.min(d.quantity, availableBy(w, d.productId)),
        0,
      ),
    ]),
  );
  const minRankOf = new Map(
    warehouseIds.map((w) => [
      w,
      Math.min(...pool.filter((c) => c.warehouseId === w).map(rankOf)),
    ]),
  );
  const byPriority = [...warehouseIds].sort(
    (a, b) =>
      coverage.get(b)! - coverage.get(a)! ||
      // desempate determinista: el depósito que va antes en el ranking
      // (ranking construido por código de depósito)
      minRankOf.get(a)! - minRankOf.get(b)!,
  );

  const used: string[] = [];
  const picks: Omit<PlannedPick, 'sequence'>[] = [];
  const shortages: PickPlan['shortages'] = [];

  const takeFrom = (
    demand: PickDemand,
    warehouseId: string,
    wanted: number,
  ): number => {
    const stock = pool.filter(
      (c) =>
        c.warehouseId === warehouseId &&
        c.productId === demand.productId &&
        c.available > 0,
    );

    let remaining = wanted;
    for (const { candidate, take } of selectLocationsForLine(
      stock,
      wanted,
      rankOf,
    )) {
      candidate.available -= take; // el mismo stock no se asigna dos veces
      remaining -= take;
      picks.push({
        orderItemId: demand.orderItemId,
        productId: demand.productId,
        inventoryId: candidate.inventoryId,
        locationId: candidate.locationId,
        warehouseId,
        lotNumber: candidate.lotNumber,
        quantity: take,
        rank: ranks.get(candidate.locationId)!,
      });
    }
    if (wanted - remaining > 0 && !used.includes(warehouseId)) {
      used.push(warehouseId);
    }
    return wanted - remaining;
  };

  for (const demand of demands) {
    // Orden de preferencia: depósitos ya usados, luego el resto; ambos
    // grupos por prioridad.
    const preference = [
      ...byPriority.filter((w) => used.includes(w)),
      ...byPriority.filter((w) => !used.includes(w)),
    ];

    const full = preference.find(
      (w) => availableBy(w, demand.productId) >= demand.quantity,
    );

    let remaining = demand.quantity;
    if (full) {
      remaining -= takeFrom(demand, full, remaining);
    } else {
      for (const w of preference) {
        if (remaining === 0) break;
        remaining -= takeFrom(demand, w, remaining);
      }
    }

    if (remaining > 0) {
      shortages.push({
        orderItemId: demand.orderItemId,
        productId: demand.productId,
        missing: remaining,
      });
    }
  }

  // Recorrido final: depósito por depósito (empezando por el que cubre más
  // bultos del pedido) y, dentro de cada uno, el orden lineal.
  const warehouseOrder = byPriority.filter((w) => used.includes(w));
  const visitIndex = new Map(warehouseOrder.map((w, i) => [w, i]));
  picks.sort(
    (a, b) =>
      visitIndex.get(a.warehouseId)! - visitIndex.get(b.warehouseId)! ||
      a.rank.rank - b.rank.rank,
  );

  return {
    picks: picks.map((p, i) => ({ ...p, sequence: i + 1 })),
    warehouseOrder,
    shortages,
  };
}

// =============================================================================
// REEMPLAZO ANTE FALTANTE
// =============================================================================

export interface ReplacementPick {
  inventoryId: string;
  locationId: string;
  warehouseId: string;
  lotNumber: string;
  quantity: number;
}

/**
 * Busca de dónde cubrir `missing` bultos de un producto que faltaron en una
 * toma. `candidates` ya excluye la ubicación problemática y sólo trae stock
 * disponible (físico − reservado, que incluye la cuarentena).
 *
 * Orden de búsqueda:
 *   a. El mismo depósito de la toma original (no abre un multi-depósito).
 *   b. Los depósitos que el pedido ya recorre, en su orden.
 *   c. El resto, empezando por el que más disponible tiene del producto.
 * Dentro de cada depósito se aplica el vaciado (selectLocationsForLine).
 */
export function planReplacement(params: {
  productId: string;
  missing: number;
  originWarehouseId: string;
  orderWarehouses: string[];
  candidates: StockCandidate[];
  ranks: Map<string, RouteRank>;
}): { picks: ReplacementPick[]; uncovered: number } {
  const pool = params.candidates
    .filter((c) => c.productId === params.productId && c.available > 0)
    .map((c) => ({ ...c }));
  const rankOf = (c: StockCandidate) =>
    params.ranks.get(c.locationId)?.rank ?? Number.MAX_SAFE_INTEGER;

  const totalIn = (w: string) =>
    pool.filter((c) => c.warehouseId === w).reduce((a, c) => a + c.available, 0);
  const firstRank = (w: string) =>
    Math.min(...pool.filter((c) => c.warehouseId === w).map(rankOf));

  const others = [...new Set(pool.map((c) => c.warehouseId))]
    .filter(
      (w) =>
        w !== params.originWarehouseId && !params.orderWarehouses.includes(w),
    )
    .sort((a, b) => totalIn(b) - totalIn(a) || firstRank(a) - firstRank(b));

  const order = [
    params.originWarehouseId,
    ...params.orderWarehouses.filter((w) => w !== params.originWarehouseId),
    ...others,
  ];

  const picks: ReplacementPick[] = [];
  let remaining = params.missing;
  for (const w of order) {
    if (remaining === 0) break;
    const stock = pool.filter((c) => c.warehouseId === w);
    for (const { candidate, take } of selectLocationsForLine(
      stock,
      remaining,
      rankOf,
    )) {
      candidate.available -= take;
      remaining -= take;
      picks.push({
        inventoryId: candidate.inventoryId,
        locationId: candidate.locationId,
        warehouseId: w,
        lotNumber: candidate.lotNumber,
        quantity: take,
      });
    }
  }

  return { picks, uncovered: remaining };
}
