import { describe, it, expect } from 'vitest';
import {
  costPerDrink,
  computeItemMargins,
  groupByCategory,
  summariseSales,
  revenueTrend,
  rankByMargin,
  flagThinMargins,
  recipeCostPerDrink,
  topUncostedByRevenue,
  slowMovers,
  type SoldLine,
  type CostRef,
} from './sales-analytics';

/**
 * Numbers here are Scotty's real configuration: Well Vodka is a 1L bottle at
 * $6.68 poured 1oz, Michelob Ultra is sold whole, and the bar sells about 34
 * shots out of a litre.
 */

const line = (
  matchKey: string,
  qtySold: number,
  netSales: number,
  categoryName: string | null = 'Vodka',
  saleDate = '2026-08-19',
): SoldLine => ({ matchKey, itemName: matchKey, categoryName, qtySold, netSales, saleDate });

const spirit = (matchKey: string, costPrice: number | null, bottleSizeMl = 1000): CostRef =>
  ({ matchKey, costPrice, bottleSizeMl, pourSizeOz: 1 });

/** No container size, so one sale is one unit — a can or a bottle of beer. */
const whole = (matchKey: string, costPrice: number | null): CostRef =>
  ({ matchKey, costPrice, bottleSizeMl: null, pourSizeOz: null });

describe('costPerDrink', () => {
  it('converts a bottle price into the cost of one pour', () => {
    // THE trap: $6.68 a litre is 19.8 cents a shot, not $6.68 a shot.
    expect(costPerDrink(spirit('well vodka', 6.68))).toBeCloseTo(0.1976, 3);
  });

  it('charges the whole unit for something sold whole', () => {
    expect(costPerDrink(whole('michelob ultra', 2.15))).toBeCloseTo(2.15);
  });

  it('is null when the item has no cost price', () => {
    // Not zero. Zero would report a 100% margin on an unconfigured item.
    expect(costPerDrink(spirit('titos', null))).toBeNull();
  });

  it('falls back through category and org pour like depletion does', () => {
    const item: CostRef = { matchKey: 'x', costPrice: 30, bottleSizeMl: 750, pourSizeOz: null };
    expect(costPerDrink(item, { orgPourOz: 1 })).toBeCloseTo(30 * (1 * 29.5735) / 750, 4);
    expect(costPerDrink(item, { categoryPourOz: 2, orgPourOz: 1 })).toBeCloseTo(30 * (2 * 29.5735) / 750, 4);
  });
});

describe('computeItemMargins', () => {
  const costs = new Map([
    ['well vodka', spirit('well vodka', 6.68)],
    ['michelob ultra', whole('michelob ultra', 2.15)],
    ['titos', spirit('titos', null)],
  ]);

  it('aggregates the same item across days', () => {
    const rows = computeItemMargins(
      [line('well vodka', 100, 500, 'Vodka', '2026-08-18'), line('well vodka', 50, 250, 'Vodka', '2026-08-19')],
      costs,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].unitsSold).toBe(150);
    expect(rows[0].revenue).toBe(750);
  });

  it('costs a spirit by the pour, not by the bottle', () => {
    const [row] = computeItemMargins([line('well vodka', 100, 500)], costs);
    expect(row.cost).toBeCloseTo(19.76, 1);
    expect(row.margin).toBeCloseTo(480.24, 1);
    expect(row.marginPct).toBeCloseTo(96.0, 0);
    expect(row.costKnown).toBe(true);
  });

  it('reports no margin rather than a perfect one when cost is unknown', () => {
    const [row] = computeItemMargins([line('titos', 10, 75)], costs);
    expect(row.costKnown).toBe(false);
    expect(row.margin).toBeNull();
    expect(row.marginPct).toBeNull();
    expect(row.cost).toBe(0);
  });

  it('treats an item absent from inventory as unknown, not free', () => {
    const [row] = computeItemMargins([line('mystery shot', 5, 25)], costs);
    expect(row.costKnown).toBe(false);
    expect(row.margin).toBeNull();
  });

  it('does not divide by zero on a comped item', () => {
    const [row] = computeItemMargins([line('well vodka', 3, 0)], costs);
    expect(row.marginPct).toBeNull();
  });

  it('is empty for an empty period rather than throwing', () => {
    expect(computeItemMargins([], costs)).toEqual([]);
  });
});

describe('groupByCategory', () => {
  const costs = new Map([
    ['well vodka', spirit('well vodka', 6.68)],
    ['titos', spirit('titos', null)],
    ['michelob ultra', whole('michelob ultra', 2.15)],
  ]);
  const lines = [
    line('well vodka', 100, 500, 'Vodka'),
    line('titos', 10, 75, 'Vodka'),
    line('michelob ultra', 200, 800, 'Draft Beer'),
  ];

  it('rolls revenue and cost up per category, biggest first', () => {
    const cats = groupByCategory(computeItemMargins(lines, costs));
    expect(cats.map((c) => c.category)).toEqual(['Draft Beer', 'Vodka']);
    expect(cats[0].revenue).toBe(800);
    expect(cats[0].cost).toBeCloseTo(430, 0);
  });

  it('counts the items whose cost is missing, so a margin can be distrusted', () => {
    const vodka = groupByCategory(computeItemMargins(lines, costs)).find((c) => c.category === 'Vodka')!;
    expect(vodka.itemCount).toBe(2);
    expect(vodka.itemsMissingCost).toBe(1);
    // Titos revenue is counted, its cost is not — so this margin is overstated
    // and the flag above is the only thing that says so.
    expect(vodka.revenue).toBe(575);
  });

  it('buckets a missing category rather than dropping the sale', () => {
    const cats = groupByCategory(computeItemMargins([line('well vodka', 1, 5, null)], costs));
    expect(cats[0].category).toBe('Uncategorised');
  });
});

describe('summariseSales', () => {
  const costs = new Map([
    ['well vodka', spirit('well vodka', 6.68)],
    ['titos', spirit('titos', null)],
  ]);

  it('totals the period and says how much of it is untrustworthy', () => {
    const s = summariseSales(computeItemMargins(
      [line('well vodka', 100, 500), line('titos', 10, 75)], costs,
    ));
    expect(s.revenue).toBe(575);
    expect(s.unitsSold).toBe(110);
    expect(s.itemsMissingCost).toBe(1);
    expect(s.revenueMissingCost).toBe(75);
  });

  it('reports an empty period as zero, not NaN', () => {
    const s = summariseSales([]);
    expect(s.revenue).toBe(0);
    expect(s.marginPct).toBeNull();
  });
});

describe('revenueTrend', () => {
  const costs = new Map([['well vodka', spirit('well vodka', 6.68)]]);

  it('returns a point per day, oldest first', () => {
    const t = revenueTrend([
      line('well vodka', 10, 50, 'Vodka', '2026-08-19'),
      line('well vodka', 10, 50, 'Vodka', '2026-08-17'),
    ], costs);
    expect(t.map((p) => p.date)).toEqual(['2026-08-17', '2026-08-19']);
  });

  it('costs each day on its own mix rather than a period average', () => {
    const mixed = new Map([
      ['well vodka', spirit('well vodka', 6.68)],
      ['michelob ultra', whole('michelob ultra', 2.15)],
    ]);
    const t = revenueTrend([
      line('well vodka', 100, 500, 'Vodka', '2026-08-18'),
      line('michelob ultra', 100, 400, 'Draft Beer', '2026-08-19'),
    ], mixed);
    // A spirits night and a beer night do not earn the same margin, and
    // averaging them would hide exactly that.
    expect(t[0].margin).toBeGreaterThan(t[1].margin);
  });

  it('counts revenue from an uncosted item but adds no cost for it', () => {
    const t = revenueTrend([line('unknown', 5, 100, 'Shots', '2026-08-19')], costs);
    expect(t[0].revenue).toBe(100);
    expect(t[0].cost).toBe(0);
  });
});

describe('rankByMargin', () => {
  const costs = new Map([
    ['shot', whole('shot', 1)],
    ['beer', whole('beer', 4)],
    ['nocost', whole('nocost', null)],
  ]);
  // A 90% shot that barely sells, against a 60% beer that moves all night.
  const items = computeItemMargins([
    line('shot', 10, 100, 'Shots'),
    line('beer', 500, 5000, 'Draft Beer'),
    line('nocost', 50, 400, 'Shots'),
  ], costs);

  it('ranks the most profitable pour first by percentage', () => {
    expect(rankByMargin(items, 'pct')[0].matchKey).toBe('shot');
  });

  it('ranks the biggest earner first by total margin', () => {
    // The whole reason both views exist.
    expect(rankByMargin(items, 'total')[0].matchKey).toBe('beer');
  });

  it('leaves out items with no cost, which have no margin to rank', () => {
    expect(rankByMargin(items, 'pct').map((i) => i.matchKey)).not.toContain('nocost');
  });
});

describe('flagThinMargins', () => {
  const costs = new Map([
    ['loss leader', whole('loss leader', 6)],
    ['thin', whole('thin', 8)],
    ['healthy', whole('healthy', 1)],
    ['nocost', whole('nocost', null)],
  ]);
  const items = computeItemMargins([
    line('loss leader', 10, 50, 'Shots'),   // costs 60, sells 50 -> loss
    line('thin', 10, 100, 'Shots'),         // 20% margin
    line('healthy', 10, 100, 'Shots'),      // 90% margin
    line('nocost', 10, 100, 'Shots'),
  ], costs);

  it('flags anything sold below cost', () => {
    const flags = flagThinMargins(items, 25);
    expect(flags.find((f) => f.item.matchKey === 'loss leader')!.severity).toBe('loss');
  });

  it('flags a thin margin against the configured threshold', () => {
    expect(flagThinMargins(items, 25).find((f) => f.item.matchKey === 'thin')!.severity)
      .toBe('below-threshold');
  });

  it('reports a loss even when the threshold is zero', () => {
    // Selling below cost is not a matter of preference.
    const flags = flagThinMargins(items, 0);
    expect(flags.map((f) => f.item.matchKey)).toEqual(['loss leader']);
  });

  it('leaves healthy items and uncosted items alone', () => {
    const keys = flagThinMargins(items, 25).map((f) => f.item.matchKey);
    expect(keys).not.toContain('healthy');
    expect(keys).not.toContain('nocost');
  });

  it('puts the worst offender first', () => {
    expect(flagThinMargins(items, 25)[0].item.matchKey).toBe('loss leader');
  });
});

/**
 * A drink made from a recipe has no cost of its own — its cost is whatever it
 * is poured from. Reading `cost_price` off the phantom stock item reports every
 * carefully-configured cocktail as uncosted, which is the opposite of the truth.
 */
describe('recipeCostPerDrink', () => {
  const vodka = { costPrice: 7.5, bottleSizeMl: 1000, pourSizeOz: null };
  const tsec = { costPrice: 12.0, bottleSizeMl: 1000, pourSizeOz: null };

  it('sums the poured ingredients, converted through each bottle', () => {
    // 0.24oz of a $7.50 litre is 0.24*29.5735/1000 * 7.50 = $0.0532
    const cost = recipeCostPerDrink({
      matchKey: 'lemon drop',
      components: [
        { quantity: 0.24, unit: 'oz', item: vodka },
        { quantity: 0.24, unit: 'oz', item: tsec },
      ],
    });
    expect(cost).toBeCloseTo(0.0532 + 0.0852, 3);
  });

  it('treats an each component as whole stock units', () => {
    // A bucket of 5 bottles is 5 bottles, not 5 ounces.
    const beer = { costPrice: 1.2, bottleSizeMl: null, pourSizeOz: null };
    expect(recipeCostPerDrink({
      matchKey: 'bucket',
      components: [{ quantity: 5, unit: 'each', item: beer }],
    })).toBeCloseTo(6.0);
  });

  it('is null when ANY ingredient has no cost', () => {
    // Half a recipe priced would report a cost lower than the truth, which is
    // worse than reporting none: it looks like a healthy margin.
    expect(recipeCostPerDrink({
      matchKey: 'lemon drop',
      components: [
        { quantity: 0.24, unit: 'oz', item: vodka },
        { quantity: 0.24, unit: 'oz', item: { costPrice: null, bottleSizeMl: 1000, pourSizeOz: null } },
      ],
    })).toBeNull();
  });

  it('is null for a recipe with no ingredients at all', () => {
    expect(recipeCostPerDrink({ matchKey: 'empty', components: [] })).toBeNull();
  });

  it('is null when an oz component has no container size to convert through', () => {
    // 0.5 "bottles" instead of half an ounce is wrong by about fifty times.
    expect(recipeCostPerDrink({
      matchKey: 'x',
      components: [{ quantity: 0.5, unit: 'oz', item: { costPrice: 20, bottleSizeMl: null, pourSizeOz: null } }],
    })).toBeNull();
  });
});

describe('computeItemMargins with recipes', () => {
  const costs = new Map([['lemon drop', spirit('lemon drop', null)]]);
  const recipes = new Map([
    ['lemon drop', {
      matchKey: 'lemon drop',
      components: [
        { quantity: 0.24, unit: 'oz' as const, item: { costPrice: 7.5, bottleSizeMl: 1000, pourSizeOz: null } },
        { quantity: 0.24, unit: 'oz' as const, item: { costPrice: 12.0, bottleSizeMl: 1000, pourSizeOz: null } },
      ],
    }],
  ]);

  it('costs a recipe drink from its ingredients, not its phantom stock row', () => {
    const [row] = computeItemMargins([line('lemon drop', 100, 400, 'Shots')], costs, {}, recipes);
    expect(row.costKnown).toBe(true);
    expect(row.costPerDrink).toBeCloseTo(0.1384, 3);
    expect(row.cost).toBeCloseTo(13.84, 1);
  });

  it('prefers the recipe over a cost price set on the item itself', () => {
    // If it has a recipe, the recipe is what it is made of. A cost_price on the
    // phantom row is left over from before it was given one.
    const withOwn = new Map([['lemon drop', spirit('lemon drop', 99)]]);
    const [row] = computeItemMargins([line('lemon drop', 10, 40, 'Shots')], withOwn, {}, recipes);
    expect(row.costPerDrink).toBeCloseTo(0.1384, 3);
  });

  it('still reports unknown when the recipe has an unpriced ingredient', () => {
    const partial = new Map([['lemon drop', {
      matchKey: 'lemon drop',
      components: [{ quantity: 1, unit: 'oz' as const, item: { costPrice: null, bottleSizeMl: 1000, pourSizeOz: null } }],
    }]]);
    const [row] = computeItemMargins([line('lemon drop', 10, 40, 'Shots')], costs, {}, partial);
    expect(row.costKnown).toBe(false);
  });

  it('leaves plain items untouched', () => {
    const plain = new Map([['well vodka', spirit('well vodka', 6.68)]]);
    const [row] = computeItemMargins([line('well vodka', 100, 500)], plain, {}, recipes);
    expect(row.costPerDrink).toBeCloseTo(0.1976, 3);
  });
});

describe('topUncostedByRevenue', () => {
  const costs = new Map([
    ['priced', whole('priced', 1)],
    ['big gap', whole('big gap', null)],
    ['small gap', whole('small gap', null)],
  ]);
  const items = computeItemMargins([
    line('priced', 10, 900, 'Shots'),
    line('big gap', 10, 500, 'Shots'),
    line('small gap', 10, 20, 'Shots'),
  ], costs);

  it('lists only uncosted items, biggest revenue first', () => {
    expect(topUncostedByRevenue(items).map((i) => i.matchKey)).toEqual(['big gap', 'small gap']);
  });

  it('leaves out anything already costed, however large', () => {
    expect(topUncostedByRevenue(items).map((i) => i.matchKey)).not.toContain('priced');
  });

  it('respects the limit', () => {
    expect(topUncostedByRevenue(items, 1)).toHaveLength(1);
  });

  it('is empty when everything is costed', () => {
    const all = computeItemMargins([line('priced', 10, 900, 'Shots')], costs);
    expect(topUncostedByRevenue(all)).toEqual([]);
  });
});

describe('slowMovers', () => {
  const stocked = (matchKey: string, categoryName: string | null, currentStock: number | null, costPrice: number | null) =>
    ({ matchKey, itemName: matchKey, categoryName, currentStock, costPrice });

  const costs = new Map([['mover', whole('mover', 1)], ['crawler', whole('crawler', 1)]]);
  const sold = computeItemMargins([
    line('mover', 500, 2000, 'Beer'),
    line('crawler', 2, 20, 'Tequila'),
  ], costs);

  const shelf = [
    stocked('mover', 'Beer', 10, 2),
    stocked('crawler', 'Tequila', 3, 30),
    stocked('dead cheap', 'Gin', 2, 10),
    stocked('dead pricey', 'Tequila', 4, 50),
  ];

  it('includes items that never sold, which sales data alone cannot show', () => {
    // The whole point: these are absent from pos_item_sales entirely.
    const keys = slowMovers(sold, shelf).map((r) => r.matchKey);
    expect(keys).toContain('dead pricey');
    expect(keys).toContain('dead cheap');
  });

  it('puts never-sold ahead of merely slow', () => {
    const rows = slowMovers(sold, shelf);
    expect(rows[0].neverSold).toBe(true);
    expect(rows.at(-1)!.matchKey).toBe('mover');
  });

  it('ranks dead stock by money tied up, not alphabetically', () => {
    // $200 of dead tequila outranks $20 of dead gin.
    const rows = slowMovers(sold, shelf).filter((r) => r.neverSold);
    expect(rows[0].matchKey).toBe('dead pricey');
    expect(rows[0].stockValue).toBeCloseTo(200);
  });

  it('ranks the slow sellers by how little they moved', () => {
    const rows = slowMovers(sold, shelf).filter((r) => !r.neverSold);
    expect(rows.map((r) => r.matchKey)).toEqual(['crawler', 'mover']);
  });

  it('leaves out things that are never sold as drinks', () => {
    // Limes and straws correctly never ring up, and listing them answers
    // nothing about what to stop ordering.
    const withSupplies = [...shelf, stocked('limes', 'Garnishes & Food', 50, 0.2), stocked('straws', 'Supplies', 900, 0.01)];
    const keys = slowMovers(sold, withSupplies).map((r) => r.matchKey);
    expect(keys).not.toContain('limes');
    expect(keys).not.toContain('straws');
  });

  it('handles stock or cost being unknown without inventing a value', () => {
    const rows = slowMovers(sold, [stocked('mystery', 'Vodka', null, null)]);
    expect(rows[0].stockValue).toBeNull();
  });

  it('treats an item that sold zero units as never sold', () => {
    const zero = computeItemMargins([line('ghost', 0, 0, 'Vodka')], costs);
    expect(slowMovers(zero, [stocked('ghost', 'Vodka', 1, 5)])[0].neverSold).toBe(true);
  });

  it('respects the limit and copes with an empty shelf', () => {
    expect(slowMovers(sold, shelf, { limit: 2 })).toHaveLength(2);
    expect(slowMovers(sold, [])).toEqual([]);
  });
});

describe('slowMovers and recipe ingredients', () => {
  const stocked = (matchKey: string, categoryName: string | null, currentStock: number | null, costPrice: number | null) =>
    ({ matchKey, itemName: matchKey, categoryName, currentStock, costPrice });

  // "lemon drop" sells hard; the vodka and triple sec it is poured from never
  // ring up on their own.
  const costs = new Map([['lemon drop', whole('lemon drop', 1)]]);
  const sold = computeItemMargins([line('lemon drop', 450, 1800, 'Shots')], costs);
  const shelf = [
    stocked('lemon vodka', 'Vodka', 18.8, 7.5),
    stocked('triple sec', 'Spirits', 10, 12),
    stocked('genuinely dead', 'Gin', 4, 25),
  ];

  it('does not call a fast-moving recipe ingredient dead stock', () => {
    const keys = slowMovers(sold, shelf, { consumedByRecipe: new Set(['lemon vodka', 'triple sec']) }).map((r) => r.matchKey);
    expect(keys).not.toContain('lemon vodka');
    expect(keys).not.toContain('triple sec');
  });

  it('still surfaces stock that is genuinely dead', () => {
    const keys = slowMovers(sold, shelf, { consumedByRecipe: new Set(['lemon vodka', 'triple sec']) }).map((r) => r.matchKey);
    expect(keys).toEqual(['genuinely dead']);
  });

  it('lists an ingredient whose drink never sold — that one really is dead', () => {
    // No sales at all, so nothing is drawing on it.
    const keys = slowMovers([], shelf, {}).map((r) => r.matchKey);
    expect(keys).toContain('lemon vodka');
  });

  it('behaves as before when no recipe set is supplied', () => {
    expect(slowMovers(sold, shelf).map((r) => r.matchKey)).toContain('lemon vodka');
  });
});
