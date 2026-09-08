import { describe, it, expect } from 'vitest';
import {
  detectLowStock, detectZReportClosed, detectSalesAnomaly,
  detectSalesTax, detectHourlyTips,
  ANOMALY_THRESHOLD, MIN_SAMPLES, type ZDay,
} from './detect';

const item = (id: string, name: string, current: number, par: number | string | null) =>
  ({ id, name, current_stock: current, par_level: par });

describe('detectLowStock', () => {
  it('returns null when nothing is below par', () => {
    expect(detectLowStock([item('a', 'Gin', 10, 5)], null, '2026-09-01')).toBeNull();
  });

  it('reports every low item on the first run, when nothing has been announced', () => {
    const d = detectLowStock([item('a', 'Gin', 1, 5), item('b', 'Rum', 2, 5)], null, '2026-09-01');
    expect(d?.payload?.newItemIds).toEqual(['a', 'b']);
  });

  it('stays silent when the only low items were already reported', () => {
    const items = [item('a', 'Gin', 1, 5)];
    expect(detectLowStock(items, { itemIds: ['a'] }, '2026-09-01')).toBeNull();
  });

  it('fires for a newly crossed item while an old one stays low', () => {
    const items = [item('a', 'Gin', 1, 5), item('b', 'Rum', 1, 5)];
    const d = detectLowStock(items, { itemIds: ['a'] }, '2026-09-01');
    expect(d?.payload?.newItemIds).toEqual(['b']);
    // The payload carries the full state so the next run knows about both.
    expect(d?.payload?.itemIds).toEqual(['a', 'b']);
    expect(d?.body).toContain('2 items are below par in total');
  });

  it('re-fires for an item that recovered and then relapsed', () => {
    // The previous digest saw nothing low, so 'a' is not in its itemIds.
    const d = detectLowStock([item('a', 'Gin', 1, 5)], { itemIds: [] }, '2026-09-01');
    expect(d?.payload?.newItemIds).toEqual(['a']);
  });

  it('ranks the worst shortfall first', () => {
    const items = [item('a', 'Gin', 4, 5), item('b', 'Rum', 1, 10)];
    const d = detectLowStock(items, null, '2026-09-01');
    expect(d?.body?.startsWith('Rum')).toBe(true);
  });

  it('names a single item directly rather than counting to one', () => {
    const d = detectLowStock([item('a', 'Gin', 1, 5)], null, '2026-09-01');
    expect(d?.title).toBe('Gin is below par');
  });

  it('summarises the tail past three names', () => {
    const items = ['a', 'b', 'c', 'd', 'e'].map((id, i) => item(id, `Item ${i}`, 1, 5));
    const d = detectLowStock(items, null, '2026-09-01');
    expect(d?.body).toContain('and 2 more');
  });

  it('is idempotent for a given business date', () => {
    const a = detectLowStock([item('a', 'Gin', 1, 5)], null, '2026-09-01');
    const b = detectLowStock([item('a', 'Gin', 1, 5)], null, '2026-09-01');
    expect(a?.dedupeKey).toBe(b?.dedupeKey);
  });

  it('ignores items with no usable par level', () => {
    const items = [item('a', 'Gin', 0, null), item('b', 'Rum', 0, 0), item('c', 'Vodka', 0, '')];
    expect(detectLowStock(items, null, '2026-09-01')).toBeNull();
  });
});

describe('detectZReportClosed', () => {
  const day = (over: Partial<ZDay> = {}): ZDay =>
    ({ report_date: '2026-08-31', total_sales: 4200, cash_sales: null, card_sales: null, ...over });

  it('returns null when the POS reported no total', () => {
    expect(detectZReportClosed(day({ total_sales: null }))).toBeNull();
  });

  it('omits the drawer split when the POS did not report one', () => {
    const d = detectZReportClosed(day());
    expect(d?.body).not.toContain('cash');
  });

  it('never renders a NULL split as zero', () => {
    // The dangerous case: cash reported, card not. Claiming "$0 card" would be
    // a fabrication, so neither half is shown.
    const d = detectZReportClosed(day({ cash_sales: 800, card_sales: null }));
    expect(d?.body).not.toContain('cash');
  });

  it('shows the split when both halves are present', () => {
    const d = detectZReportClosed(day({ cash_sales: 800, card_sales: 3400 }));
    expect(d?.body).toContain('cash');
    expect(d?.body).toContain('card');
  });

  it('reports a genuine zero-cash night when the POS said so', () => {
    const d = detectZReportClosed(day({ cash_sales: 0, card_sales: 4200 }));
    expect(d?.body).toContain('$0 cash');
  });

  it('never rounds a real sub-dollar figure down to $0', () => {
    // Caught on live data: whole-dollar rounding turned $0.40 of card sales into
    // "$0 card", which reads as "took no card" — the same lie as rendering a
    // NULL split as zero.
    const d = detectZReportClosed(day({ total_sales: 12, cash_sales: 11.6, card_sales: 0.4 }));
    expect(d?.body).toContain('$0.40 card');
    expect(d?.body).not.toContain('$0 card');
  });
});

describe('detectSalesAnomaly', () => {
  const on = (date: string, total: number | null): ZDay =>
    ({ report_date: date, total_sales: total, cash_sales: null, card_sales: null });

  const history = (...totals: number[]) =>
    totals.map((t, i) => on(`2026-08-${String(24 - i * 7).padStart(2, '0')}`, t));

  it('stays silent below the minimum sample count', () => {
    const h = history(1000, 1000).slice(0, MIN_SAMPLES - 1);
    expect(detectSalesAnomaly(on('2026-08-31', 5000), h)).toBeNull();
  });

  it('stays silent inside the threshold', () => {
    const d = detectSalesAnomaly(on('2026-08-31', 1100), history(1000, 1000, 1000, 1000));
    expect(d).toBeNull();
  });

  it('fires on a drop past the threshold', () => {
    const d = detectSalesAnomaly(on('2026-08-31', 500), history(1000, 1000, 1000, 1000));
    expect(d?.title).toContain('down');
    expect(d?.title).toContain('50%');
  });

  it('fires on a spike past the threshold', () => {
    const d = detectSalesAnomaly(on('2026-08-31', 2000), history(1000, 1000, 1000, 1000));
    expect(d?.title).toContain('up');
  });

  it('ignores days the POS never reported', () => {
    // Three usable samples plus one null: the null must not drag the mean down
    // and must not count toward MIN_SAMPLES.
    const h = [...history(1000, 1000, 1000), on('2026-08-03', null)];
    const d = detectSalesAnomaly(on('2026-08-31', 1000), h);
    expect(d).toBeNull();
  });

  it('does not compare a day against itself', () => {
    const today = on('2026-08-31', 5000);
    // Only two other samples once today is excluded — under the minimum.
    expect(detectSalesAnomaly(today, [today, on('2026-08-24', 1000), on('2026-08-17', 1000)])).toBeNull();
  });

  it('returns null when the baseline is zero', () => {
    expect(detectSalesAnomaly(on('2026-08-31', 500), history(0, 0, 0, 0))).toBeNull();
  });

  it('treats the threshold as inclusive — 25% off the mean fires, just under does not', () => {
    const h = history(1000, 1000, 1000, 1000);
    const at = 1000 * (1 + ANOMALY_THRESHOLD);
    expect(detectSalesAnomaly(on('2026-08-31', at), h)).not.toBeNull();
    expect(detectSalesAnomaly(on('2026-08-31', at - 1), h)).toBeNull();
  });
});

describe('detectSalesTax', () => {
  const configured = { ratePct: 8.25, pricesIncludeTax: true };
  const day = (total: number | null): ZDay =>
    ({ report_date: '2026-09-01', total_sales: total, cash_sales: null, card_sales: null });

  it('names the amount held for the state', () => {
    // 1082.50 tax-inclusive at 8.25% → 1000.00 net, 82.50 tax.
    const d = detectSalesTax(day(1082.5), configured);
    expect(d?.title).toContain('$83');
    expect(d?.eventType).toBe('sales.tax_daily');
  });

  it('stays silent when no rate is configured, rather than guessing one', () => {
    expect(detectSalesTax(day(1082.5), { ratePct: null, pricesIncludeTax: true })).toBeNull();
  });

  it('stays silent when the tax treatment of POS prices is unknown', () => {
    // The two treatments differ by the whole tax amount in opposite directions,
    // so an unset flag cannot be defaulted to either one.
    expect(detectSalesTax(day(1082.5), { ratePct: 8.25, pricesIncludeTax: null })).toBeNull();
  });

  it('stays silent on a night the POS never reported', () => {
    expect(detectSalesTax(day(null), configured)).toBeNull();
  });

  it('stays silent on a night that took nothing, having no tax to remit', () => {
    expect(detectSalesTax(day(0), configured)).toBeNull();
  });

  it('keys on the business date so the cron can re-run without repeating itself', () => {
    expect(detectSalesTax(day(1082.5), configured)?.dedupeKey).toBe('sales.tax_daily:2026-09-01');
  });
});

describe('detectHourlyTips', () => {
  it('reports tips per recorded labour hour', () => {
    const d = detectHourlyTips({
      report_date: '2026-09-01', cash_tips: 200, cc_tips: 400, hoursWorked: 20,
    });
    expect(d?.title).toContain('$30');
    expect(d?.eventType).toBe('tips.hourly');
  });

  it('stays silent when no hours were recorded, rather than dividing by zero', () => {
    expect(detectHourlyTips({
      report_date: '2026-09-01', cash_tips: 200, cc_tips: 400, hoursWorked: 0,
    })).toBeNull();
  });

  it('stays silent when the night recorded no tips at all', () => {
    // Nothing to report, and "$0/hr in tips" reads as an accusation.
    expect(detectHourlyTips({
      report_date: '2026-09-01', cash_tips: 0, cc_tips: 0, hoursWorked: 20,
    })).toBeNull();
  });

  it('counts a null tip column as nothing rather than abandoning the figure', () => {
    // cash_tips defaults to 0 in the schema but an older row may carry NULL.
    // Half a figure is still worth reporting; NaN is not.
    const d = detectHourlyTips({
      report_date: '2026-09-01', cash_tips: null, cc_tips: 400, hoursWorked: 20,
    });
    expect(d?.title).toContain('$20');
  });

  it('keys on the business date so the cron can re-run without repeating itself', () => {
    expect(detectHourlyTips({
      report_date: '2026-09-01', cash_tips: 200, cc_tips: 400, hoursWorked: 20,
    })?.dedupeKey).toBe('tips.hourly:2026-09-01');
  });
});
