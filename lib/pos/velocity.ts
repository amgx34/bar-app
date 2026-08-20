/**
 * How fast stock actually leaves the building.
 *
 * There are two ways an item disappears, and the app has historically only
 * counted one of them:
 *
 *   1. It was SOLD.    Recorded in `pos_item_sales` by the POS agent.
 *   2. It was LOST.    Spillage, comps, staff drinks — recorded in `usage_logs`
 *                      when somebody remembers to log it.
 *
 * "Top movers" read only (2), which is why it was empty: a bar that syncs its
 * POS and does not hand-log spillage has no rows there at all. Meanwhile the
 * sales data sat in `pos_item_sales` unused.
 *
 * Velocity here is the sum of both, which is correct in both worlds:
 *
 *   - depletion off: sales + hand-logged losses
 *   - depletion on:  the same, because `pos_sale` rows are excluded from the
 *                    usage-log side rather than being added a second time
 *
 * That exclusion is the whole reason this cannot double-count. `pos_apply_item_sales`
 * writes a `pos_sale` usage log for every unit it deducts, so once depletion is
 * working the two sources describe the SAME movement — and only one of them may
 * be counted.
 *
 * THE TWO SOURCES ARE NOT IN THE SAME UNIT
 *
 * `pos_item_sales.qty_sold` counts DRINKS, straight off the POS and unconverted.
 * `usage_logs.quantity` counts STOCK, because the ingest route has already put
 * sales through `unitsPerSale()` before depleting. Adding them raw treats a shot
 * as a bottle.
 *
 * So the sales side is converted here, via the `unitsPerSale` carried on each
 * ItemRef, and everything this module reports downstream — unitsMoved,
 * dailyUsage — is in stock units. `salesCount` keeps the raw drink count for
 * the questions that are genuinely about the POS.
 */

/** Movements that represent stock ARRIVING or being corrected upward. */
const NON_CONSUMPTION = new Set(['delivery', 'pos_reversal']);

/**
 * Movements already accounted for by the sales feed. Counting a `pos_sale`
 * usage log alongside the `pos_item_sales` row it came from would report every
 * sold unit twice.
 */
const ALREADY_IN_SALES = new Set(['pos_sale']);

export type SalesFact = {
  matchKey: string;
  qtySold: number;
  netSales: number;
  saleDate: string;
};

export type UsageLogFact = {
  itemId: string;
  quantity: number;
  reason: string;
};

export type ItemRef = {
  id: string;
  name: string;
  /** Normalised name, matching how `pos_item_sales.match_key` is built. */
  matchKey: string;
  /**
   * Stock units consumed by ONE POS sale. Comes from `unitsPerSale()` in
   * lib/pos/pour.ts; 1 for anything not sold by the pour.
   *
   * This is not optional cosmetics. `pos_item_sales.qty_sold` counts DRINKS
   * while `usage_logs.quantity` counts STOCK, and this file adds the two
   * together. Without the factor a spirit poured at 1.5oz from a 750ml bottle
   * reported roughly seventeen times its real movement — which then divided
   * into `current_stock` to produce a "days remaining" seventeen times too
   * short, and reorder alerts for items nobody needed to reorder.
   */
  unitsPerSale?: number;
};

export type ItemVelocity = {
  itemId: string;
  name: string;
  /** Drinks rung up on the POS. The figure that pairs with `revenue`. */
  salesCount: number;
  /** STOCK units those sales consumed — bottles, not shots. */
  unitsSold: number;
  /** Revenue those sales brought in. */
  revenue: number;
  /** Stock units lost to spillage, comps and staff drinks. */
  unitsLost: number;
  /** Everything that left, in stock units: sold plus lost. */
  unitsMoved: number;
  /**
   * Average STOCK units leaving per day. Callers divide `current_stock` by this
   * to get days of cover, so it must be in the same unit as the stock level.
   */
  dailyUsage: number;
};

/**
 * Combines both sources into one per-item view.
 *
 * `windowDays` is the length of the reporting window, not the number of days
 * that had activity — dividing by active days would make an item that sold once
 * look like it sells one a day.
 */
export function computeVelocity(
  items: ItemRef[],
  sales: SalesFact[],
  usageLogs: UsageLogFact[],
  windowDays: number,
): ItemVelocity[] {
  const days = Math.max(1, windowDays);

  const soldByKey = new Map<string, { units: number; revenue: number }>();
  for (const s of sales) {
    const entry = soldByKey.get(s.matchKey) ?? { units: 0, revenue: 0 };
    entry.units += s.qtySold;
    entry.revenue += s.netSales;
    soldByKey.set(s.matchKey, entry);
  }

  const lostById = new Map<string, number>();
  for (const log of usageLogs) {
    if (NON_CONSUMPTION.has(log.reason)) continue;
    if (ALREADY_IN_SALES.has(log.reason)) continue;
    lostById.set(log.itemId, (lostById.get(log.itemId) ?? 0) + log.quantity);
  }

  return items
    .map((item) => {
      const sold = soldByKey.get(item.matchKey) ?? { units: 0, revenue: 0 };
      const lost = lostById.get(item.id) ?? 0;

      // Drinks -> stock units, before the two sources are added together. The
      // usage-log side is already in stock units, so only the sales side moves.
      const perSale = Number.isFinite(item.unitsPerSale) && (item.unitsPerSale ?? 0) > 0
        ? (item.unitsPerSale as number)
        : 1;
      const stockSold = sold.units * perSale;
      const moved = stockSold + lost;

      return {
        itemId: item.id,
        name: item.name,
        salesCount: sold.units,
        unitsSold: stockSold,
        revenue: sold.revenue,
        unitsLost: lost,
        unitsMoved: moved,
        dailyUsage: moved / days,
      };
    })
    .filter((v) => v.unitsMoved > 0)
    .sort((a, b) => b.unitsMoved - a.unitsMoved);
}

/**
 * Best sellers by DRINKS sold, not by stock consumed.
 *
 * Ranking on stock would put a keg above a top-shelf spirit that outsold it
 * many times over, because one keg is one stock unit and it empties slowly.
 * "What sells" is a question about the POS, so it is answered in POS units.
 */
export function topSellers(velocity: ItemVelocity[], limit = 10): ItemVelocity[] {
  return [...velocity]
    .filter((v) => v.salesCount > 0)
    .sort((a, b) => b.salesCount - a.salesCount)
    .slice(0, limit);
}

/**
 * Why the list is empty, in the operator's terms.
 *
 * An empty chart that says nothing is the bug being reported here — "no data"
 * gave no hint that the POS feed was the missing piece rather than the stock
 * levels, which is exactly the wrong place to go looking.
 */
export function emptyReason(hasSales: boolean, hasUsageLogs: boolean): string {
  if (!hasSales && !hasUsageLogs) {
    return 'No POS sales and no logged stock adjustments in this period. Movement is measured by what sells and what gets logged as lost — not by what is on the shelf.';
  }
  if (!hasSales) {
    return 'No POS sales recorded for this period. Only hand-logged adjustments are being counted.';
  }
  return 'No matching inventory items for the POS sales in this period — check that item names line up with your inventory.';
}
