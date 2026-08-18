/**
 * How each deal is actually performing.
 *
 * Pure — no database, no clock. The inputs are the raw POS sales facts, the
 * recipes, and item costs; the output is what an operator needs to decide
 * whether a deal is earning its place on the board.
 *
 * THE QUESTION THIS ANSWERS
 *
 * A deal is a bet: give up margin per unit to move more volume. The bet pays off
 * when the extra volume more than covers the discount, and it is a slow leak
 * when it does not. Bars almost never find out, because the POS reports the
 * deal's revenue and says nothing about what it cost to pour.
 *
 * Because a bundle carries a recipe, the cost IS knowable: sum the component
 * quantities at their own cost prices. That is the whole basis of this file.
 */

export type DealComponent = {
  inventoryItemId: string;
  itemName: string;
  /** Units of this item consumed per one sale of the deal. */
  quantity: number;
  /** Cost per unit. Null when the operator has not entered one. */
  costPrice: number | null;
  /** What the item sells for on its own. Null when not set — usually is. */
  salePrice: number | null;
};

export type DealDefinition = {
  bundleId: string;
  name: string;
  matchKey: string;
  isActive: boolean;
  components: DealComponent[];
};

/** One (day, item) row from `pos_item_sales`. */
export type SalesFact = {
  saleDate: string;
  matchKey: string;
  qtySold: number;
  netSales: number;
};

export type DealPerformance = {
  bundleId: string;
  name: string;
  isActive: boolean;

  unitsSold: number;
  revenue: number;
  /** Component cost of everything poured for this deal over the period. */
  cost: number;
  /** revenue - cost. Null when any component is missing a cost price. */
  margin: number | null;
  /** margin / revenue, 0-100. Null for the same reason. */
  marginPct: number | null;

  revenuePerUnit: number;
  costPerUnit: number | null;
  /** Days in the period on which this deal sold at all. */
  daysSold: number;
  unitsPerDaySold: number;

  /** Components with no cost price — the reason margin may be null. */
  componentsMissingCost: string[];

  /**
   * What the components would have fetched sold separately, when every one has
   * a sale price. Null otherwise, which is the common case: sale_price is
   * populated on very few items.
   */
  alaCarteValue: number | null;
  /** How much cheaper the deal is than buying the parts, 0-100. */
  discountPct: number | null;

  verdict: DealVerdict;
  verdictReason: string;
};

/**
 * A deliberately small vocabulary. An operator glancing at this page needs to
 * know which deals to leave alone and which to look at, not a score out of 100.
 */
export type DealVerdict =
  | 'strong'      // good margin, selling well
  | 'ok'          // paying its way
  | 'low-margin'  // sells, but thin or negative
  | 'slow'        // healthy margin, barely sells
  | 'unproven'    // not enough data yet
  | 'no-cost';    // cannot be judged: component costs missing

/** Below this, a deal is not really a deal — it is a menu item nobody orders. */
const SLOW_UNITS_PER_DAY = 1;
/** Under this margin a deal is giving away more than it brings in. */
const LOW_MARGIN_PCT = 20;
/** Fewer sold than this over the whole period and any verdict is noise. */
const MIN_UNITS_FOR_VERDICT = 5;

function judge(
  unitsSold: number,
  unitsPerDaySold: number,
  marginPct: number | null,
  missingCost: boolean,
): { verdict: DealVerdict; reason: string } {
  if (unitsSold < MIN_UNITS_FOR_VERDICT) {
    return {
      verdict: 'unproven',
      reason: `Only ${unitsSold} sold so far — too few to judge.`,
    };
  }

  // Checked after the volume test: "we cannot price this" is more useful than
  // "we cannot price this and it barely sold".
  if (missingCost || marginPct === null) {
    return {
      verdict: 'no-cost',
      reason: 'Add cost prices to the components to see whether this deal makes money.',
    };
  }

  if (marginPct < 0) {
    return {
      verdict: 'low-margin',
      reason: `Selling below cost — every one loses ${Math.abs(marginPct).toFixed(0)}% of its price.`,
    };
  }

  if (marginPct < LOW_MARGIN_PCT) {
    return {
      verdict: 'low-margin',
      reason: `${marginPct.toFixed(0)}% margin. Moving volume, but very little of it is profit.`,
    };
  }

  if (unitsPerDaySold < SLOW_UNITS_PER_DAY) {
    return {
      verdict: 'slow',
      reason: `Good margin at ${marginPct.toFixed(0)}%, but under one a day — it is not pulling people in.`,
    };
  }

  if (marginPct >= 50 && unitsPerDaySold >= SLOW_UNITS_PER_DAY * 3) {
    return {
      verdict: 'strong',
      reason: `${marginPct.toFixed(0)}% margin at ${unitsPerDaySold.toFixed(1)} a day — keep it.`,
    };
  }

  return {
    verdict: 'ok',
    reason: `${marginPct.toFixed(0)}% margin at ${unitsPerDaySold.toFixed(1)} a day.`,
  };
}

export function computeDealPerformance(
  deals: DealDefinition[],
  sales: SalesFact[],
): DealPerformance[] {
  const salesByKey = new Map<string, SalesFact[]>();
  for (const fact of sales) {
    const list = salesByKey.get(fact.matchKey);
    if (list) list.push(fact);
    else salesByKey.set(fact.matchKey, [fact]);
  }

  return deals
    .map((deal) => {
      const facts = salesByKey.get(deal.matchKey) ?? [];

      const unitsSold = facts.reduce((s, f) => s + f.qtySold, 0);
      const revenue = facts.reduce((s, f) => s + f.netSales, 0);
      // Distinct days, not row count — a POS that reports an item twice in one
      // day must not make the deal look like it sold on two nights.
      const daysSold = new Set(facts.filter((f) => f.qtySold > 0).map((f) => f.saleDate)).size;

      const componentsMissingCost = deal.components
        .filter((c) => c.costPrice === null)
        .map((c) => c.itemName);

      const costPerUnit =
        componentsMissingCost.length === 0
          ? deal.components.reduce((s, c) => s + c.quantity * (c.costPrice ?? 0), 0)
          : null;

      const cost = costPerUnit === null ? 0 : costPerUnit * unitsSold;
      const margin = costPerUnit === null ? null : revenue - cost;
      const marginPct =
        margin === null || revenue <= 0 ? null : (margin / revenue) * 100;

      const everyComponentPriced =
        deal.components.length > 0 && deal.components.every((c) => c.salePrice !== null);
      const alaCarteValue = everyComponentPriced
        ? deal.components.reduce((s, c) => s + c.quantity * (c.salePrice ?? 0), 0)
        : null;

      const revenuePerUnit = unitsSold > 0 ? revenue / unitsSold : 0;
      const discountPct =
        alaCarteValue && alaCarteValue > 0 && unitsSold > 0
          ? Math.max(0, (1 - revenuePerUnit / alaCarteValue) * 100)
          : null;

      const unitsPerDaySold = daysSold > 0 ? unitsSold / daysSold : 0;

      const { verdict, reason } = judge(
        unitsSold,
        unitsPerDaySold,
        marginPct,
        componentsMissingCost.length > 0,
      );

      return {
        bundleId: deal.bundleId,
        name: deal.name,
        isActive: deal.isActive,
        unitsSold,
        revenue,
        cost,
        margin,
        marginPct,
        revenuePerUnit,
        costPerUnit,
        daysSold,
        unitsPerDaySold,
        componentsMissingCost,
        alaCarteValue,
        discountPct,
        verdict,
        verdictReason: reason,
      };
    })
    // Biggest earners first; anything that cannot be priced sorts on revenue so
    // it still appears near the top when it matters.
    .sort((a, b) => (b.margin ?? b.revenue) - (a.margin ?? a.revenue));
}

export type DealsSummary = {
  activeDeals: number;
  unitsSold: number;
  revenue: number;
  /** Null when any deal in the period is missing a component cost. */
  margin: number | null;
  marginPct: number | null;
  /** Share of the bar's total POS revenue that came through deals, 0-100. */
  shareOfRevenuePct: number | null;
  needsAttention: DealPerformance[];
};

export function summariseDeals(
  performance: DealPerformance[],
  totalPosRevenue: number,
): DealsSummary {
  const unitsSold = performance.reduce((s, d) => s + d.unitsSold, 0);
  const revenue = performance.reduce((s, d) => s + d.revenue, 0);

  // One unpriced deal makes the total margin a lie rather than an estimate, so
  // it is withheld entirely instead of being quietly understated.
  const anyUnpriced = performance.some((d) => d.margin === null && d.unitsSold > 0);
  const margin = anyUnpriced ? null : performance.reduce((s, d) => s + (d.margin ?? 0), 0);

  return {
    activeDeals: performance.filter((d) => d.isActive).length,
    unitsSold,
    revenue,
    margin,
    marginPct: margin === null || revenue <= 0 ? null : (margin / revenue) * 100,
    shareOfRevenuePct: totalPosRevenue > 0 ? (revenue / totalPosRevenue) * 100 : null,
    needsAttention: performance.filter(
      (d) => d.verdict === 'low-margin' || d.verdict === 'slow' || d.verdict === 'no-cost',
    ),
  };
}
