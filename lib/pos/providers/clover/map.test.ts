import { describe, it, expect } from 'vitest';
import { mapClover, type MapInput } from './map';
import * as fx from './__fixtures__/fixtures';

const base: MapInput = {
  tz: 'America/New_York', cutoffHour: 4, from: '2026-11-21', to: '2026-11-23',
  payments: fx.payments, refunds: fx.refunds, orders: fx.orders,
  catalog: fx.catalog, employees: fx.employees, shifts: fx.shifts,
};
const z = (r: ReturnType<typeof mapClover>, d: string) => r.zReports.find((x) => x.report_date === d);

describe('mapClover, Z totals', () => {
  const r = mapClover(base);

  it('totals the night net of tax and of a same-night partial refund, in exact dollars', () => {
    // 1500 + 926 + 1474 + 1400 + 600 - 100
    expect(z(r, '2026-11-21')).toMatchObject({ total_sales: 58, cc_tips: 8 });
  });

  it('splits cash and card by tender, and the split reconciles', () => {
    const night = z(r, '2026-11-21')!;
    expect(night.cash_sales).toBe(23.26);
    expect(night.card_sales).toBe(34.74);
    expect(night.cash_sales! + night.card_sales!).toBeCloseTo(night.total_sales, 10);
  });

  it('never reports cash tips, so a stored count is left alone', () => {
    for (const row of r.zReports) expect(row).not.toHaveProperty('cash_tips');
  });

  it('puts a sale on the night it was paid, across midnight and the cutoff', () => {
    // O4 was paid 00:20 local on the 22nd, still the 21st's business night
    expect(r.hourlySales!.find((h) => h.business_date === '2026-11-21' && h.hour === 0)).toMatchObject({ net_sales: 6, tips: 1 });
    expect(z(r, '2026-11-22')!.total_sales).toBe(24);
  });

  it('files a refund on the day it happened, not the day of the sale', () => {
    // Sunday keeps its full 24.00; Monday = 28.50 sale - 18.00 burger refund
    expect(z(r, '2026-11-22')!.total_sales).toBe(24);
    expect(z(r, '2026-11-23')!.total_sales).toBe(10.5);
  });

  it('ignores test-mode orders and failed or voided payments', () => {
    // P5 (test mode, 50.00) and P6 (voided) would add to the 21st if counted
    expect(z(r, '2026-11-21')!.total_sales).toBe(58);
  });

  it('a payment with no tip field adds no tip and no NaN', () => {
    expect(Number.isFinite(z(r, '2026-11-21')!.cc_tips)).toBe(true);
  });

  it('omits the split when a tender is not recognised', () => {
    const odd = { ...fx.payments[0], id: 'PX', tender: { labelKey: 'com.clover.tender.external_gift', label: 'Gift' } };
    const out = mapClover({ ...base, payments: [odd], refunds: [], orders: null });
    expect(out.zReports[0]).toMatchObject({ total_sales: 15 });
    expect(out.zReports[0].cash_sales).toBeUndefined();
    expect(out.zReports[0].card_sales).toBeUndefined();
  });

  it('only returns nights inside the requested window', () => {
    const out = mapClover({ ...base, from: '2026-11-22', to: '2026-11-22' });
    expect(out.zReports.map((x) => x.report_date)).toEqual(['2026-11-22']);
  });

  it('a night with refunds but no sales is reported, not written as a negative', () => {
    const out = mapClover({ ...base, payments: fx.payments.filter((p) => p.id !== 'P8'), extraPayments: [] });
    expect(z(out, '2026-11-23')).toBeUndefined();
    expect(out.errors.join(' ')).toMatch(/2026-11-23.*negative/);
  });

  it('a refund of a payment it cannot find still reduces the night and drops the split', () => {
    const out = mapClover({ ...base, payments: fx.payments.filter((p) => p.id !== 'P7') });
    const night = z(out, '2026-11-23')!;
    expect(night.total_sales).toBe(10.5);
    expect(night.cash_sales).toBeUndefined();
  });

  it('is deterministic, so a re-run of the same window sends identical rows', () => {
    expect(JSON.stringify(mapClover(base))).toBe(JSON.stringify(mapClover(base)));
  });
});

describe('mapClover, items', () => {
  const r = mapClover(base);
  const item = (d: string, n: string) => r.itemAudit!.find((x) => x.sale_date === d && x.item_name === n);

  it('sums quantity and net per night and carries the catalog category', () => {
    expect(item('2026-11-21', 'Bud Light')).toMatchObject({ qty_sold: 2, net_sales: 12, category_name: 'Beer' });
    expect(item('2026-11-21', 'Margarita')).toMatchObject({ qty_sold: 2, net_sales: 24, category_name: 'Cocktails' });
  });

  it('drops a voided line and anything on an order with no successful payment', () => {
    expect(item('2026-11-21', 'Fries')).toBeUndefined();
    expect(r.itemAudit!.filter((x) => x.item_name === 'Wings')).toHaveLength(1); // O6's wings were never paid
    expect(item('2026-11-21', 'Wings')!.qty_sold).toBe(1);
  });

  it('excludes test-mode orders', () => {
    expect(item('2026-11-21', 'Bud Light')!.qty_sold).toBe(2); // not 3
  });

  it('applies a line percentage discount to net but not to quantity', () => {
    expect(item('2026-11-23', 'Old Fashioned')).toMatchObject({ qty_sold: 2, net_sales: 28.5 });
  });

  it('reverses a refunded line on the refund date', () => {
    expect(item('2026-11-22', 'Burger')).toMatchObject({ qty_sold: 1, net_sales: 18 });
    expect(item('2026-11-23', 'Burger')).toMatchObject({ qty_sold: -1, net_sales: -18 });
  });

  it('a partial refund by amount leaves the items sold', () => {
    expect(item('2026-11-21', "Tito's & Soda")).toMatchObject({ qty_sold: 1, net_sales: 9 });
  });

  it('reads unitQty in thousandths and treats a missing one as one', () => {
    const orders = [{ id: 'OQ', createdTime: fx.ms('2026-11-22T02:00:00Z'), lineItems: { elements: [
      { id: 'LQ', name: 'Draft by the half', price: 1000, unitQty: 500 },
    ] } }];
    const p = [{ ...fx.payments[0], id: 'PQ', order: { id: 'OQ' } }];
    const out = mapClover({ ...base, orders, payments: p, refunds: [] });
    expect(out.itemAudit![0]).toMatchObject({ qty_sold: 0.5, net_sales: 5 });
  });

  it('is undefined, not empty, when orders could not be fetched', () => {
    expect(mapClover({ ...base, orders: null }).itemAudit).toBeUndefined();
  });

  it('says so when a paid order is missing from the fetched set', () => {
    const out = mapClover({ ...base, orders: fx.orders.filter((o) => o.id !== 'O1') });
    expect(out.errors.join(' ')).toMatch(/1 paid order/);
  });
});

describe('mapClover, hourly and server', () => {
  const r = mapClover(base);

  it('buckets payments by local hour with distinct tickets', () => {
    const h = r.hourlySales!.filter((x) => x.business_date === '2026-11-21');
    expect(h.map((x) => x.hour).sort((a, b) => a - b)).toEqual([0, 20, 21, 22]);
    expect(h.find((x) => x.hour === 21)).toMatchObject({ net_sales: 24, ticket_count: 1, tips: 4 }); // two tenders, one ticket
  });

  it('attributes by the payment employee and counts tickets once', () => {
    const s = r.serverSales!.filter((x) => x.business_date === '2026-11-21');
    expect(s.find((x) => x.server_name === 'Alice Reyes')).toMatchObject({ net_sales: 29, ticket_count: 2, tips: 3 });
    expect(s.find((x) => x.server_name === 'Bob Chen')).toMatchObject({ net_sales: 30, ticket_count: 2, tips: 5 });
  });

  it('leaves server sales undefined when employees are unavailable', () => {
    expect(mapClover({ ...base, employees: null }).serverSales).toBeUndefined();
  });
});

describe('mapClover, shifts', () => {
  const r = mapClover(base);

  it('computes hours, lets override times win, and skips open shifts', () => {
    expect(r.ewReports).toEqual([
      { shift_date: '2026-11-21', employee_name: 'Alice Reyes', total_sales: 29, tips_paid_out: 0, regular_hours: 6.5, overtime_hours: 0 },
      { shift_date: '2026-11-21', employee_name: 'Bob Chen', total_sales: 30, tips_paid_out: 0, regular_hours: 7, overtime_hours: 0 },
    ]);
  });

  it('is undefined when shifts were not available', () => {
    expect(mapClover({ ...base, shifts: null }).ewReports).toBeUndefined();
  });
});
