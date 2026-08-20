import { describe, it, expect } from 'vitest';
import { unitsPerSale, resolvePourOz, componentUnits, describePour, ML_PER_OZ } from './pour';

/**
 * The conversion between what the POS sells and what leaves the shelf.
 *
 * This is the single most load-bearing arithmetic in the inventory pipeline: a
 * spirit sold 185 times used to remove 185 bottles instead of about eleven.
 * Everything downstream — stock levels, COGS, reorder alerts, deal margins —
 * inherits whatever this returns.
 */

// One 750ml bottle at a 1.5oz pour. About 16.9 shots.
const BOTTLE = { bottleSizeMl: 750, pourSizeOz: 1.5 };

describe('unitsPerSale', () => {
  it('deducts a fraction of a bottle for a poured spirit', () => {
    const units = unitsPerSale(BOTTLE);
    expect(units).toBeCloseTo((1.5 * ML_PER_OZ) / 750, 6);
    expect(units).toBeCloseTo(0.0591, 4);
  });

  it('the headline case: 185 shots is about 11 bottles, not 185', () => {
    const bottles = 185 * unitsPerSale(BOTTLE);
    expect(bottles).toBeCloseTo(10.94, 2);
    expect(bottles).toBeLessThan(12);
  });

  it('deducts one whole unit when nothing is poured', () => {
    // Bottled beer: a container size but no pour. One sale, one bottle.
    expect(unitsPerSale({ bottleSizeMl: 355, pourSizeOz: null })).toBe(1);
    expect(unitsPerSale({ bottleSizeMl: null, pourSizeOz: null })).toBe(1);
  });

  it('deducts one whole unit when a pour has no container to be a fraction of', () => {
    // A pour size alone cannot express a fraction. Inventing a bottle size
    // would fabricate the denominator of every deduction that follows.
    expect(unitsPerSale({ bottleSizeMl: null, pourSizeOz: 1.5 })).toBe(1);
  });

  it('never deducts more than one unit per sale', () => {
    // A pour bigger than its container is a data-entry error, not a 3x draw.
    expect(unitsPerSale({ bottleSizeMl: 100, pourSizeOz: 16 })).toBe(1);
  });

  it('falls back through item -> category -> organisation', () => {
    const noItemPour = { bottleSizeMl: 750, pourSizeOz: null };

    // The wine case: no item pour, but the category supplies 5oz.
    expect(unitsPerSale(noItemPour, { categoryPourOz: 5 }))
      .toBeCloseTo((5 * ML_PER_OZ) / 750, 6);

    // Org default when the category has none either.
    expect(unitsPerSale(noItemPour, { orgPourOz: 2 }))
      .toBeCloseTo((2 * ML_PER_OZ) / 750, 6);

    // The item's own pour wins over both.
    expect(unitsPerSale(BOTTLE, { categoryPourOz: 5, orgPourOz: 2 }))
      .toBeCloseTo((1.5 * ML_PER_OZ) / 750, 6);
  });

  it('treats a zero pour as unset, not as a pour of nothing', () => {
    // Zero would divide the bottle into infinite servings.
    expect(unitsPerSale({ bottleSizeMl: 750, pourSizeOz: 0 }, { categoryPourOz: 5 }))
      .toBeCloseTo((5 * ML_PER_OZ) / 750, 6);
  });
});

describe('resolvePourOz', () => {
  it('returns null when no level of the chain has a pour', () => {
    expect(resolvePourOz({ bottleSizeMl: 750, pourSizeOz: null })).toBeNull();
  });

  it('skips zero and negative values at every level', () => {
    expect(resolvePourOz(
      { bottleSizeMl: 750, pourSizeOz: 0 },
      { categoryPourOz: -1, orgPourOz: 1.5 },
    )).toBe(1.5);
  });
});

describe('componentUnits', () => {
  it("treats 'each' as whole stock units without conversion", () => {
    // A bucket of five bottles is five bottles. Putting that through the pour
    // conversion would turn a bucket into a fifth of a bottle.
    expect(componentUnits(5, 'each', { bottleSizeMl: 355, pourSizeOz: null })).toBe(5);
  });

  it("converts 'oz' through the container size", () => {
    // Half an ounce of a 750ml spirit — what makes a mixed drink expressible.
    expect(componentUnits(0.5, 'oz', BOTTLE)).toBeCloseTo((0.5 * ML_PER_OZ) / 750, 6);
  });

  it("returns 0 for an 'oz' component with no container size", () => {
    // Falling back to the raw quantity would read "0.5 oz" as "0.5 bottles",
    // wrong by a factor of about fifty.
    expect(componentUnits(0.5, 'oz', { bottleSizeMl: null, pourSizeOz: null })).toBe(0);
  });

  it('returns 0 for a non-positive or unusable quantity', () => {
    expect(componentUnits(0, 'each', BOTTLE)).toBe(0);
    expect(componentUnits(-2, 'each', BOTTLE)).toBe(0);
    expect(componentUnits(Number.NaN, 'each', BOTTLE)).toBe(0);
  });
});

describe('describePour', () => {
  it('reports where the pour came from, so a surprise can be traced', () => {
    expect(describePour(BOTTLE).source).toBe('item');
    expect(describePour({ bottleSizeMl: 750, pourSizeOz: null }, { categoryPourOz: 5 }).source)
      .toBe('category');
    expect(describePour({ bottleSizeMl: 750, pourSizeOz: null }, { orgPourOz: 2 }).source)
      .toBe('organisation');
    expect(describePour({ bottleSizeMl: 750, pourSizeOz: null }).source).toBe('none');
  });

  it('warns about a pour with no container size', () => {
    // The real misconfiguration: it looks configured but deducts whole bottles.
    const d = describePour({ bottleSizeMl: null, pourSizeOz: 1.5 });
    expect(d.warning).toMatch(/no container size/i);
    expect(d.unitsPerSale).toBe(1);
  });

  it('warns when the pour is larger than the container', () => {
    expect(describePour({ bottleSizeMl: 100, pourSizeOz: 16 }).warning)
      .toMatch(/larger than the container/i);
  });

  it('agrees with unitsPerSale, since the UI explains what depletion does', () => {
    // The whole reason describePour exists. If these ever disagree, the item
    // form is describing arithmetic the ingest route is not performing.
    for (const item of [
      BOTTLE,
      { bottleSizeMl: 355, pourSizeOz: null },
      { bottleSizeMl: null, pourSizeOz: 1.5 },
      { bottleSizeMl: 1000, pourSizeOz: 2 },
    ]) {
      expect(describePour(item).unitsPerSale).toBe(unitsPerSale(item));
    }
  });

  it('reports servings per unit consistently with units per sale', () => {
    const d = describePour(BOTTLE);
    expect(d.servingsPerUnit).not.toBeNull();
    expect(d.servingsPerUnit! * d.unitsPerSale).toBeCloseTo(1, 6);
  });
});
