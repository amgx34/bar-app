/**
 * Which drinks the POS sells that inventory cannot actually account for.
 *
 * Pure — no database, no clock.
 *
 * THE PROBLEM THIS SURFACES
 *
 * The ingest auto-creates an `inventory_items` row for every unseen POS item
 * name. That is right for a bottle of beer and wrong for everything poured: a
 * bar selling "Lemon Drop" ends up with a stock item *called* Lemon Drop, which
 * depletes one phantom unit per sale while the vodka and triple sec it was
 * actually made from never move. A spirit with no pour size is worse — it
 * removes a whole bottle per shot.
 *
 * Neither failure is visible anywhere. Stock just drifts, and the weigh session
 * blames the staff.
 *
 * WHY CATEGORY IS THE SIGNAL
 *
 * The POS already sorts its menu into categories, and a bar's categories encode
 * exactly the distinction that matters: Vodka and Whiskey are poured from a
 * bottle, Cocktails and Shots are mixed from several, Draft and Bottle Beer are
 * sold whole. That is a far better guide than guessing from the item's name, and
 * it needs no configuration.
 *
 * The output is a work list, not a verdict on the bar. Every row says what is
 * wrong and what to do about it.
 */

/** What the operator needs to do about an item, worst first. */
export type GapKind =
  /** Sold, but nothing in inventory matches the name. Depletes nothing at all. */
  | 'unmapped'
  /** A poured spirit with no container size — removes a WHOLE bottle per sale. */
  | 'needs-pour-size'
  /** A mixed drink held as a stock item. Should be a recipe over real bottles. */
  | 'needs-recipe'
  /** Correctly configured, or correctly sold whole. Nothing to do. */
  | 'ok';

export type SetupGap = {
  itemName: string;
  categoryName: string | null;
  /** Units sold over the window — how much this gap is costing in movement. */
  qtySold: number;
  revenue: number;
  kind: GapKind;
  /** One sentence naming the consequence, in the operator's terms. */
  detail: string;
};

export type SoldItem = {
  itemName: string;
  matchKey: string;
  categoryName: string | null;
  qtySold: number;
  revenue: number;
};

export type InventoryRef = {
  matchKey: string;
  bottleSizeMl: number | null;
  /** Already resolved through item -> category -> org by the caller. */
  resolvedPourOz: number | null;
};

/**
 * Categories whose items are poured from a bottle and need a pour size.
 *
 * Matched as substrings and case-insensitively, because a bar names these
 * itself: "Whiskey/Bourbon", "Well Liquor" and "Tequila" all need to hit.
 */
const POURED = [
  'vodka', 'rum', 'tequila', 'whiskey', 'whisky', 'bourbon', 'gin', 'scotch',
  'liquor', 'spirit', 'cordial', 'brandy', 'cognac', 'mezcal',
];

/** Categories whose items are MIXED from several bottles, so need a recipe. */
const MIXED = ['cocktail', 'shot', 'martini', 'margarita', 'punch', 'bomb'];

function matchesAny(category: string | null, needles: string[]): boolean {
  if (!category) return false;
  const c = category.toLowerCase();
  return needles.some((n) => c.includes(n));
}

/**
 * Is this category poured from a bottle, so the item needs a pour size?
 *
 * Exported so the item form can ask the same question this report asks. Two
 * copies of the category lists would eventually disagree, and the disagreement
 * would show up as the setup report flagging an item the editor said was fine.
 */
export function isPouredCategory(category: string | null): boolean {
  return matchesAny(category, POURED);
}

/**
 * Is this category MIXED from several bottles, so it needs a recipe rather
 * than a cost per unit?
 */
export function isMixedDrinkCategory(category: string | null): boolean {
  return matchesAny(category, MIXED);
}

/**
 * Classifies one sold item.
 *
 * `hasRecipe` wins over everything: once a drink is a recipe it depletes real
 * bottles, and the category no longer tells us anything useful about it.
 */
export function classifyGap(
  sold: SoldItem,
  inventory: Map<string, InventoryRef>,
  recipeKeys: Set<string>,
): { kind: GapKind; detail: string } {
  if (recipeKeys.has(sold.matchKey)) {
    return { kind: 'ok', detail: 'Has a recipe — depletes its real ingredients.' };
  }

  const item = inventory.get(sold.matchKey);

  if (!item) {
    return {
      kind: 'unmapped',
      detail: 'Nothing in inventory matches this name, so selling it moves no stock at all.',
    };
  }

  // A mixed drink held as its own stock item. The row exists, so depletion
  // "works" — it just consumes a thing that does not exist.
  if (matchesAny(sold.categoryName, MIXED) && !item.bottleSizeMl) {
    return {
      kind: 'needs-recipe',
      detail: 'Held as its own stock item, so the liquor it is made from never moves. Give it a recipe.',
    };
  }

  if (matchesAny(sold.categoryName, POURED)) {
    if (!item.bottleSizeMl) {
      return {
        kind: 'needs-pour-size',
        detail: 'Poured spirit with no container size — every sale removes a WHOLE bottle.',
      };
    }
    if (!item.resolvedPourOz) {
      return {
        kind: 'needs-pour-size',
        detail: 'Has a bottle size but no pour, so it still removes a whole bottle per sale.',
      };
    }
    return { kind: 'ok', detail: 'Pour tracking configured.' };
  }

  // Beer, seltzers, cans, anything else: one sale, one unit is correct.
  return { kind: 'ok', detail: 'Sold whole — one sale removes one unit, which is correct.' };
}

/** Worst first, then by how much it sold — the order to actually work through. */
const SEVERITY: Record<GapKind, number> = {
  'needs-pour-size': 0,
  'unmapped': 1,
  'needs-recipe': 2,
  'ok': 3,
};

export function findSetupGaps(
  sold: SoldItem[],
  inventory: Map<string, InventoryRef>,
  recipeKeys: Set<string>,
): SetupGap[] {
  return sold
    .map((s) => {
      const { kind, detail } = classifyGap(s, inventory, recipeKeys);
      return {
        itemName: s.itemName,
        categoryName: s.categoryName,
        qtySold: s.qtySold,
        revenue: s.revenue,
        kind,
        detail,
      };
    })
    .sort(
      (a, b) =>
        SEVERITY[a.kind] - SEVERITY[b.kind] ||
        b.qtySold - a.qtySold ||
        a.itemName.localeCompare(b.itemName),
    );
}

export type GapSummary = {
  total: number;
  ok: number;
  needsPourSize: number;
  needsRecipe: number;
  unmapped: number;
  /** Units sold through items that are not depleting correctly. */
  unitsAffected: number;
};

export function summariseGaps(gaps: SetupGap[]): GapSummary {
  const count = (k: GapKind) => gaps.filter((g) => g.kind === k).length;
  return {
    total: gaps.length,
    ok: count('ok'),
    needsPourSize: count('needs-pour-size'),
    needsRecipe: count('needs-recipe'),
    unmapped: count('unmapped'),
    unitsAffected: gaps
      .filter((g) => g.kind !== 'ok')
      .reduce((sum, g) => sum + g.qtySold, 0),
  };
}
