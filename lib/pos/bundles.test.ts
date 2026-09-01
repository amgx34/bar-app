import { describe, it, expect } from 'vitest';
import { resolveSales, type AuditRow, type InventoryRef, type BundleRecipe } from './bundles';
import { buildTokenTable } from './variants';
import { ML_PER_OZ } from './pour';

/**
 * Turning POS lines into sales facts and stock depletion.
 *
 * The size-variant cases are the reason this file exists: "DBL TITO'S" is not
 * an item, it is two ounces of one, and getting that wrong is wrong twice over
 * — in the cost of the drink and in the stock it removes.
 */

// A 750ml bottle at a 1.5oz pour. About 16.9 singles.
const SHOT = (1.5 * ML_PER_OZ) / 750;

const titos: InventoryRef = {
  id: 'item-titos',
  bottleSizeMl: 750,
  pourSizeOz: 1.5,
  categoryPourOz: null,
};

const row = (item_name: string, qty_sold: number): AuditRow => ({
  sale_date: '2026-08-30',
  item_name,
  category_name: 'Spirits',
  qty_sold,
  net_sales: qty_sold * 8,
});

const inventory = (...refs: [string, InventoryRef][]) => new Map(refs);

const depleted = (
  rows: AuditRow[],
  items: Map<string, InventoryRef>,
  bundles: BundleRecipe[] = [],
) => resolveSales(rows, bundles, items, null).depletionByDate.get('2026-08-30');

describe('resolveSales — size variants', () => {
  it('a double deducts twice the pour of the base item', () => {
    const out = depleted([row("DBL TITO'S", 10)], inventory(["tito's", titos]));
    expect(out?.get('item-titos')).toBeCloseTo(10 * 2 * SHOT, 6);
  });

  it('a single deducts exactly one pour', () => {
    const out = depleted([row("SGL TITO'S", 10)], inventory(["tito's", titos]));
    expect(out?.get('item-titos')).toBeCloseTo(10 * SHOT, 6);
  });

  it('Red Bull variants pour the same as their plain counterparts', () => {
    // R is Red Bull, not rocks: it changes the mixer, never the liquor.
    const items = inventory(["tito's", titos]);
    const rsgl = depleted([row("RSGL TITO'S", 10)], items)?.get('item-titos');
    const sgl = depleted([row("SGL TITO'S", 10)], items)?.get('item-titos');
    const rdb = depleted([row("RDB TITO'S", 10)], items)?.get('item-titos');
    const dbl = depleted([row("DBL TITO'S", 10)], items)?.get('item-titos');

    expect(rsgl).toBeCloseTo(sgl!, 9);
    expect(rdb).toBeCloseTo(dbl!, 9);
  });

  it('does not deduct the Red Bull itself', () => {
    // Deliberate: a second item on the line is what pos_bundles models, and a
    // parallel mechanism would give the bar two places to configure one drink.
    const out = depleted(
      [row("RDB TITO'S", 5)],
      inventory(["tito's", titos], ['red bull', { ...titos, id: 'item-rb' }]),
    );
    expect(out?.get('item-rb')).toBeUndefined();
  });

  it('sums variants and plain sales onto the one base item', () => {
    const out = depleted(
      [row("TITO'S", 4), row("DBL TITO'S", 3), row("SGL TITO'S", 2)],
      inventory(["tito's", titos]),
    );
    // 4 plain + 3 doubles (6 pours) + 2 singles = 12 pours from one bottle line.
    expect(out?.size).toBe(1);
    expect(out?.get('item-titos')).toBeCloseTo(12 * SHOT, 6);
  });

  it('prefers the base item over an auto-created phantom on the variant name', () => {
    // Every install that has been syncing already has a phantom "DBL TITO'S"
    // inventory row. Preferring the exact match would make the feature a no-op
    // exactly where it is needed.
    const out = depleted(
      [row("DBL TITO'S", 10)],
      inventory(["tito's", titos], ["dbl tito's", { ...titos, id: 'item-phantom' }]),
    );
    expect(out?.get('item-titos')).toBeCloseTo(10 * 2 * SHOT, 6);
    expect(out?.get('item-phantom')).toBeUndefined();
  });

  it('falls back to the exact name when the base is not stocked', () => {
    // Never worse than before this feature existed.
    const out = depleted(
      [row("DBL TITO'S", 10)],
      inventory(["dbl tito's", { ...titos, id: 'item-variant' }]),
    );
    // Resolved exactly, so the item's own pour describes it and the multiplier
    // must NOT be applied a second time.
    expect(out?.get('item-variant')).toBeCloseTo(10 * SHOT, 6);
  });

  it('leaves a non-variant item completely unchanged', () => {
    const beer: InventoryRef = {
      id: 'item-bud', bottleSizeMl: 355, pourSizeOz: null, categoryPourOz: null,
    };
    const out = depleted([row('Bud Light', 24)], inventory(['bud light', beer]));
    expect(out?.get('item-bud')).toBe(24);
  });

  it('a bundle on the exact name still wins over the variant parse', () => {
    // A recipe is the whole drink already; re-multiplying it would be wrong.
    const bundles: BundleRecipe[] = [
      { match_key: "dbl tito's", components: [{ inventory_item_id: 'item-titos', quantity: 3, unit: 'oz' }] },
    ];
    const out = depleted([row("DBL TITO'S", 2)], inventory(["tito's", titos]), bundles);
    expect(out?.get('item-titos')).toBeCloseTo(2 * (3 * ML_PER_OZ) / 750, 6);
  });

  it('reports the variant name as unresolved when nothing matches', () => {
    const out = resolveSales([row("DBL MALORT", 3)], [], inventory(["tito's", titos]), null);
    expect(out.unresolvedNames).toEqual(['DBL MALORT']);
  });

  it('honours a bar\'s own token table', () => {
    const tokens = buildTokenTable([
      { token: 'trp', multiplier: 3, label: 'Triple', mixer: null },
    ]);
    const out = resolveSales(
      [row("TRP TITO'S", 10)], [], inventory(["tito's", titos]), null, tokens,
    );
    expect(out.depletionByDate.get('2026-08-30')?.get('item-titos'))
      .toBeCloseTo(10 * 3 * SHOT, 6);
  });
});

describe('resolveSales — facts', () => {
  it('keeps the variant as its own fact row, carrying the parse', () => {
    // match_key stays the variant so the per-size split survives; base_match_key
    // is what the sales report groups on.
    const out = resolveSales([row("DBL TITO'S", 10)], [], inventory(["tito's", titos]), null);
    expect(out.facts).toHaveLength(1);
    expect(out.facts[0]).toMatchObject({
      match_key: "dbl tito's",
      base_match_key: "tito's",
      size_token: 'dbl',
      qty_sold: 10,
    });
  });

  it('does not merge a single and a double into one fact', () => {
    const out = resolveSales(
      [row("DBL TITO'S", 3), row("SGL TITO'S", 7)], [], inventory(["tito's", titos]), null,
    );
    expect(out.facts).toHaveLength(2);
    expect(out.facts.map((f) => f.size_token).sort()).toEqual(['dbl', 'sgl']);
    // Both still point at one item for the rollup.
    expect(new Set(out.facts.map((f) => f.base_match_key))).toEqual(new Set(["tito's"]));
  });

  it('sets base_match_key to the match key when there is no token', () => {
    // Always populated, so a read can group by it without a COALESCE.
    const out = resolveSales([row('Bud Light', 5)], [], inventory(), null);
    expect(out.facts[0].base_match_key).toBe('bud light');
    expect(out.facts[0].size_token).toBeNull();
  });

  it('keeps revenue on the line that actually rang up', () => {
    const out = resolveSales([row("DBL TITO'S", 10)], [], inventory(["tito's", titos]), null);
    expect(out.facts[0].net_sales).toBe(80);
    expect(out.facts[0].item_name).toBe("DBL TITO'S");
  });

  it('does not deplete a voided (negative) variant line', () => {
    const out = resolveSales(
      [{ ...row("DBL TITO'S", -4), net_sales: -32 }], [], inventory(["tito's", titos]), null,
    );
    expect(out.facts[0].net_sales).toBe(-32);
    expect(out.depletionByDate.size).toBe(0);
  });
});
