/**
 * Converting what the POS sold into what left the shelf.
 *
 * Pure — no database, no clock.
 *
 * A bar counts vodka in bottles and sells it in shots. Depletion used to
 * subtract one stock unit per sale, so 185 shots of well vodka removed 185
 * bottles instead of roughly eleven. This is the arithmetic that closes that
 * gap, and it is the only place the conversion happens.
 */

/** Fluid ounces to millilitres. US fluid ounce, which is what pour sizes mean. */
export const ML_PER_OZ = 29.5735;

export type PourItem = {
  /** Millilitres in one stock unit — a 750ml bottle, a 58670ml keg. */
  bottleSizeMl: number | null;
  /** This item's own pour, overriding the category. */
  pourSizeOz: number | null;
};

export type PourDefaults = {
  /** Set on the item's category. */
  categoryPourOz?: number | null;
  /** Org-wide fallback from bar_settings. */
  orgPourOz?: number | null;
};

/**
 * The pour size that applies to an item.
 *
 * Item beats category beats organisation. Three levels because a bar sets one
 * number for spirits, then has a couple of pours that genuinely differ, and
 * making them fill in several hundred items to express that is how the feature
 * ends up unused.
 */
export function resolvePourOz(
  item: PourItem,
  defaults: PourDefaults = {},
): number | null {
  const candidates = [item.pourSizeOz, defaults.categoryPourOz, defaults.orgPourOz];
  for (const value of candidates) {
    const n = Number(value);
    // Zero is not a pour, it is an unset field that happens to be numeric.
    if (Number.isFinite(n) && n > 0) return n;
  }
  return null;
}

/**
 * Stock units consumed by ONE POS sale of this item.
 *
 * Returns 1 unless the item is genuinely sold by the pour — which needs BOTH a
 * pour size and a container size. A pour size alone cannot express a fraction
 * without knowing what it is a fraction of, and inventing a bottle size would
 * make up the denominator of every deduction that follows.
 *
 * So a bottle of beer (355ml, no pour) deducts 1. A spirit (750ml, 1.5oz pour)
 * deducts 0.059. A keg (58670ml, 16oz pour) deducts 0.008.
 */
export function unitsPerSale(item: PourItem, defaults: PourDefaults = {}): number {
  const pourOz = resolvePourOz(item, defaults);
  const bottleMl = Number(item.bottleSizeMl);

  if (pourOz === null || !Number.isFinite(bottleMl) || bottleMl <= 0) return 1;

  const units = (pourOz * ML_PER_OZ) / bottleMl;

  // A pour larger than its container is a data error, not a 3x deduction.
  // Clamped at one whole unit and surfaced by describePour below.
  return Math.min(units, 1);
}

/**
 * Stock units consumed by one bundle component per sale of the bundle.
 *
 * 'each' means whole stock units — a bucket of five bottles is five bottles,
 * and that is deliberately NOT put through the pour conversion, because the
 * component is already expressed in the unit the bar counts.
 *
 * 'oz' is a measured pour and does convert. That is what makes a mixed drink
 * expressible: half an ounce of five different spirits.
 */
export function componentUnits(
  quantity: number,
  unit: 'each' | 'oz',
  item: PourItem,
): number {
  const qty = Number(quantity);
  if (!Number.isFinite(qty) || qty <= 0) return 0;

  if (unit === 'each') return qty;

  const bottleMl = Number(item.bottleSizeMl);
  // An ounce measure against an item with no container size cannot be resolved.
  // Returning 0 rather than falling back to `qty` matters: treating "0.5 oz" as
  // "0.5 bottles" would be wrong by a factor of about fifty.
  if (!Number.isFinite(bottleMl) || bottleMl <= 0) return 0;

  return (qty * ML_PER_OZ) / bottleMl;
}

export type PourDescription = {
  /** Stock units per sale, as used by depletion. */
  unitsPerSale: number;
  /** Resolved pour, or null when the item is not sold by the pour. */
  pourOz: number | null;
  /** Where that pour came from, for showing in the UI. */
  source: 'item' | 'category' | 'organisation' | 'none';
  /** Roughly how many sales one stock unit covers. Null when not by the pour. */
  servingsPerUnit: number | null;
  /** Set when the configuration cannot be right. */
  warning: string | null;
};

/**
 * Everything the UI needs to explain a deduction, in one call.
 *
 * Exists so the settings screen and the inventory row show the SAME number
 * depletion will actually use — an explanation derived separately would drift
 * from the arithmetic it claims to describe.
 */
export function describePour(
  item: PourItem,
  defaults: PourDefaults = {},
): PourDescription {
  const pourOz = resolvePourOz(item, defaults);
  const bottleMl = Number(item.bottleSizeMl);
  const hasBottle = Number.isFinite(bottleMl) && bottleMl > 0;

  const source: PourDescription['source'] =
    Number(item.pourSizeOz) > 0 ? 'item'
      : Number(defaults.categoryPourOz) > 0 ? 'category'
        : Number(defaults.orgPourOz) > 0 ? 'organisation'
          : 'none';

  let warning: string | null = null;
  if (pourOz !== null && !hasBottle) {
    warning = 'Pour size set, but no container size — this still deducts one whole unit per sale.';
  } else if (pourOz !== null && hasBottle && (pourOz * ML_PER_OZ) > bottleMl) {
    warning = 'The pour is larger than the container. Check both figures.';
  }

  const units = unitsPerSale(item, defaults);

  return {
    unitsPerSale: units,
    pourOz,
    source: pourOz === null ? 'none' : source,
    servingsPerUnit: pourOz !== null && hasBottle ? bottleMl / (pourOz * ML_PER_OZ) : null,
    warning,
  };
}
