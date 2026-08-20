import { describe, it, expect } from 'vitest';
import {
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

  it('passes beer and seltzers, which are correctly sold whole', () => {
    for (const cat of ['Draft Beer', 'Bottle Beer', 'Seltzers & Cans']) {
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
    sold('Michelob Ultra', 'Draft Beer', 31),
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
        sold('Michelob Ultra', 'Draft Beer', 31),
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
