/**
 * A hospitality P&L, with cost of goods kept separate from the cost of trading.
 *
 * Pure — no database, no clock.
 *
 * WHY THE SPLIT MATTERS
 *
 * Pour cost is the ratio a bar is judged on, and it only means anything if the
 * numerator is drink. Napkins, straws and cups are a genuine cost but they are
 * not poured, and folding them in inflates the percentage and makes it
 * incomparable to any benchmark. So supplies are subtracted BELOW gross profit:
 * still counted, never allowed to distort the ratio above it.
 */

export type CostType = 'beverage_cogs' | 'food_cogs' | 'supplies' | 'excluded';

export const COST_TYPE_LABEL: Record<CostType, string> = {
  beverage_cogs: 'Beverage (cost of sales)',
  food_cogs: 'Food (cost of sales)',
  supplies: 'Operating supplies',
  excluded: 'Not a cost of sale',
};

export const COST_TYPE_HELP: Record<CostType, string> = {
  beverage_cogs: 'Counts toward pour cost. Spirits, beer, wine, mixers.',
  food_cogs: 'Counts toward food cost, tracked separately from pour cost.',
  supplies: 'Real costs that are not poured — napkins, straws, cups. Subtracted after gross profit so they cannot distort pour cost.',
  excluded: 'Ignored by the P&L entirely. Use for equipment or anything counted but never sold.',
};

export type ExpenseCategory =
  | 'entertainment' | 'maintenance' | 'utilities' | 'licensing'
  | 'marketing' | 'cleaning' | 'professional' | 'other';

export const EXPENSE_CATEGORY_LABEL: Record<ExpenseCategory, string> = {
  entertainment: 'Entertainment',
  maintenance: 'Repairs & maintenance',
  utilities: 'Utilities',
  licensing: 'Licences & fees',
  marketing: 'Marketing',
  cleaning: 'Cleaning',
  professional: 'Professional services',
  other: 'Other',
};

/** One item's consumption, already priced. */
export type CostedUsage = {
  costType: CostType;
  /** quantity × unit cost. */
  value: number;
};

export type OperatingExpense = {
  category: ExpenseCategory;
  amount: number;
  expenseDate: string;
  isRecurring: boolean;
  recurringUntil: string | null;
};

export type CostBreakdown = {
  beverageCogs: number;
  foodCogs: number;
  totalCogs: number;
  supplies: number;
  /** Grouped for display, largest first. */
  expensesByCategory: { category: ExpenseCategory; label: string; amount: number }[];
  totalExpenses: number;
};

export function summariseCosts(
  usage: CostedUsage[],
  expenses: OperatingExpense[],
): CostBreakdown {
  let beverageCogs = 0;
  let foodCogs = 0;
  let supplies = 0;

  for (const u of usage) {
    if (u.costType === 'beverage_cogs') beverageCogs += u.value;
    else if (u.costType === 'food_cogs') foodCogs += u.value;
    else if (u.costType === 'supplies') supplies += u.value;
    // 'excluded' is deliberately dropped rather than defaulted anywhere.
  }

  const byCategory = new Map<ExpenseCategory, number>();
  for (const e of expenses) {
    byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amount);
  }

  const expensesByCategory = [...byCategory.entries()]
    .map(([category, amount]) => ({
      category,
      label: EXPENSE_CATEGORY_LABEL[category] ?? category,
      amount,
    }))
    .sort((a, b) => b.amount - a.amount);

  return {
    beverageCogs: round2(beverageCogs),
    foodCogs: round2(foodCogs),
    totalCogs: round2(beverageCogs + foodCogs),
    supplies: round2(supplies),
    expensesByCategory,
    totalExpenses: round2(expensesByCategory.reduce((s, e) => s + e.amount, 0)),
  };
}

/**
 * Expands a recurring expense across the months of a reporting period.
 *
 * A monthly cost entered once should count in every month it covers, or a
 * quarterly report would show one month of rent against three months of
 * revenue. Counted per calendar month touched by the period.
 */
export function expandRecurring(
  expenses: OperatingExpense[],
  periodStart: string,
  periodEnd: string,
): OperatingExpense[] {
  const out: OperatingExpense[] = [];
  const start = monthIndex(periodStart);
  const end = monthIndex(periodEnd);

  for (const e of expenses) {
    if (!e.isRecurring) {
      // A one-off counts only if it falls inside the window.
      if (e.expenseDate >= periodStart && e.expenseDate <= periodEnd) out.push(e);
      continue;
    }

    const from = Math.max(start, monthIndex(e.expenseDate));
    const until = e.recurringUntil ? Math.min(end, monthIndex(e.recurringUntil)) : end;

    for (let m = from; m <= until; m++) {
      out.push({ ...e, expenseDate: monthToDate(m) });
    }
  }

  return out;
}

export type ProfitAndLoss = {
  netRevenue: number;
  beverageCogs: number;
  foodCogs: number;
  totalCogs: number;
  grossProfit: number;
  supplies: number;
  labor: number;
  operatingExpenses: number;
  otherLosses: number;
  /**
   * What the bar actually kept: net revenue with every deduction taken out.
   *
   * One name, used from here to the screen. It was `netOperating` here and
   * `netOperating` again in the Books route, where a SECOND, shorter
   * calculation had quietly taken the name — so the page printed a figure that
   * skipped supplies and operating expenses under a heading that promised
   * otherwise.
   */
  pureProfit: number;

  /** Beverage cost as a share of net revenue — the benchmarked figure. */
  pourCostPct: number | null;
  foodCostPct: number | null;
  grossMarginPct: number | null;
  laborPct: number | null;
  pureProfitPct: number | null;
};

export function buildProfitAndLoss(
  netRevenue: number,
  costs: CostBreakdown,
  labor: number,
  otherLosses: number,
): ProfitAndLoss {
  const grossProfit = netRevenue - costs.totalCogs;
  // Every deduction, in one place. Supplies and operating expenses belong here
  // as much as labour does — they are below gross profit so they cannot distort
  // pour cost, not because they are optional.
  const pureProfit =
    grossProfit - costs.supplies - labor - costs.totalExpenses - otherLosses;

  // Null rather than 0 when there is no revenue: "0% pour cost" reads as
  // excellent when it actually means there is nothing to divide by.
  const pct = (n: number) => (netRevenue > 0 ? (n / netRevenue) * 100 : null);

  return {
    netRevenue: round2(netRevenue),
    beverageCogs: costs.beverageCogs,
    foodCogs: costs.foodCogs,
    totalCogs: costs.totalCogs,
    grossProfit: round2(grossProfit),
    supplies: costs.supplies,
    labor: round2(labor),
    operatingExpenses: costs.totalExpenses,
    otherLosses: round2(otherLosses),
    pureProfit: round2(pureProfit),
    pourCostPct: pct(costs.beverageCogs),
    foodCostPct: costs.foodCogs > 0 ? pct(costs.foodCogs) : null,
    grossMarginPct: pct(grossProfit),
    laborPct: pct(labor),
    pureProfitPct: pct(pureProfit),
  };
}

/**
 * Industry reference bands, used to say whether a figure is where it should be.
 *
 * Ranges, not targets — a dive bar and a cocktail bar sit in different parts of
 * each band legitimately, so this reads as context rather than a grade.
 */
export const BENCHMARKS = {
  pourCost: { good: 20, watch: 24, label: 'Beverage cost' },
  foodCost: { good: 30, watch: 35, label: 'Food cost' },
  labor: { good: 25, watch: 32, label: 'Labour' },
} as const;

export type BenchmarkVerdict = 'good' | 'watch' | 'high' | 'unknown';

export function judgeAgainstBenchmark(
  pct: number | null,
  band: { good: number; watch: number },
): BenchmarkVerdict {
  if (pct === null) return 'unknown';
  if (pct <= band.good) return 'good';
  if (pct <= band.watch) return 'watch';
  return 'high';
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Months since epoch, for cheap month arithmetic on YYYY-MM-DD strings. */
function monthIndex(iso: string): number {
  const [y, m] = iso.split('-').map(Number);
  return y * 12 + (m - 1);
}

function monthToDate(index: number): string {
  const y = Math.floor(index / 12);
  const m = (index % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}-01`;
}
