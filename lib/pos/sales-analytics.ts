/**
 * What the bar sold, what it cost to pour, and what was left.
 *
 * Pure — no database, no clock.
 *
 * ── THE UNIT TRAP THIS FILE EXISTS TO CONTAIN ────────────────────────────────
 *
 * `pos_item_sales.qty_sold` counts DRINKS. `inventory_items.cost_price` is per
 * STOCK UNIT — a bottle, a keg, a can. Multiplying one by the other is the
 * single easiest way to get a wrong number here, and it is wrong by the number
 * of servings in a container: about 34x for a 1oz pour from a litre.
 *
 * So cost per drink is always cost_price * unitsPerSale(item), and unitsPerSale
 * is the same function depletion uses. A beer with no container size resolves
 * to 1 and costs what it costs; a spirit resolves to a fraction.
 *
 * ── MISSING COST IS NOT ZERO COST ────────────────────────────────────────────
 *
 * An item with no cost_price reports `costKnown: false` and contributes nothing
 * to the cost total, and the summary counts how many items are in that state.
 * Reporting those as $0 cost would show a 100% margin on the items the operator
 * has simply not finished configuring, which is worse than showing nothing: it
 * looks like good news.
 */
import { unitsPerSale, componentUnits, type PourItem, type PourDefaults } from './pour';

/** One row of what the POS reported, already aggregated per item per day. */
export type SoldLine = {
  matchKey: string;
  itemName: string;
  categoryName: string | null;
  /** DRINKS sold, not stock units. */
  qtySold: number;
  netSales: number;
  saleDate: string;
  /**
   * The item this line is really about, with any size token stripped — a
   * "DBL TITO'S" line carries "tito's". Equal to `matchKey` when the name has
   * no token, so grouping on it is unconditional.
   */
  baseMatchKey?: string;
  /** The size token on the name, or null. */
  sizeToken?: string | null;
  /** Pour multiplier for that token. A double is 2. Defaults to 1. */
  sizeMultiplier?: number;
  /** Display label for the token, e.g. 'Double'. */
  sizeLabel?: string | null;
};

/** One size a drink rang up as, within a rolled-up item row. */
export type SizeSplit = {
  /** Null for lines that carried no token at all. */
  token: string | null;
  label: string;
  /** Pour multiplier this size represents. */
  multiplier: number;
  /** Drinks sold at this size. */
  unitsSold: number;
  revenue: number;
};

/** What inventory knows about the thing that was sold. */
export type CostRef = PourItem & {
  matchKey: string;
  /** Per STOCK UNIT. Null when the operator has not entered one. */
  costPrice: number | null;
  /**
   * What inventory calls this item. Used to name a row that variants rolled up
   * into, so it reads "Tito's" rather than whichever of "DBL TITO'S" or
   * "SGL TITO'S" happened to be first.
   */
  itemName?: string;
};

export type ItemMargin = {
  matchKey: string;
  itemName: string;
  categoryName: string | null;
  /** Drinks sold, counting a double as ONE drink. */
  unitsSold: number;
  /**
   * Drinks sold weighted by pour, so a double counts as two. This is what cost
   * is computed from — `unitsSold` is the count a human recognises, this is the
   * quantity of liquor behind it.
   */
  pourUnitsSold: number;
  revenue: number;
  /**
   * How the sales split by size. One entry when the item never rang up as a
   * variant. Ordered by revenue, largest first.
   */
  sizes: SizeSplit[];
  /**
   * Cost of one drink at the BASE pour — a single. A double costs twice this.
   * Null when the item has no cost price.
   */
  costPerDrink: number | null;
  /** Total cost over the period. 0 when unknown — see costKnown before using. */
  cost: number;
  /** Null when cost is unknown, so callers cannot mistake it for a real margin. */
  margin: number | null;
  marginPct: number | null;
  costKnown: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Cost of a single drink, in money.
 *
 * Exported because the category rollup and the trend both need it and a second
 * copy would eventually disagree with this one.
 */
export function costPerDrink(cost: CostRef, defaults: PourDefaults = {}): number | null {
  if (cost.costPrice === null || !Number.isFinite(Number(cost.costPrice))) return null;
  return Number(cost.costPrice) * unitsPerSale(cost, defaults);
}

/** One ingredient of a recipe, with everything needed to price it. */
export type RecipeComponentRef = {
  quantity: number;
  /** 'each' is whole stock units; 'oz' is a measured pour and converts. */
  unit: 'each' | 'oz';
  item: PourItem & { costPrice: number | null };
};

export type RecipeRef = {
  matchKey: string;
  components: RecipeComponentRef[];
};

/**
 * What one sale of a recipe drink costs to pour.
 *
 * A drink built from a recipe has no cost of its own — reading `cost_price` off
 * its stock row gives NULL, because that row is a phantom the ingest created
 * from a POS name. Its real cost is the sum of what it is poured from.
 *
 * Returns null if ANY ingredient is unpriced. Costing the half that is known
 * would report a figure lower than the truth, and a too-low cost reads as a
 * healthy margin — the one direction an error here must never go.
 *
 * `componentUnits` is the same conversion depletion uses, so a recipe cannot
 * cost one thing here and deplete another.
 */
export function recipeCostPerDrink(recipe: RecipeRef): number | null {
  if (recipe.components.length === 0) return null;

  let total = 0;
  for (const c of recipe.components) {
    if (c.item.costPrice === null || !Number.isFinite(Number(c.item.costPrice))) return null;

    const units = componentUnits(Number(c.quantity), c.unit, c.item);
    // componentUnits returns 0 for an oz measure against an item with no
    // container size — unresolvable, not free.
    if (units <= 0) return null;

    total += units * Number(c.item.costPrice);
  }
  return total;
}

/**
 * The key a line reports under, and whether its size multiplier applies.
 *
 * This MUST mirror the resolution order in `resolveSales` (lib/pos/bundles.ts).
 * If the report groups a line differently from the way depletion spent it, the
 * sales screen and the stock ledger describe two different bars.
 *
 * The order, and why:
 *   1. A recipe on the exact name wins. A bundle already describes the whole
 *      drink, so it is its own row and its multiplier is spent inside the
 *      recipe, not on top of it.
 *   2. Otherwise a size variant rolls up to its base — but only when the base
 *      is a known item. Rolling onto a key nothing knows about would merge
 *      unrelated lines behind an item that does not exist.
 *   3. Otherwise the line stands on its own name, exactly as before.
 */
function resolveLineKey(
  line: SoldLine,
  costs: Map<string, CostRef>,
  recipes?: Map<string, RecipeRef>,
): { key: string; multiplier: number; rolledUp: boolean } {
  if (recipes?.has(line.matchKey)) {
    return { key: line.matchKey, multiplier: 1, rolledUp: false };
  }

  const base = line.baseMatchKey;
  if (line.sizeToken && base && base !== line.matchKey && costs.has(base)) {
    const m = Number(line.sizeMultiplier);
    return {
      key: base,
      multiplier: Number.isFinite(m) && m > 0 ? m : 1,
      rolledUp: true,
    };
  }

  return { key: line.matchKey, multiplier: 1, rolledUp: false };
}

/**
 * Folds POS lines into one row per item, with cost and margin attached.
 *
 * Lines are aggregated by matchKey, because pos_item_sales holds a row per
 * (day, item) and the question here is about the item over the period.
 *
 * Size variants collapse onto the item they are a size OF: "SGL TITO'S",
 * "DBL TITO'S" and "RDB TITO'S" become one Tito's row whose `sizes` says how
 * the night actually split. Revenue is untouched by that — it is summed from
 * the lines that really rang up — but cost is weighted by the pour, because two
 * ounces cost twice what one does.
 */
export function computeItemMargins(
  lines: SoldLine[],
  costs: Map<string, CostRef>,
  defaults: PourDefaults = {},
  recipes?: Map<string, RecipeRef>,
): ItemMargin[] {
  const byKey = new Map<string, ItemMargin>();
  // Size splits are accumulated separately so a token seen on several days
  // folds into one entry rather than one per line.
  const splits = new Map<string, Map<string, SizeSplit>>();

  for (const line of lines) {
    const { key, multiplier, rolledUp } = resolveLineKey(line, costs, recipes);
    const qty = Number(line.qtySold) || 0;
    const revenue = Number(line.netSales) || 0;

    const row = byKey.get(key);
    if (row) {
      row.unitsSold += qty;
      row.pourUnitsSold += qty * multiplier;
      row.revenue += revenue;
    } else {
      byKey.set(key, {
        matchKey: key,
        // A rolled-up row is named for the item, not for whichever variant of
        // it happened to be read first.
        itemName: rolledUp ? (costs.get(key)?.itemName ?? line.itemName) : line.itemName,
        // The category travels on the sale, so it is what the POS called it that
        // night — not what inventory calls it now.
        categoryName: line.categoryName,
        unitsSold: qty,
        pourUnitsSold: qty * multiplier,
        revenue,
        sizes: [],
        costPerDrink: null,
        cost: 0,
        margin: null,
        marginPct: null,
        costKnown: false,
      });
    }

    let bySize = splits.get(key);
    if (!bySize) {
      bySize = new Map<string, SizeSplit>();
      splits.set(key, bySize);
    }
    const token = rolledUp ? (line.sizeToken ?? null) : null;
    const sizeKey = token ?? '';
    const split = bySize.get(sizeKey);
    if (split) {
      split.unitsSold += qty;
      split.revenue += revenue;
    } else {
      bySize.set(sizeKey, {
        token,
        label: token ? (line.sizeLabel || token.toUpperCase()) : 'Standard',
        multiplier,
        unitsSold: qty,
        revenue,
      });
    }
  }

  for (const row of byKey.values()) {
    row.sizes = [...(splits.get(row.matchKey)?.values() ?? [])]
      .sort((a, b) => b.revenue - a.revenue);

    // A recipe wins over the item's own cost price. If a drink has a recipe,
    // the recipe IS what it is made of, and any cost_price sitting on the
    // phantom stock row predates it.
    const recipe = recipes?.get(row.matchKey);
    const ref = costs.get(row.matchKey);
    const per = recipe
      ? recipeCostPerDrink(recipe)
      : ref ? costPerDrink(ref, defaults) : null;

    if (per === null) continue; // stays costKnown: false

    row.costPerDrink = per;
    // Weighted by pour, not by drink count: 10 doubles cost what 20 singles do.
    row.cost = round2(per * row.pourUnitsSold);
    row.margin = round2(row.revenue - row.cost);
    row.marginPct = row.revenue > 0 ? (row.margin / row.revenue) * 100 : null;
    row.costKnown = true;
  }

  return [...byKey.values()];
}

export type CategoryMargin = {
  category: string;
  unitsSold: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number | null;
  itemCount: number;
  /** Items in this category with no cost price, so the margin understates. */
  itemsMissingCost: number;
};

/** Rolls items up by the category the POS reported on the sale. */
export function groupByCategory(items: ItemMargin[]): CategoryMargin[] {
  const byCat = new Map<string, CategoryMargin>();

  for (const item of items) {
    const key = item.categoryName?.trim() || 'Uncategorised';
    const row = byCat.get(key) ?? {
      category: key,
      unitsSold: 0, revenue: 0, cost: 0, margin: 0,
      marginPct: null, itemCount: 0, itemsMissingCost: 0,
    };
    row.unitsSold += item.unitsSold;
    row.revenue += item.revenue;
    row.cost += item.cost;
    row.itemCount += 1;
    if (!item.costKnown) row.itemsMissingCost += 1;
    byCat.set(key, row);
  }

  for (const row of byCat.values()) {
    row.revenue = round2(row.revenue);
    row.cost = round2(row.cost);
    row.margin = round2(row.revenue - row.cost);
    row.marginPct = row.revenue > 0 ? (row.margin / row.revenue) * 100 : null;
  }

  return [...byCat.values()].sort((a, b) => b.revenue - a.revenue);
}

export type SalesSummary = {
  unitsSold: number;
  revenue: number;
  cost: number;
  margin: number;
  marginPct: number | null;
  itemCount: number;
  /**
   * How much of the revenue came from items with no cost price. The margin
   * above is overstated by whatever those items actually cost, and this is the
   * number that says how much to distrust it.
   */
  revenueMissingCost: number;
  itemsMissingCost: number;
};

export function summariseSales(items: ItemMargin[]): SalesSummary {
  let unitsSold = 0, revenue = 0, cost = 0, revenueMissingCost = 0, itemsMissingCost = 0;

  for (const i of items) {
    unitsSold += i.unitsSold;
    revenue += i.revenue;
    cost += i.cost;
    if (!i.costKnown) { revenueMissingCost += i.revenue; itemsMissingCost += 1; }
  }

  revenue = round2(revenue);
  cost = round2(cost);
  const margin = round2(revenue - cost);

  return {
    unitsSold,
    revenue,
    cost,
    margin,
    marginPct: revenue > 0 ? (margin / revenue) * 100 : null,
    itemCount: items.length,
    revenueMissingCost: round2(revenueMissingCost),
    itemsMissingCost,
  };
}

/**
 * The uncosted items to price first, by how much revenue they explain.
 *
 * A bar with fifty gaps will not work through them alphabetically. Two missing
 * costs usually account for most of the distortion — at Scotty's, pricing one
 * bottle of triple sec would cost the two biggest sellers on the menu, because
 * both are Lemon Drops.
 */
export function topUncostedByRevenue(items: ItemMargin[], limit = 5): ItemMargin[] {
  return items
    .filter((i) => !i.costKnown)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, limit);
}

/** An item in stock, whether or not it sold. Needed to find the zero-sellers. */
export type StockedItem = {
  matchKey: string;
  itemName: string;
  categoryName: string | null;
  currentStock: number | null;
  costPrice: number | null;
};

export type SlowMover = {
  matchKey: string;
  itemName: string;
  categoryName: string | null;
  unitsSold: number;
  revenue: number;
  /** Did not ring up once in the window. The strongest "do not reorder" signal. */
  neverSold: boolean;
  currentStock: number | null;
  /** Money sitting on the shelf: stock x cost. Null when either is unknown. */
  stockValue: number | null;
};

/**
 * Categories whose items are not sold as drinks, so never appear in POS sales.
 *
 * Without this the list fills with limes, straws and soda guns — all of which
 * correctly never ring up, and none of which answer "what should I stop
 * ordering". Matched as substrings, case-insensitively, because bars name their
 * own categories.
 */
const NOT_SOLD_DIRECTLY = ['supply', 'supplies', 'garnish', 'mixer', 'food', 'soda'];

function isSellable(category: string | null): boolean {
  if (!category) return true;
  const c = category.toLowerCase();
  return !NOT_SOLD_DIRECTLY.some((n) => c.includes(n));
}

/**
 * What to stop ordering.
 *
 * Built from INVENTORY, not from sales. An item that sold nothing at all is
 * absent from pos_item_sales entirely, so ranking the sales rows ascending
 * finds the second-worst offenders and silently omits the worst ones.
 *
 * Ordered worst-first: never-sold before slow-selling, and within the
 * never-sold, the most money tied up first — a dead bottle of Clase Azul
 * matters more than a dead bottle of well gin.
 */
export function slowMovers(
  sold: ItemMargin[],
  stocked: StockedItem[],
  /**
   * An options object rather than positional arguments: `limit` was already the
   * third parameter, so adding another number-or-set in front of it silently
   * changed what every existing call meant.
   *
   * `consumedByRecipe` holds items used as ingredients by a drink that actually
   * sold. These NEVER appear in POS sales — nobody orders a triple sec — but
   * they are moving, often faster than anything on the menu. Listing them as
   * dead stock would tell the operator to stop ordering the very thing their
   * best seller is made of, which is the most expensive way to be wrong here.
   */
  opts: { consumedByRecipe?: Set<string>; limit?: number } = {},
): SlowMover[] {
  const consumedByRecipe = opts.consumedByRecipe ?? new Set<string>();
  const limit = opts.limit ?? 10;
  const soldByKey = new Map(sold.map((s) => [s.matchKey, s]));

  const rows: SlowMover[] = stocked
    .filter((it) => isSellable(it.categoryName) && !consumedByRecipe.has(it.matchKey))
    .map((it) => {
      const hit = soldByKey.get(it.matchKey);
      const stock = it.currentStock;
      const cost = it.costPrice;
      return {
        matchKey: it.matchKey,
        itemName: it.itemName,
        categoryName: it.categoryName,
        unitsSold: hit?.unitsSold ?? 0,
        revenue: hit?.revenue ?? 0,
        neverSold: !hit || hit.unitsSold <= 0,
        currentStock: stock,
        stockValue:
          stock !== null && cost !== null && Number.isFinite(stock) && Number.isFinite(cost)
            ? round2(stock * cost)
            : null,
      };
    });

  return rows
    .sort((a, b) => {
      if (a.neverSold !== b.neverSold) return a.neverSold ? -1 : 1;
      if (a.neverSold) return (b.stockValue ?? 0) - (a.stockValue ?? 0) || a.itemName.localeCompare(b.itemName);
      return a.unitsSold - b.unitsSold || a.itemName.localeCompare(b.itemName);
    })
    .slice(0, limit);
}

export type TrendPoint = { date: string; revenue: number; cost: number; margin: number };

/**
 * Revenue and margin per day, oldest first.
 *
 * Costed line by line rather than by applying the period's average margin to
 * each day — a night that sold mostly beer really did earn a different margin
 * from one that sold mostly spirits, and flattening that hides the thing the
 * chart is for.
 */
export function revenueTrend(
  lines: SoldLine[],
  costs: Map<string, CostRef>,
  defaults: PourDefaults = {},
  recipes?: Map<string, RecipeRef>,
): TrendPoint[] {
  const byDate = new Map<string, TrendPoint>();
  const perDrink = new Map<string, number | null>();

  for (const line of lines) {
    // Same resolution as computeItemMargins — including the size rollup — or
    // the chart and the table would disagree about the same night.
    const { key, multiplier } = resolveLineKey(line, costs, recipes);

    if (!perDrink.has(key)) {
      const recipe = recipes?.get(key);
      const ref = costs.get(key);
      perDrink.set(
        key,
        recipe ? recipeCostPerDrink(recipe) : ref ? costPerDrink(ref, defaults) : null,
      );
    }
    const point = byDate.get(line.saleDate) ?? { date: line.saleDate, revenue: 0, cost: 0, margin: 0 };
    point.revenue += Number(line.netSales) || 0;
    const per = perDrink.get(key);
    // Weighted by pour: a double costs twice a single on the same night.
    if (per !== null && per !== undefined) {
      point.cost += per * (Number(line.qtySold) || 0) * multiplier;
    }
    byDate.set(line.saleDate, point);
  }

  return [...byDate.values()]
    .map((p) => ({
      date: p.date,
      revenue: round2(p.revenue),
      cost: round2(p.cost),
      margin: round2(p.revenue - p.cost),
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Two different questions, deliberately kept apart.
 *
 * 'pct' asks which drinks are the most profitable to pour. 'total' asks which
 * ones actually made the bar its money. A shot with a 90% margin that sells
 * twice a week loses to a beer at 60% that moves all night, and an operator
 * shown only one of these will make the wrong call about the menu.
 *
 * Items with no known cost are excluded — they have no margin to rank.
 */
export function rankByMargin(items: ItemMargin[], by: 'pct' | 'total'): ItemMargin[] {
  return items
    .filter((i) => i.costKnown && i.marginPct !== null)
    .sort((a, b) =>
      by === 'pct'
        ? (b.marginPct ?? 0) - (a.marginPct ?? 0)
        : (b.margin ?? 0) - (a.margin ?? 0),
    );
}

export type MarginFlag = {
  item: ItemMargin;
  /** 'loss' outranks 'below-threshold' — it is a different kind of problem. */
  severity: 'loss' | 'below-threshold';
};

/**
 * Items sold at a loss, or below the margin the operator expects.
 *
 * A loss is reported whatever the threshold is: selling below cost is not a
 * matter of preference. Worst first, because the list is a work queue.
 */
export function flagThinMargins(items: ItemMargin[], minMarginPct: number): MarginFlag[] {
  const flags: MarginFlag[] = [];

  for (const item of items) {
    if (!item.costKnown || item.marginPct === null) continue;
    if ((item.margin ?? 0) < 0) flags.push({ item, severity: 'loss' });
    else if (item.marginPct < minMarginPct) flags.push({ item, severity: 'below-threshold' });
  }

  return flags.sort((a, b) => (a.item.marginPct ?? 0) - (b.item.marginPct ?? 0));
}
