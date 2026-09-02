import { describe, it, expect } from 'vitest';
import {
  isMixedDrinkCategory,
  isPouredCategory,
  classifyGap,
  findSetupGaps,
  summariseGaps,
  type InventoryRef,
  type SoldItem,
} from './setup-gaps';

/**
 * Built from Scotty's real 2026-08-19 data, where every one of these cases is
 * live: Well Vodka trying to remove 140 bottles, Lemon Drop sitting in stock as
 * a phantom, and beer that is genuinely fine.
 */

const sold = (
  itemName: string,
  categoryName: string | null,
  qtySold = 1,
  revenue = 0,
): SoldItem => ({ itemName, matchKey: itemName.toLowerCase(), categoryName, qtySold, revenue });

const inv = (
  matchKey: string,
  bottleSizeMl: number | null = null,
  resolvedPourOz: number | null = null,
): [string, InventoryRef] => [matchKey, { matchKey, bottleSizeMl, resolvedPourOz }];

const NOTHING = new Map<string, InventoryRef>();
const NO_RECIPES = new Set<string>();

describe('classifyGap', () => {
  it('flags a poured spirit with no container size', () => {
    // The Well Vodka case: 140 sales tried to remove 140 bottles.
    const { kind, detail } = classifyGap(
      sold('Well Vodka', 'Vodka'),
      new Map([inv('well vodka')]),
      NO_RECIPES,
    );
    expect(kind).toBe('needs-pour-size');
    expect(detail).toMatch(/WHOLE bottle/);
  });

  it('flags a spirit that has a bottle but still no pour', () => {
    // Half-configured is still broken, and looks configured at a glance.
    expect(
      classifyGap(sold('Jameson', 'Whiskey/Bourbon'), new Map([inv('jameson', 750)]), NO_RECIPES).kind,
    ).toBe('needs-pour-size');
  });

  it('passes a fully configured spirit', () => {
    expect(
      classifyGap(sold('Jameson', 'Whiskey/Bourbon'), new Map([inv('jameson', 750, 1.5)]), NO_RECIPES).kind,
    ).toBe('ok');
  });

  it('flags a cocktail held as its own stock item', () => {
    // The Lemon Drop case: depletes a phantom, so the vodka never moves.
    const { kind, detail } = classifyGap(
      sold('Lemon Drop', 'Shots'),
      new Map([inv('lemon drop')]),
      NO_RECIPES,
    );
    expect(kind).toBe('needs-recipe');
    expect(detail).toMatch(/never moves/);
  });

  it('flags an item with nothing in inventory at all', () => {
    expect(classifyGap(sold('Trashcan', 'Cocktails'), NOTHING, NO_RECIPES).kind).toBe('unmapped');
  });

  it('passes anything that already has a recipe, whatever its category', () => {
    // Once it is a recipe it depletes real bottles and the category stops
    // telling us anything.
    const recipes = new Set(['lemon drop']);
    expect(classifyGap(sold('Lemon Drop', 'Shots'), NOTHING, recipes).kind).toBe('ok');
    expect(classifyGap(sold('Lemon Drop', 'Shots'), new Map([inv('lemon drop')]), recipes).kind).toBe('ok');
  });

  it('passes packaged beer and seltzers, which are correctly sold whole', () => {
    // Draft is deliberately NOT in this list: a keg is poured by the glass, so
    // it belongs with the spirits, not with the sealed units. See the draft
    // block below.
    for (const cat of ['Bottle Beer', 'Seltzers & Cans', 'Canned Beer']) {
      expect(classifyGap(sold('Michelob Ultra', cat), new Map([inv('michelob ultra')]), NO_RECIPES).kind)
        .toBe('ok');
    }
  });

  it('reads categories case-insensitively and as substrings', () => {
    // Bars name their own categories: "Whiskey/Bourbon", "Well Liquor".
    for (const cat of ['WHISKEY/BOURBON', 'Well Liquor', 'premium tequila']) {
      expect(classifyGap(sold('X', cat), new Map([inv('x')]), NO_RECIPES).kind)
        .toBe('needs-pour-size');
    }
  });

  it('does not guess when the category is missing', () => {
    // No category means no signal. Claiming a problem here would send the
    // operator to fix something that may be perfectly fine.
    expect(classifyGap(sold('Mystery', null), new Map([inv('mystery')]), NO_RECIPES).kind).toBe('ok');
  });
});

describe('findSetupGaps', () => {
  const inventory = new Map([
    inv('well vodka'),
    inv('lemon drop'),
    inv('michelob ultra'),
    inv('jameson', 750, 1.5),
  ]);

  const items = [
    sold('Michelob Ultra', 'Bottle Beer', 31),
    sold('Lemon Drop', 'Shots', 32),
    sold('Trashcan', 'Cocktails', 2),
    sold('Well Vodka', 'Vodka', 140),
    sold('Jameson', 'Whiskey/Bourbon', 2),
  ];

  it('puts the most damaging problem first, not the biggest seller', () => {
    const gaps = findSetupGaps(items, inventory, NO_RECIPES);
    expect(gaps[0].itemName).toBe('Well Vodka');
    expect(gaps[0].kind).toBe('needs-pour-size');
  });

  it('puts an unsized keg above an unsized spirit', () => {
    // Same mistake, different magnitude: a whole bottle is ~17 servings lost,
    // a whole keg is ~124. The keg is the one to fix first even when it sells
    // less.
    const gaps = findSetupGaps(
      [sold('Well Vodka', 'Vodka', 500), sold('Bud Light', 'Draft Beer', 20)],
      new Map([inv('well vodka'), inv('bud light')]),
      NO_RECIPES,
    );
    expect(gaps[0].itemName).toBe('Bud Light');
    expect(gaps[0].kind).toBe('needs-keg-size');
  });

  it('ranks by volume within a severity band', () => {
    const gaps = findSetupGaps(
      [sold('A', 'Vodka', 5), sold('B', 'Vodka', 50)],
      new Map([inv('a'), inv('b')]),
      NO_RECIPES,
    );
    expect(gaps.map((g) => g.itemName)).toEqual(['B', 'A']);
  });

  it('sinks correctly-configured items to the bottom', () => {
    const gaps = findSetupGaps(items, inventory, NO_RECIPES);
    expect(gaps.at(-1)!.kind).toBe('ok');
  });

  it('returns every item, not only the broken ones', () => {
    // The operator needs to see that beer is fine, or they will wonder whether
    // it was simply missed.
    expect(findSetupGaps(items, inventory, NO_RECIPES)).toHaveLength(items.length);
  });

  it('is empty for an empty window rather than throwing', () => {
    expect(findSetupGaps([], inventory, NO_RECIPES)).toEqual([]);
  });
});

describe('summariseGaps', () => {
  it('counts each kind and the units flowing through broken items', () => {
    const inventory = new Map([inv('well vodka'), inv('lemon drop'), inv('michelob ultra')]);
    const gaps = findSetupGaps(
      [
        sold('Well Vodka', 'Vodka', 140),
        sold('Lemon Drop', 'Shots', 32),
        sold('Trashcan', 'Cocktails', 2),
        sold('Michelob Ultra', 'Bottle Beer', 31),
      ],
      inventory,
      NO_RECIPES,
    );
    const s = summariseGaps(gaps);

    expect(s.total).toBe(4);
    expect(s.needsPourSize).toBe(1);
    expect(s.needsRecipe).toBe(1);
    expect(s.unmapped).toBe(1);
    expect(s.ok).toBe(1);
    // 140 + 32 + 2 — the beer is fine and must not be counted as affected.
    expect(s.unitsAffected).toBe(174);
  });

  it('reports a fully configured bar as clean', () => {
    const gaps = findSetupGaps(
      [sold('Jameson', 'Whiskey/Bourbon', 2)],
      new Map([inv('jameson', 750, 1.5)]),
      NO_RECIPES,
    );
    const s = summariseGaps(gaps);
    expect(s.ok).toBe(1);
    expect(s.unitsAffected).toBe(0);
  });
});

/**
 * These two back the item form's "this looks like a mixed drink" callout as
 * well as the setup report. Exported precisely so the two cannot disagree —
 * a form that says an item is fine while the report flags it is worse than
 * either being wrong alone.
 */
describe('category classification', () => {
  it('recognises mixed drinks across the names bars actually use', () => {
    for (const c of ['Cocktails', 'Shots', 'SHOTS', 'Frozen Margarita', 'Bearcat Bombs', 'Party Punch']) {
      expect(isMixedDrinkCategory(c)).toBe(true);
    }
  });

  it('recognises poured spirits across the names bars actually use', () => {
    for (const c of ['Vodka', 'Whiskey/Bourbon', 'Well Liquor', 'premium tequila', 'Gin']) {
      expect(isPouredCategory(c)).toBe(true);
    }
  });

  it('leaves whole-unit categories alone', () => {
    // Flagging beer would put a false chore in front of the operator on every
    // edit, which is how a warning stops being read.
    for (const c of ['Draft Beer', 'Bottle Beer', 'Seltzers & Cans', 'Supplies', 'Wine']) {
      expect(isMixedDrinkCategory(c)).toBe(false);
      expect(isPouredCategory(c)).toBe(false);
    }
  });

  it('says nothing when there is no category', () => {
    expect(isMixedDrinkCategory(null)).toBe(false);
    expect(isPouredCategory(null)).toBe(false);
  });

  it('keeps the two kinds separate', () => {
    // A shot of vodka is poured; a Lemon Drop is mixed. Nothing should be both,
    // or the item form and the report would give contradictory advice.
    for (const c of ['Cocktails', 'Shots', 'Vodka', 'Whiskey/Bourbon']) {
      expect(isMixedDrinkCategory(c) && isPouredCategory(c)).toBe(false);
    }
  });
});

// ── Draft / keg sizing ───────────────────────────────────────────────────────
// Kegs were previously classified 'ok' — "sold whole, one sale removes one
// unit" — which is right for a canned beer and catastrophically wrong for a
// keg, where one sale is one pint of roughly 124.
describe('draft categories', () => {
  const sold = (categoryName: string | null) => ({
    itemName: 'Bud Light', matchKey: 'bud light', categoryName, qtySold: 400, revenue: 2400,
  });

  it('flags a keg with no size', () => {
    const inv = new Map([['bud light', { matchKey: 'bud light', bottleSizeMl: null, resolvedPourOz: null }]]);
    const { kind, detail } = classifyGap(sold('Draft Beer'), inv, new Set());
    expect(kind).toBe('needs-keg-size');
    expect(detail).toContain('WHOLE keg');
  });

  it('flags a keg that has a size but no pour', () => {
    const inv = new Map([['bud light', { matchKey: 'bud light', bottleSizeMl: 58670, resolvedPourOz: null }]]);
    expect(classifyGap(sold('Draft Beer'), inv, new Set()).kind).toBe('needs-keg-size');
  });

  it('passes a fully configured keg', () => {
    const inv = new Map([['bud light', { matchKey: 'bud light', bottleSizeMl: 58670, resolvedPourOz: 16 }]]);
    expect(classifyGap(sold('Draft Beer'), inv, new Set()).kind).toBe('ok');
  });

  it('matches the words a bar actually uses for a tap list', () => {
    const inv = new Map([['bud light', { matchKey: 'bud light', bottleSizeMl: null, resolvedPourOz: null }]]);
    for (const cat of ['Draft', 'Draught Beer', 'On Tap', 'Keg Beer']) {
      expect(classifyGap(sold(cat), inv, new Set()).kind).toBe('needs-keg-size');
    }
  });

  it('leaves canned and bottled beer alone', () => {
    // The line this whole design turns on: a sealed unit sold 1:1 is CORRECT,
    // and adding a conversion here would break what already works.
    const inv = new Map([['bud light', { matchKey: 'bud light', bottleSizeMl: null, resolvedPourOz: null }]]);
    for (const cat of ['Bottle Beer', 'Canned Seltzer', 'Beer', null]) {
      expect(classifyGap(sold(cat), inv, new Set()).kind).toBe('ok');
    }
  });
});
