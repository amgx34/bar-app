/**
 * Separating money the bar keeps from money it is holding for the state.
 *
 * Sales tax is a LIABILITY, not an expense. It was never the bar's money: it is
 * collected from the customer and remitted. Treating it as revenue overstates
 * every figure downstream — gross profit, margin percentage, and the net
 * operating number an owner uses to decide whether the month worked.
 *
 * Nothing here guesses. The rate and the tax treatment of the POS figures are
 * both explicit settings, and when either is unset the split is reported as
 * unknown rather than assumed. Assuming would be worse than silence: an owner
 * told their profit is $8,000 when $600 of it belongs to the state has been
 * handed a number that is actively harmful.
 */

export type SalesTaxConfig = {
  /** Percentage, e.g. 8.25. Null when the operator has not set one. */
  ratePct: number | null;
  /**
   * Whether the sales figures coming out of the POS already have tax in them.
   *
   * This cannot be inferred. A POS "Net Sales" column usually means net of
   * discounts and voids, which says nothing about tax — and the two
   * interpretations differ by the entire tax amount in opposite directions.
   */
  pricesIncludeTax: boolean | null;
};

export type RevenueSplit = {
  /** What customers actually paid, tax included. Null when unknown. */
  gross: number | null;
  /** The bar's revenue, tax removed. */
  net: number;
  /** Held on behalf of the state. Null when not configured. */
  tax: number | null;
  /** True when the split is a real calculation rather than a pass-through. */
  configured: boolean;
};

export function isConfigured(config: SalesTaxConfig): boolean {
  return (
    config.ratePct !== null &&
    config.ratePct > 0 &&
    config.pricesIncludeTax !== null
  );
}

/**
 * Splits a reported sales figure into the bar's revenue and the tax portion.
 *
 * The two treatments are genuinely different arithmetic, not a sign flip:
 *
 *   tax-inclusive   net = reported / (1 + rate)      tax = reported - net
 *   tax-exclusive   net = reported                   tax = reported * rate
 *
 * Dividing where you should multiply — the classic error here — understates the
 * tax by a factor of (1 + rate) and leaves the difference sitting in profit.
 */
export function splitRevenue(reported: number, config: SalesTaxConfig): RevenueSplit {
  if (!isConfigured(config)) {
    // Pass the figure through untouched and say plainly that no split was made.
    return { gross: null, net: reported, tax: null, configured: false };
  }

  const rate = (config.ratePct as number) / 100;

  if (config.pricesIncludeTax) {
    const net = reported / (1 + rate);
    return {
      gross: round2(reported),
      net: round2(net),
      tax: round2(reported - net),
      configured: true,
    };
  }

  const tax = reported * rate;
  return {
    gross: round2(reported + tax),
    net: round2(reported),
    tax: round2(tax),
    configured: true,
  };
}

/** Reads the configuration off `bar_settings`, treating anything unusable as unset. */
export function salesTaxFromSettings(settings: {
  sales_tax_rate?: number | null;
  pos_prices_include_tax?: boolean | null;
}): SalesTaxConfig {
  const raw = Number(settings.sales_tax_rate);
  // A rate above 25% is a data-entry error (0.0825 entered as 8.25 is the one
  // this catches going the other way, but 825 is the one that ruins a report).
  const ratePct = Number.isFinite(raw) && raw > 0 && raw <= 25 ? raw : null;

  return {
    ratePct,
    pricesIncludeTax:
      typeof settings.pos_prices_include_tax === 'boolean'
        ? settings.pos_prices_include_tax
        : null,
  };
}

export type ProfitBreakdown = {
  grossTakings: number | null;
  salesTax: number | null;
  netRevenue: number;
  cogs: number;
  grossProfit: number;
  labor: number;
  netProfit: number;
  /** Percentages are always of NET revenue, never of takings that include tax. */
  grossMarginPct: number;
  laborPct: number;
  netProfitPct: number;
  taxConfigured: boolean;
};

/**
 * The whole line, from what came through the till to what the bar keeps.
 *
 * Every percentage is computed against net revenue. Using gross would flatter
 * each one by the tax rate and make two bars in different states look different
 * when they are trading identically.
 */
export function computeProfit(
  reportedSales: number,
  cogs: number,
  labor: number,
  config: SalesTaxConfig,
): ProfitBreakdown {
  const split = splitRevenue(reportedSales, config);
  const netRevenue = split.net;
  const grossProfit = netRevenue - cogs;
  const netProfit = grossProfit - labor;

  const pct = (n: number) => (netRevenue > 0 ? (n / netRevenue) * 100 : 0);

  return {
    grossTakings: split.gross,
    salesTax: split.tax,
    netRevenue: round2(netRevenue),
    cogs: round2(cogs),
    grossProfit: round2(grossProfit),
    labor: round2(labor),
    netProfit: round2(netProfit),
    grossMarginPct: pct(grossProfit),
    laborPct: pct(labor),
    netProfitPct: pct(netProfit),
    taxConfigured: split.configured,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
