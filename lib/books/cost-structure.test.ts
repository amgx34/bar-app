import { describe, it, expect } from 'vitest';
import {
  summariseCosts, buildProfitAndLoss, expandRecurring, judgeAgainstBenchmark,
  BENCHMARKS,
  type CostedUsage, type OperatingExpense,
} from './cost-structure';

/**
 * The P&L line, and the bug this file exists to stop coming back.
 *
 * Books rendered a statement that listed operating supplies and operating
 * expenses as deductions, then printed a bottom line computed WITHOUT them —
 * the route had a second, shorter profit calculation of its own. The column did
 * not add up and reported profit was high by exactly the costs it had skipped.
 *
 * So the load-bearing assertion here is not "the arithmetic works". It is that
 * the bottom line equals net revenue minus every row above it, checked against
 * an independent sum rather than a restatement of the formula.
 */

const noExpenses: OperatingExpense[] = [];

function usage(...items: [CostedUsage['costType'], number][]): CostedUsage[] {
  return items.map(([costType, value]) => ({ costType, value }));
}

function expense(
  category: OperatingExpense['category'],
  amount: number,
  expenseDate: string,
  isRecurring = false,
  recurringUntil: string | null = null,
): OperatingExpense {
  return { category, amount, expenseDate, isRecurring, recurringUntil };
}

describe('summariseCosts', () => {
  it('keeps supplies out of cost of goods', () => {
    // The whole reason the split exists: napkins are a real cost but they are
    // not poured, and folding them in makes pour cost incomparable to any
    // benchmark.
    const c = summariseCosts(
      usage(['beverage_cogs', 400], ['food_cogs', 100], ['supplies', 60]),
      noExpenses,
    );
    expect(c.beverageCogs).toBe(400);
    expect(c.foodCogs).toBe(100);
    expect(c.totalCogs).toBe(500);
    expect(c.supplies).toBe(60);
  });

  it('drops excluded costs entirely rather than defaulting them somewhere', () => {
    const c = summariseCosts(
      usage(['beverage_cogs', 400], ['excluded', 9999]),
      noExpenses,
    );
    expect(c.totalCogs).toBe(400);
    expect(c.supplies).toBe(0);
  });

  it('groups expenses by category, largest first', () => {
    const c = summariseCosts([], [
      expense('marketing', 100, '2026-08-01'),
      expense('utilities', 500, '2026-08-02'),
      expense('marketing', 250, '2026-08-03'),
    ]);
    // Utilities 500 outranks marketing's two entries summed to 350.
    expect(c.expensesByCategory.map((e) => e.category)).toEqual(['utilities', 'marketing']);
    expect(c.expensesByCategory[0].amount).toBe(500);
    expect(c.expensesByCategory[1].amount).toBe(350);
    expect(c.totalExpenses).toBe(850);
  });
});

describe('buildProfitAndLoss', () => {
  const costs = summariseCosts(
    usage(['beverage_cogs', 2000], ['food_cogs', 500], ['supplies', 300]),
    [expense('entertainment', 800, '2026-08-01'), expense('utilities', 400, '2026-08-05')],
  );

  it('subtracts every cost from the bottom line', () => {
    // 10000 - 2500 cogs - 300 supplies - 3000 labour - 1200 expenses - 200 losses
    const pnl = buildProfitAndLoss(10000, costs, 3000, 200);
    expect(pnl.pureProfit).toBe(2800);
  });

  it('reconciles: net revenue minus every deduction equals pure profit', () => {
    // The regression guard. Summed independently of the implementation, so a
    // deduction dropped from the formula fails here rather than silently
    // inflating profit the way the shipped bug did.
    const pnl = buildProfitAndLoss(10000, costs, 3000, 200);
    const deductions =
      pnl.totalCogs + pnl.supplies + pnl.labor + pnl.operatingExpenses + pnl.otherLosses;
    expect(pnl.netRevenue - deductions).toBeCloseTo(pnl.pureProfit, 2);
  });

  it('is lower than the naive revenue − COGS − labour line by supplies + expenses', () => {
    // This difference IS the bug: the route used the naive figure while the
    // screen listed the full set of rows.
    const pnl = buildProfitAndLoss(10000, costs, 3000, 200);
    const naive = pnl.netRevenue - pnl.totalCogs - pnl.labor - pnl.otherLosses;
    expect(naive - pnl.pureProfit).toBeCloseTo(costs.supplies + costs.totalExpenses, 2);
    expect(naive - pnl.pureProfit).toBeCloseTo(1500, 2);
  });

  it('keeps supplies below gross profit so pour cost stays comparable', () => {
    const pnl = buildProfitAndLoss(10000, costs, 3000, 200);
    expect(pnl.grossProfit).toBe(7500);
    // 2000 beverage on 10000 net revenue. Supplies must not be in this ratio.
    expect(pnl.pourCostPct).toBeCloseTo(20, 2);
  });

  it('reports a loss as a negative rather than clamping at zero', () => {
    const pnl = buildProfitAndLoss(1000, costs, 3000, 200);
    expect(pnl.pureProfit).toBeLessThan(0);
    expect(pnl.pureProfitPct).toBeLessThan(0);
  });

  it('gives null percentages on no revenue, never 0', () => {
    // "0% pour cost" reads as excellent when it actually means there is nothing
    // to divide by.
    const pnl = buildProfitAndLoss(0, costs, 0, 0);
    expect(pnl.pourCostPct).toBeNull();
    expect(pnl.grossMarginPct).toBeNull();
    expect(pnl.laborPct).toBeNull();
    expect(pnl.pureProfitPct).toBeNull();
  });

  it('reports no food cost percentage when nothing food was sold', () => {
    const bevOnly = summariseCosts(usage(['beverage_cogs', 2000]), noExpenses);
    expect(buildProfitAndLoss(10000, bevOnly, 0, 0).foodCostPct).toBeNull();
  });
});

describe('expandRecurring', () => {
  it('counts a monthly cost in every month of the period', () => {
    // Entered once in January; a Q1 report must show three months of rent
    // against three months of revenue, not one.
    const out = expandRecurring(
      [expense('utilities', 500, '2026-01-10', true)],
      '2026-01-01',
      '2026-03-31',
    );
    expect(out).toHaveLength(3);
    expect(out.reduce((s, e) => s + e.amount, 0)).toBe(1500);
  });

  it('stops at the end date of a recurrence', () => {
    const out = expandRecurring(
      [expense('utilities', 500, '2026-01-10', true, '2026-02-28')],
      '2026-01-01',
      '2026-06-30',
    );
    expect(out).toHaveLength(2);
  });

  it('does not start a recurrence before it began', () => {
    const out = expandRecurring(
      [expense('utilities', 500, '2026-03-10', true)],
      '2026-01-01',
      '2026-04-30',
    );
    expect(out).toHaveLength(2); // March and April only
  });

  it('keeps a one-off only when it falls inside the window', () => {
    const rows = [
      expense('maintenance', 300, '2026-02-10'),
      expense('maintenance', 999, '2025-12-31'),
    ];
    const out = expandRecurring(rows, '2026-01-01', '2026-03-31');
    expect(out).toHaveLength(1);
    expect(out[0].amount).toBe(300);
  });

  it('crosses a year boundary', () => {
    const out = expandRecurring(
      [expense('licensing', 100, '2025-11-01', true)],
      '2025-11-01',
      '2026-02-28',
    );
    expect(out).toHaveLength(4);
  });
});

describe('judgeAgainstBenchmark', () => {
  it('reads a null as unknown rather than good', () => {
    expect(judgeAgainstBenchmark(null, BENCHMARKS.pourCost)).toBe('unknown');
  });

  it('grades on the band boundaries inclusively', () => {
    expect(judgeAgainstBenchmark(20, BENCHMARKS.pourCost)).toBe('good');
    expect(judgeAgainstBenchmark(24, BENCHMARKS.pourCost)).toBe('watch');
    expect(judgeAgainstBenchmark(24.1, BENCHMARKS.pourCost)).toBe('high');
  });
});
