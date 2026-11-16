import {
  PickDemand,
  RoutableLocation,
  StockCandidate,
  planPicks,
  planReplacement,
  rankLocationsForRoute,
  selectLocationsForLine,
} from './pick-route';

// Ubicación de prueba: código "<WH>-<pasillo>-<módulo><nivel>"
function loc(
  warehouseId: string,
  aisle: string,
  position: string,
  rack = 'A',
): RoutableLocation {
  return {
    id: `${warehouseId}-${aisle}-${position}${rack}`,
    code: `${aisle}-${position}${rack}`,
    aisle,
    rack,
    position,
    routeOrder: null,
    warehouseId,
    warehouseCode: warehouseId,
  };
}

function stock(
  location: RoutableLocation,
  productId: string,
  available: number,
): StockCandidate {
  return {
    inventoryId: `inv-${location.id}-${productId}`,
    productId,
    locationId: location.id,
    warehouseId: location.warehouseId!,
    lotNumber: 'SIN_LOTE',
    available,
  };
}

function plan(
  demands: PickDemand[],
  candidates: StockCandidate[],
  locations: RoutableLocation[],
) {
  return planPicks(demands, candidates, rankLocationsForRoute(locations));
}

describe('rankLocationsForRoute (barrido lineal)', () => {
  it('ordena pasillo, módulo y nivel siempre ascendente, sin zigzag', () => {
    const locations = [
      loc('W1', 'Pasillo 2', '3'),
      loc('W1', 'Pasillo 10', '1'),
      loc('W1', 'Pasillo 2', '1', 'B'),
      loc('W1', 'Pasillo 2', '1', 'A'),
      loc('W1', 'Pasillo 1', '5'),
    ];
    const ranks = rankLocationsForRoute(locations);
    const ordered = [...locations]
      .sort((a, b) => ranks.get(a.id)!.rank - ranks.get(b.id)!.rank)
      .map((l) => l.code);

    expect(ordered).toEqual([
      'Pasillo 1-5A',
      'Pasillo 2-1A',
      'Pasillo 2-1B',
      'Pasillo 2-3A',
      'Pasillo 10-1A',
    ]);
    expect([...ranks.values()].every((r) => r.direction === 'ASC')).toBe(
      true,
    );
  });

  it('recorre un depósito por vez en el orden indicado', () => {
    const locations = [loc('W1', 'A', '1'), loc('W2', 'A', '1')];
    const ranks = rankLocationsForRoute(locations, ['W2', 'W1']);
    expect(ranks.get('W2-A-1A')!.rank).toBeLessThan(ranks.get('W1-A-1A')!.rank);
  });

  it('respeta el orden manual (routeOrder) antes que el automático', () => {
    const manual = { ...loc('W1', 'Z', '9'), routeOrder: 1 };
    const auto = loc('W1', 'A', '1');
    const ranks = rankLocationsForRoute([auto, manual]);
    expect(ranks.get(manual.id)!.rank).toBeLessThan(ranks.get(auto.id)!.rank);
  });
});

describe('planPicks (multi-depósito)', () => {
  it('toma toda la línea de un único depósito si alguno la cubre', () => {
    const a1 = loc('W1', 'A', '1');
    const b1 = loc('W2', 'A', '1');
    const result = plan(
      [{ orderItemId: 'i1', productId: 'P', quantity: 10 }],
      [stock(a1, 'P', 6), stock(b1, 'P', 12)],
      [a1, b1],
    );
    expect(result.shortages).toEqual([]);
    expect(result.picks).toHaveLength(1);
    expect(result.picks[0]).toMatchObject({ warehouseId: 'W2', quantity: 10 });
  });

  it('empieza por el depósito que cubre más bultos del pedido y lo reutiliza', () => {
    const w1 = loc('W1', 'A', '1');
    const w2a = loc('W2', 'A', '1');
    const w2b = loc('W2', 'A', '2');
    const result = plan(
      [
        { orderItemId: 'i1', productId: 'P', quantity: 5 },
        { orderItemId: 'i2', productId: 'Q', quantity: 20 },
      ],
      [
        stock(w1, 'P', 50),
        stock(w2a, 'P', 5),
        stock(w2b, 'Q', 20),
      ],
      [w1, w2a, w2b],
    );
    // W2 cubre 25 bultos del pedido (5 + 20), W1 sólo 5: todo sale de W2.
    expect(result.warehouseOrder).toEqual(['W2']);
    expect(result.picks.map((p) => p.warehouseId)).toEqual(['W2', 'W2']);
  });

  it('vaciado: pedido 10 con A=9 y B=20 -> 9 de A + 1 de B', () => {
    const a = loc('W1', 'A', '1');
    const b = loc('W1', 'B', '1');
    const result = plan(
      [{ orderItemId: 'i1', productId: 'P', quantity: 10 }],
      [stock(b, 'P', 20), stock(a, 'P', 9)],
      [a, b],
    );
    expect(result.picks.map((p) => [p.locationId, p.quantity])).toEqual([
      [a.id, 9],
      [b.id, 1],
    ]);
  });

  it('vaciado aun cuando una sola ubicación cubre la línea', () => {
    const small = loc('W1', 'B', '1');
    const big = loc('W1', 'A', '1');
    const result = plan(
      [{ orderItemId: 'i1', productId: 'P', quantity: 8 }],
      [stock(small, 'P', 3), stock(big, 'P', 50)],
      [small, big],
    );
    // 3 de la chica (queda vacía) + 5 de la grande; recorrido: A antes que B
    expect(result.picks.map((p) => [p.locationId, p.quantity])).toEqual([
      [big.id, 5],
      [small.id, 3],
    ]);
  });

  it('desempata por recorrido entre ubicaciones con igual disponible', () => {
    const l2 = loc('W1', 'A', '2');
    const l1 = loc('W1', 'A', '1');
    const result = plan(
      [{ orderItemId: 'i1', productId: 'P', quantity: 2 }],
      [stock(l2, 'P', 2), stock(l1, 'P', 2)],
      [l2, l1],
    );
    expect(result.picks.map((p) => p.locationId)).toEqual([l1.id]);
  });

  it('completa la línea con otro depósito cuando ninguno alcanza solo', () => {
    const w1 = loc('W1', 'A', '1');
    const w2 = loc('W2', 'A', '1');
    const result = plan(
      [{ orderItemId: 'i1', productId: 'P', quantity: 15 }],
      [stock(w1, 'P', 10), stock(w2, 'P', 8)],
      [w1, w2],
    );
    expect(result.shortages).toEqual([]);
    expect(result.warehouseOrder).toEqual(['W1', 'W2']);
    expect(result.picks.map((p) => [p.warehouseId, p.quantity])).toEqual([
      ['W1', 10],
      ['W2', 5],
    ]);
    expect(result.picks.map((p) => p.sequence)).toEqual([1, 2]);
  });

  it('agrupa el recorrido por depósito y numera la secuencia global', () => {
    const w1a = loc('W1', 'A', '1');
    const w1b = loc('W1', 'B', '1');
    const w2a = loc('W2', 'A', '1');
    const result = plan(
      [
        { orderItemId: 'i1', productId: 'P', quantity: 2 },
        { orderItemId: 'i2', productId: 'Q', quantity: 2 },
        { orderItemId: 'i3', productId: 'R', quantity: 2 },
      ],
      [stock(w1b, 'P', 2), stock(w2a, 'Q', 2), stock(w1a, 'R', 2)],
      [w1a, w1b, w2a],
    );
    expect(
      result.picks.map((p) => [p.sequence, p.warehouseId, p.locationId]),
    ).toEqual([
      [1, 'W1', w1a.id],
      [2, 'W1', w1b.id],
      [3, 'W2', w2a.id],
    ]);
  });

  it('informa faltantes cuando el stock consolidado no alcanza', () => {
    const w1 = loc('W1', 'A', '1');
    const result = plan(
      [{ orderItemId: 'i1', productId: 'P', quantity: 5 }],
      [stock(w1, 'P', 3)],
      [w1],
    );
    expect(result.shortages).toEqual([
      { orderItemId: 'i1', productId: 'P', missing: 2 },
    ]);
    expect(result.picks[0].quantity).toBe(3);
  });
});

describe('selectLocationsForLine (tope de fragmentación)', () => {
  const rank = (c: { locationId: string }) => Number(c.locationId.slice(1));
  const s = (id: string, available: number) => ({ locationId: id, available });

  it('no supera 3 ubicaciones: la 3ª es la más chica que cubre el resto', () => {
    const result = selectLocationsForLine(
      [s('L1', 1), s('L2', 1), s('L3', 1), s('L4', 2), s('L5', 50), s('L6', 30)],
      10,
      rank,
    );
    expect(result.map((r) => [r.candidate.locationId, r.take])).toEqual([
      ['L1', 1],
      ['L2', 1],
      ['L6', 8],
    ]);
  });

  it('si ninguna cubre el resto, sigue por las más grandes hasta agotar', () => {
    const result = selectLocationsForLine(
      [s('L1', 1), s('L2', 2), s('L3', 3), s('L4', 4)],
      9,
      rank,
    );
    expect(result.map((r) => [r.candidate.locationId, r.take])).toEqual([
      ['L1', 1],
      ['L2', 2],
      ['L4', 4],
      ['L3', 2],
    ]);
  });
});

describe('planReplacement (reemplazo ante faltante)', () => {
  const origin = loc('W1', 'A', '1');
  const sameWh = loc('W1', 'B', '2');
  const otherWh = loc('W2', 'A', '1');
  const ranks = rankLocationsForRoute([origin, sameWh, otherWh]);

  it('busca primero en el mismo depósito', () => {
    const r = planReplacement({
      productId: 'P',
      missing: 1,
      originWarehouseId: 'W1',
      orderWarehouses: ['W1'],
      candidates: [stock(sameWh, 'P', 5), stock(otherWh, 'P', 50)],
      ranks,
    });
    expect(r.uncovered).toBe(0);
    expect(r.picks).toEqual([
      expect.objectContaining({ locationId: sameWh.id, warehouseId: 'W1', quantity: 1 }),
    ]);
  });

  it('sin stock en el depósito, usa otro depósito (multi-depósito)', () => {
    const r = planReplacement({
      productId: 'P',
      missing: 2,
      originWarehouseId: 'W1',
      orderWarehouses: ['W1'],
      candidates: [stock(otherWh, 'P', 50)],
      ranks,
    });
    expect(r.picks).toEqual([
      expect.objectContaining({ warehouseId: 'W2', quantity: 2 }),
    ]);
  });

  it('sin stock en ningún lado -> faltante sin cubrir', () => {
    const r = planReplacement({
      productId: 'P',
      missing: 1,
      originWarehouseId: 'W1',
      orderWarehouses: ['W1'],
      candidates: [stock(sameWh, 'Q', 5)],
      ranks,
    });
    expect(r).toEqual({ picks: [], uncovered: 1 });
  });

  it('completa entre depósitos aplicando vaciado en cada uno', () => {
    const r = planReplacement({
      productId: 'P',
      missing: 4,
      originWarehouseId: 'W1',
      orderWarehouses: ['W1'],
      candidates: [stock(sameWh, 'P', 1), stock(otherWh, 'P', 10)],
      ranks,
    });
    expect(r.picks.map((p) => [p.warehouseId, p.quantity])).toEqual([
      ['W1', 1],
      ['W2', 3],
    ]);
  });
});
