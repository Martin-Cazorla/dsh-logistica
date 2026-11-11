// dsh-logistica/src/orders/picking/pick-route.ts

/**
 * ALGORITMO DE RUTA UNIDIRECCIONAL DE PICKING (S-shape / serpentina)
 * ===================================================================
 *
 * Modelo físico de una ubicación en este WMS:
 *   - aisle    -> zona / pasillo (p. ej. "Rack Izquierda", "Pasillo F")
 *   - position -> número de módulo a lo largo del pasillo (1, 2, 3, ...)
 *   - rack     -> nivel en altura (A = piso, B, C, ...)
 *   - routeOrder (opcional) -> orden manual de recorrido definido por el depósito
 *
 * Reglas del recorrido:
 *   1. Las ubicaciones con `routeOrder` se recorren primero, en ese orden
 *      (permite modelar layouts que no siguen la convención de nombres).
 *   2. El resto se agrupa por zona; las zonas se ordenan de forma "natural"
 *      ("Pasillo 2" < "Pasillo 10").
 *   3. Dentro de cada zona los módulos se recorren en sentido alternado:
 *      zona par -> módulos ascendentes, zona impar -> descendentes. Así el
 *      operario entra por un extremo del pasillo y sale por el otro, que es
 *      donde comienza el siguiente: nunca vuelve sobre sus pasos.
 *   4. En el mismo módulo se toman los niveles de abajo hacia arriba.
 *
 * Propiedades garantizadas (para los rankings que devuelve esta función):
 *   - Cada zona aparece en UN único bloque contiguo de la secuencia
 *     -> el picker no pasa dos veces por la misma zona.
 *   - Dentro de una zona la coordenada de módulo es monótona
 *     -> no hay retrocesos dentro del pasillo.
 */

export interface RoutableLocation {
  id: string;
  code: string;
  aisle: string;
  rack: string;
  position: string;
  routeOrder: number | null;
}

export interface RouteRank {
  rank: number;
  zone: string;
  zoneIndex: number;
  module: number;
  level: string;
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

/**
 * Devuelve un ranking total de recorrido para las ubicaciones dadas.
 * Es determinista: a igual entrada, igual salida (desempate por código).
 */
export function rankLocationsForRoute(
  locations: RoutableLocation[],
): Map<string, RouteRank> {
  const unique = [...new Map(locations.map((l) => [l.id, l])).values()];

  const manual = unique
    .filter((l) => l.routeOrder !== null && l.routeOrder !== undefined)
    .sort(
      (a, b) =>
        (a.routeOrder as number) - (b.routeOrder as number) ||
        naturalCollator.compare(a.code, b.code),
    );

  const automatic = unique.filter(
    (l) => l.routeOrder === null || l.routeOrder === undefined,
  );

  const zones = [...new Set(automatic.map(normalizeZone))].sort((a, b) =>
    naturalCollator.compare(a, b),
  );
  const zoneIndex = new Map(zones.map((z, i) => [z, i]));

  const sortedAutomatic = [...automatic].sort((a, b) => {
    const za = zoneIndex.get(normalizeZone(a))!;
    const zb = zoneIndex.get(normalizeZone(b))!;
    if (za !== zb) return za - zb;

    const ascending = za % 2 === 0;
    const ma = parseModule(a.position);
    const mb = parseModule(b.position);
    if (ma !== mb) return ascending ? ma - mb : mb - ma;

    const levelCmp = naturalCollator.compare(
      normalizeLevel(a),
      normalizeLevel(b),
    );
    if (levelCmp !== 0) return levelCmp;

    return naturalCollator.compare(a.code, b.code);
  });

  const result = new Map<string, RouteRank>();
  let rank = 0;

  for (const loc of manual) {
    result.set(loc.id, {
      rank: rank++,
      zone: normalizeZone(loc),
      zoneIndex: -1,
      module: parseModule(loc.position),
      level: normalizeLevel(loc),
      direction: 'ASC',
    });
  }

  for (const loc of sortedAutomatic) {
    const zi = zoneIndex.get(normalizeZone(loc))!;
    result.set(loc.id, {
      rank: rank++,
      zone: normalizeZone(loc),
      zoneIndex: zi,
      module: parseModule(loc.position),
      level: normalizeLevel(loc),
      direction: zi % 2 === 0 ? 'ASC' : 'DESC',
    });
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
  lotNumber: string;
  available: number;
  expiresAt: Date | null;
}

export interface PlannedPick {
  orderItemId: string;
  productId: string;
  inventoryId: string;
  locationId: string;
  lotNumber: string;
  quantity: number;
  sequence: number;
  rank: RouteRank;
}

export interface PickPlan {
  picks: PlannedPick[];
  shortages: Array<{
    orderItemId: string;
    productId: string;
    missing: number;
  }>;
}

/**
 * Decide de qué registros de inventario se toma cada ítem y en qué orden se
 * recorren.
 *
 * Criterios de elección por producto (en orden):
 *   1. FEFO: primero lo que vence antes (sin vencimiento al final).
 *   2. Menos paradas: preferir una ubicación que cubra toda la cantidad.
 *   3. Lo que queda antes en el recorrido.
 *
 * Luego TODAS las tomas del pedido se ordenan por el ranking de ruta y se
 * numeran 1..n (sequence).
 */
export function planPicks(
  demands: PickDemand[],
  candidates: StockCandidate[],
  ranks: Map<string, RouteRank>,
): PickPlan {
  const byProduct = new Map<string, StockCandidate[]>();
  for (const c of candidates) {
    if (c.available <= 0) continue;
    const list = byProduct.get(c.productId) ?? [];
    list.push({ ...c });
    byProduct.set(c.productId, list);
  }

  const picks: Omit<PlannedPick, 'sequence'>[] = [];
  const shortages: PickPlan['shortages'] = [];

  for (const demand of demands) {
    let remaining = demand.quantity;
    const pool = byProduct.get(demand.productId) ?? [];

    pool.sort((a, b) => {
      const ea = a.expiresAt ? a.expiresAt.getTime() : Number.POSITIVE_INFINITY;
      const eb = b.expiresAt ? b.expiresAt.getTime() : Number.POSITIVE_INFINITY;
      if (ea !== eb) return ea - eb;

      const coversA = a.available >= remaining ? 0 : 1;
      const coversB = b.available >= remaining ? 0 : 1;
      if (coversA !== coversB) return coversA - coversB;

      const ra = ranks.get(a.locationId)?.rank ?? Number.MAX_SAFE_INTEGER;
      const rb = ranks.get(b.locationId)?.rank ?? Number.MAX_SAFE_INTEGER;
      return ra - rb;
    });

    for (const candidate of pool) {
      if (remaining === 0) break;
      if (candidate.available <= 0) continue;

      const take = Math.min(candidate.available, remaining);
      candidate.available -= take; // el mismo stock no se asigna dos veces
      remaining -= take;

      picks.push({
        orderItemId: demand.orderItemId,
        productId: demand.productId,
        inventoryId: candidate.inventoryId,
        locationId: candidate.locationId,
        lotNumber: candidate.lotNumber,
        quantity: take,
        rank: ranks.get(candidate.locationId)!,
      });
    }

    if (remaining > 0) {
      shortages.push({
        orderItemId: demand.orderItemId,
        productId: demand.productId,
        missing: remaining,
      });
    }
  }

  picks.sort((a, b) => a.rank.rank - b.rank.rank);

  return {
    picks: picks.map((p, i) => ({ ...p, sequence: i + 1 })),
    shortages,
  };
}
