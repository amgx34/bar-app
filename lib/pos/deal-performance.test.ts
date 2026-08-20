import { describe, it, expect } from 'vitest';
import { computeDealPerformance, summariseDeals, type DealDefinition, type SalesFact } from './deal-performance';
import { componentUnits, unitsPerSale } from './pour';

/**
 * A deal is a bet: give up margin per unit to move more volume. Judging it needs
 * the component cost, and the component cost needs the recipe's UNIT.
 *
 * `quantity` here is stock units and pairs with `costPrice`, which is per stock
 * unit. `servings` is a count of drinks and pairs with `salePrice`, which is per
 * drink. Crossing those two pairs is the bug this file guards.
 */

const SPIRIT = { bottleSizeMl: 750, pourSizeOz: 1.5 };

const sale = (matchKey: string, qtySold: number, netSales: number, saleDate: string): SalesFact =>
  ({ matchKey, qtySold, netSales, saleDate });

/** A bucket of five domestic bottles at $20, costing $1.50 a bottle. */
const bucket: DealDefinition = {
  bundleId: 'b1',
  name: 'Bucket of 5 Domestic',
  matchKey: 'bucket of 5 domestic',
  isActive: true,
  components: [
    { inventoryItemId: 'beer', itemName: 'Domestic', quantity: 5, servings: 5, costPrice: 1.5, salePrice: 6 },
  ],
};

describe('computeDealPerformance — cost', () => {
  it('costs whole-unit components at the per-unit price', () => {
    const [d] = computeDealPerformance([bucket], [sale('bucket of 5 domestic', 10, 200, '2026-08-01')]);
    expect(d.costPerUnit).toBeCloseTo(7.5);   // 5 x $1.50
    expect(d.cost).toBeCloseTo(75);           // x 10 sold
    expect(d.margin).toBeCloseTo(125);        // $200 - $75
    expect(d.marginPct).toBeCloseTo(62.5);
  });

  it('costs a poured component at a fraction of a bottle, not at its ounces', () => {
    // The live bug: 1.5 oz of a $20 bottle was costed as 1.5 x $20 = $30
    // instead of ~$1.18, so every cocktail deal read as selling below cost.
    const stockUnits = componentUnits(1.5, 'oz', SPIRIT);
    const cocktail: DealDefinition = {
      bundleId: 'b2',
      name: 'Well Highball',
      matchKey: 'well highball',
      isActive: true,
      components: [
        { inventoryItemId: 'vodka', itemName: 'Well Vodka', quantity: stockUnits, costPrice: 20, salePrice: 9 },
      ],
    };

    const [d] = computeDealPerformance([cocktail], [sale('well highball', 100, 700, '2026-08-01')]);

    expect(d.costPerUnit).toBeCloseTo(1.18, 2);
    expect(d.costPerUnit!).toBeLessThan(2);
    expect(d.margin!).toBeGreaterThan(0);
    expect(d.verdict).not.toBe('low-margin');
  });

  it('withholds margin entirely when any component has no cost', () => {
    // A partial cost understates the cost and flatters the deal. Better to
    // report "cannot price this" than a number that is wrong in one direction.
    const unpriced: DealDefinition = {
      ...bucket,
      components: [{ ...bucket.components[0], costPrice: null }],
    };
    const [d] = computeDealPerformance([unpriced], [sale('bucket of 5 domestic', 10, 200, '2026-08-01')]);

    expect(d.costPerUnit).toBeNull();
    expect(d.margin).toBeNull();
    expect(d.marginPct).toBeNull();
    expect(d.componentsMissingCost).toEqual(['Domestic']);
    expect(d.verdict).toBe('no-cost');
  });
});

describe('computeDealPerformance — a la carte', () => {
  it('prices the components as DRINKS, not as stock units', () => {
    // 1.5oz of vodka is ~0.059 bottles but ONE drink. Using the stock figure
    // would value a $9 drink at 53 cents and report a nonsense discount.
    const stockUnits = componentUnits(1.5, 'oz', SPIRIT);
    const servings = stockUnits / unitsPerSale(SPIRIT);

    const cocktail: DealDefinition = {
      bundleId: 'b3',
      name: 'Well Highball',
      matchKey: 'well highball',
      isActive: true,
      components: [
        { inventoryItemId: 'vodka', itemName: 'Well Vodka', quantity: stockUnits, servings, costPrice: 20, salePrice: 9 },
      ],
    };

    const [d] = computeDealPerformance([cocktail], [sale('well highball', 100, 700, '2026-08-01')]);

    expect(servings).toBeCloseTo(1, 6);
    expect(d.alaCarteValue).toBeCloseTo(9, 2);
    // Sold at $7 against a $9 list: a 22% discount.
    expect(d.discountPct).toBeCloseTo(22.2, 1);
  });

  it('falls back to quantity when servings is absent, for whole-unit recipes', () => {
    const [d] = computeDealPerformance([bucket], [sale('bucket of 5 domestic', 10, 200, '2026-08-01')]);
    expect(d.alaCarteValue).toBeCloseTo(30);  // 5 x $6
    expect(d.discountPct).toBeCloseTo(33.3, 1);
  });

  it('withholds the comparison when any component has no sale price', () => {
    const noPrice: DealDefinition = {
      ...bucket,
      components: [{ ...bucket.components[0], salePrice: null }],
    };
    const [d] = computeDealPerformance([noPrice], [sale('bucket of 5 domestic', 10, 200, '2026-08-01')]);
    expect(d.alaCarteValue).toBeNull();
    expect(d.discountPct).toBeNull();
  });
});

describe('computeDealPerformance — verdicts', () => {
  it('will not judge a deal that has barely sold', () => {
    const [d] = computeDealPerformance([bucket], [sale('bucket of 5 domestic', 2, 40, '2026-08-01')]);
    expect(d.verdict).toBe('unproven');
  });

  it('flags a deal selling below cost', () => {
    const [d] = computeDealPerformance([bucket], [sale('bucket of 5 domestic', 10, 50, '2026-08-01')]);
    expect(d.margin!).toBeLessThan(0);
    expect(d.verdict).toBe('low-margin');
  });

  it('counts distinct days, so one item reported twice is not two nights', () => {
    const [d] = computeDealPerformance([bucket], [
      sale('bucket of 5 domestic', 5, 100, '2026-08-01'),
      sale('bucket of 5 domestic', 5, 100, '2026-08-01'),
    ]);
    expect(d.daysSold).toBe(1);
    expect(d.unitsSold).toBe(10);
  });

  it('reports zeroes rather than dividing by zero for a deal that never sold', () => {
    const [d] = computeDealPerformance([bucket], []);
    expect(d.unitsSold).toBe(0);
    expect(d.revenuePerUnit).toBe(0);
    expect(d.unitsPerDaySold).toBe(0);
    expect(d.verdict).toBe('unproven');
  });
});

describe('summariseDeals', () => {
  it('withholds the total margin when any selling deal is unpriced', () => {
    // One unpriced deal makes the total a lie rather than an estimate.
    const unpriced: DealDefinition = {
      ...bucket, bundleId: 'b9', matchKey: 'unpriced',
      components: [{ ...bucket.components[0], costPrice: null }],
    };
    const perf = computeDealPerformance(
      [bucket, unpriced],
      [sale('bucket of 5 domestic', 10, 200, '2026-08-01'), sale('unpriced', 10, 100, '2026-08-01')],
    );
    const s = summariseDeals(perf, 1000);

    expect(s.margin).toBeNull();
    expect(s.marginPct).toBeNull();
    expect(s.unitsSold).toBe(20);
  });

  it('reports the share of total POS revenue', () => {
    const perf = computeDealPerformance([bucket], [sale('bucket of 5 domestic', 10, 200, '2026-08-01')]);
    expect(summariseDeals(perf, 1000).shareOfRevenuePct).toBeCloseTo(20);
  });

  it('returns null share rather than dividing by zero revenue', () => {
    const perf = computeDealPerformance([bucket], []);
    expect(summariseDeals(perf, 0).shareOfRevenuePct).toBeNull();
  });
});
