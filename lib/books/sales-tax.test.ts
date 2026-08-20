import { describe, it, expect } from 'vitest';
import { splitRevenue, isConfigured, salesTaxFromSettings, computeProfit } from './sales-tax';

/**
 * Sales tax is a liability, not revenue. It was never the bar's money.
 *
 * The two treatments are genuinely different arithmetic, not a sign flip, and
 * dividing where you should multiply understates the tax by a factor of
 * (1 + rate) and leaves the difference sitting in profit.
 */

const INCLUSIVE = { ratePct: 8.25, pricesIncludeTax: true };
const EXCLUSIVE = { ratePct: 8.25, pricesIncludeTax: false };

describe('splitRevenue', () => {
  it('backs tax out of a tax-inclusive figure', () => {
    const s = splitRevenue(1082.50, INCLUSIVE);
    expect(s.gross).toBeCloseTo(1082.50, 2);
    expect(s.net).toBeCloseTo(1000, 2);
    expect(s.tax).toBeCloseTo(82.50, 2);
    expect(s.configured).toBe(true);
  });

  it('adds tax on top of a tax-exclusive figure', () => {
    const s = splitRevenue(1000, EXCLUSIVE);
    expect(s.net).toBeCloseTo(1000, 2);
    expect(s.tax).toBeCloseTo(82.50, 2);
    expect(s.gross).toBeCloseTo(1082.50, 2);
  });

  it('the two treatments differ by more than a sign', () => {
    // Reading one as the other is the classic error here, and it is worth a
    // whole tax bill on a busy month.
    const inc = splitRevenue(1000, INCLUSIVE);
    const exc = splitRevenue(1000, EXCLUSIVE);
    expect(inc.net).not.toBeCloseTo(exc.net, 2);
    // Both are configured, so both taxes are non-null; assert that first so the
    // comparison below is a real one rather than null-vs-null.
    expect(inc.tax).not.toBeNull();
    expect(exc.tax).not.toBeNull();
    expect(inc.tax!).not.toBeCloseTo(exc.tax!, 2);
  });

  it('net + tax always reconciles to gross', () => {
    for (const cfg of [INCLUSIVE, EXCLUSIVE]) {
      for (const amount of [0, 1, 999.99, 15234.56]) {
        const s = splitRevenue(amount, cfg);
        expect(s.net + s.tax!).toBeCloseTo(s.gross!, 2);
      }
    }
  });

  it('passes the figure through untouched when unconfigured, and says so', () => {
    // Silence beats assumption: telling an owner their profit is $8,000 when
    // $600 belongs to the state is worse than reporting nothing.
    const s = splitRevenue(1000, { ratePct: null, pricesIncludeTax: true });
    expect(s.net).toBe(1000);
    expect(s.tax).toBeNull();
    expect(s.gross).toBeNull();
    expect(s.configured).toBe(false);
  });

  it('treats a known rate with an unknown treatment as unconfigured', () => {
    // Which way to apply it cannot be inferred from the figure itself.
    expect(splitRevenue(1000, { ratePct: 8.25, pricesIncludeTax: null }).configured).toBe(false);
  });
});

describe('isConfigured / salesTaxFromSettings', () => {
  it('needs both a positive rate and an explicit treatment', () => {
    expect(isConfigured(INCLUSIVE)).toBe(true);
    expect(isConfigured({ ratePct: 0, pricesIncludeTax: true })).toBe(false);
    expect(isConfigured({ ratePct: 8.25, pricesIncludeTax: null })).toBe(false);
  });

  it('rejects a rate that is obviously a data-entry error', () => {
    // 825 instead of 8.25 would wipe out a month's reported revenue.
    expect(salesTaxFromSettings({ sales_tax_rate: 825, pos_prices_include_tax: true }).ratePct)
      .toBeNull();
    expect(salesTaxFromSettings({ sales_tax_rate: 8.25, pos_prices_include_tax: true }).ratePct)
      .toBe(8.25);
  });

  it('treats a missing or non-boolean treatment as unset', () => {
    expect(salesTaxFromSettings({ sales_tax_rate: 8.25 }).pricesIncludeTax).toBeNull();
  });
});

describe('computeProfit', () => {
  it('measures every percentage against NET revenue', () => {
    // Using gross would flatter each ratio by the tax rate and make two bars in
    // different states look different when they are trading identically.
    const p = computeProfit(1082.50, 250, 300, INCLUSIVE);

    expect(p.netRevenue).toBeCloseTo(1000, 2);
    expect(p.salesTax).toBeCloseTo(82.50, 2);
    expect(p.grossProfit).toBeCloseTo(750, 2);
    expect(p.grossMarginPct).toBeCloseTo(75, 1);
    expect(p.laborPct).toBeCloseTo(30, 1);
    expect(p.netProfit).toBeCloseTo(450, 2);
    expect(p.netProfitPct).toBeCloseTo(45, 1);
  });

  it('does not count tax as profit', () => {
    const withTax = computeProfit(1082.50, 250, 300, INCLUSIVE);
    const noTax = computeProfit(1082.50, 250, 300, { ratePct: null, pricesIncludeTax: null });
    expect(noTax.netProfit).toBeGreaterThan(withTax.netProfit);
    expect(noTax.netProfit - withTax.netProfit).toBeCloseTo(82.50, 2);
  });

  it('reports zero percentages rather than dividing by zero revenue', () => {
    const p = computeProfit(0, 0, 0, INCLUSIVE);
    expect(p.grossMarginPct).toBe(0);
    expect(p.laborPct).toBe(0);
    expect(p.netProfitPct).toBe(0);
  });

  it('flags whether the split was real or a pass-through', () => {
    expect(computeProfit(1000, 0, 0, INCLUSIVE).taxConfigured).toBe(true);
    expect(computeProfit(1000, 0, 0, { ratePct: null, pricesIncludeTax: null }).taxConfigured)
      .toBe(false);
  });
});
