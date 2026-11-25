import { describe, it, expect } from 'vitest';
import { mapToast, type MapInput } from './map';
import * as fx from './__fixtures__/fixtures';

const base: MapInput = {
  tz: 'America/New_York', from: '2026-11-21', to: '2026-11-23',
  orders: fx.orders, employees: fx.employees, timeEntries: fx.timeEntries,
  menu: fx.menus, includeItems: true,
};
const z = (r: ReturnType<typeof mapToast>, d: string) => r.zReports.find((x) => x.report_date === d);
const one = (orders: MapInput['orders'], extra: Partial<MapInput> = {}) =>
  mapToast({ ...base, from: '2026-11-21', to: '2026-11-21', orders, timeEntries: null, ...extra });

describe('mapToast, Z totals', () => {
  const r = mapToast(base);

  it('totals the night from check amounts, in exact dollars', () => {
    expect(z(r, '2026-11-21')).toMatchObject({ total_sales: 63, cc_tips: 7.4 });
  });

  it('splits one check across its several payments and the split reconciles', () => {
    const n = z(r, '2026-11-21')!;
    expect(n.cash_sales).toBe(26);
    expect(n.card_sales).toBe(37);
    expect(n.cash_sales! + n.card_sales!).toBeCloseTo(n.total_sales, 10);
  });

  it('never counts voided orders, deleted orders, test orders, voided checks or open checks', () => {
    // O4 (50), O5 (40), O6 (30), C7 (30) would add 150 to the 21st; the open C13 would add 20 to the 23rd
    expect(z(r, '2026-11-21')!.total_sales).toBe(63);
    expect(z(r, '2026-11-23')!.total_sales).toBe(18.5);
  });

  it('keeps a business date that differs from the calendar date', () => {
    // O3 was paid 01:20 on the 22nd by the clock
    expect(r.hourlySales!.find((h) => h.business_date === '2026-11-21' && h.hour === 1)).toMatchObject({ net_sales: 6, ticket_count: 1 });
    expect(z(r, '2026-11-22')!.total_sales).toBe(24);
  });

  it('files a refund on the business date it happened, not the date of the sale', () => {
    // The 23rd: 28.50 sold, minus a 10.00 refund (and its 2.00 tip) of an order from the 20th
    expect(z(r, '2026-11-23')).toMatchObject({ total_sales: 18.5, cc_tips: 2 });
    expect(r.zReports.map((x) => x.report_date)).toEqual(['2026-11-21', '2026-11-22', '2026-11-23']);
  });

  it('leaves the split NULL when a payment type is not cash or credit', () => {
    const n = z(r, '2026-11-22')!;
    expect(n.total_sales).toBe(24);
    expect(n).not.toHaveProperty('cash_sales');
    expect(n).not.toHaveProperty('card_sales');
  });

  it('treats an unknown payment type like any other non-cash tender, and still counts the sale', () => {
    const o = fx.ord('X', 20261121, null, [fx.chk('CX', 9, [fx.pay('PX', 'CRYPTO', 9, '2026-11-22T02:00:00Z', { tipAmount: 1 })])]);
    const out = one([o]);
    expect(out.zReports[0]).toMatchObject({ total_sales: 9, cc_tips: 1 });
    expect(out.zReports[0]).not.toHaveProperty('cash_sales');
  });

  it('a payment that was voided or denied counts for nothing', () => {
    const o = fx.ord('X', 20261121, null, [fx.chk('CX', 20, [
      fx.pay('PA', 'CREDIT', 20, '2026-11-22T02:00:00Z', { paymentStatus: 'VOIDED', tipAmount: 5 }),
      fx.pay('PB', 'CASH', 20, '2026-11-22T02:01:00Z'),
    ])]);
    expect(one([o]).zReports[0]).toMatchObject({ total_sales: 20, cc_tips: 0, cash_sales: 20, card_sales: 0 });
  });

  it('moves an auto-gratuity service charge out of sales and into tips', () => {
    const o = fx.ord('X', 20261121, null, [fx.chk('CX', 120, [fx.pay('PX', 'CREDIT', 130, '2026-11-22T02:00:00Z', { tipAmount: 5 })], [], {
      appliedServiceCharges: [{ chargeAmount: 20, gratuity: true }, { chargeAmount: 0, gratuity: false }],
    })]);
    expect(one([o]).zReports[0]).toMatchObject({ total_sales: 100, cc_tips: 25 });
  });

  it('omits the split when the payments do not exist to split by', () => {
    const o = fx.ord('X', 20261121, null, [fx.chk('CX', 5, [])]);
    const row = one([o]).zReports[0];
    expect(row.total_sales).toBe(5);
    expect(row).not.toHaveProperty('cash_sales');
  });

  it('stays exact where float sums drift', () => {
    const o = fx.ord('X', 20261121, null, [
      fx.chk('CA', 0.1, [fx.pay('PA', 'CASH', 0.1, '2026-11-22T02:00:00Z')]),
      fx.chk('CB', 0.2, [fx.pay('PB', 'CASH', 0.2, '2026-11-22T02:01:00Z')]),
    ]);
    expect(one([o]).zReports[0].total_sales).toBe(0.3);
    const three = fx.ord('Y', 20261121, null, [fx.chk('CC', 59.97, [fx.pay('PC', 'CASH', 59.97, '2026-11-22T02:02:00Z')], [
      fx.sel('SA', 'Case', 59.97, 'i-x', { quantity: 3 }),
    ])]);
    const out = one([three]);
    expect(out.zReports[0].total_sales).toBe(59.97);
    expect(out.itemAudit![0]).toMatchObject({ qty_sold: 3, net_sales: 59.97 });
  });

  it('reads cents when told the API sends cents', () => {
    const o = fx.ord('X', 20261121, null, [fx.chk('CX', 1999, [fx.pay('PX', 'CASH', 1999, '2026-11-22T02:00:00Z')])]);
    expect(one([o], { amountsInCents: true }).zReports[0].total_sales).toBe(19.99);
  });

  it('refuses to store a negative night and says so', () => {
    const o = fx.ord('X', 20261121, null, [fx.chk('CX', 10, [fx.pay('PX', 'CREDIT', 10, '2026-11-22T02:00:00Z', {
      refund: { refundAmount: 25, tipRefundAmount: 0, refundBusinessDate: 20261121 },
    })])]);
    const out = one([o]);
    expect(out.zReports).toEqual([]);
    expect(out.errors.join(' ')).toMatch(/negative night/);
  });

  it('only returns nights inside the requested window', () => {
    const out = mapToast({ ...base, from: '2026-11-22', to: '2026-11-22' });
    expect(out.zReports.map((x) => x.report_date)).toEqual(['2026-11-22']);
  });
});

describe('mapToast, cash tips from time entries', () => {
  const r = mapToast(base);
  it('sums declared cash tips for the business date, skipping deleted entries', () => {
    expect(z(r, '2026-11-21')!.cash_tips).toBe(19.75);
  });
  it('writes a declared zero, and leaves a night with no entries unreported', () => {
    expect(z(r, '2026-11-23')!.cash_tips).toBe(0);
    expect(z(r, '2026-11-22')).not.toHaveProperty('cash_tips');
  });
  it('omits cash tips entirely when the labor feed was not fetched', () => {
    for (const row of mapToast({ ...base, timeEntries: null }).zReports) expect(row).not.toHaveProperty('cash_tips');
  });
});

describe('mapToast, hourly and servers', () => {
  const r = mapToast(base);
  it('buckets payments by local hour on their business night', () => {
    const h = r.hourlySales!.filter((x) => x.business_date === '2026-11-21');
    expect(h.map((x) => [x.hour, x.net_sales, x.ticket_count, x.tips])).toEqual([
      [1, 6, 1, 0], [20, 15, 1, 3], [21, 12, 1, 2.4], [22, 30, 2, 2],
    ]);
  });
  it('totals servers by name, preferring a chosen name', () => {
    const s = r.serverSales!.filter((x) => x.business_date === '2026-11-21');
    expect(s.map((x) => [x.server_name, x.net_sales, x.ticket_count, x.tips])).toEqual([
      ['Alice Reyes', 21, 2, 3], ['Bob', 30, 2, 2], ['Carol Ng', 12, 1, 2.4],
    ]);
  });
  it('leaves servers undefined when employees were not fetched', () => {
    expect(mapToast({ ...base, employees: null }).serverSales).toBeUndefined();
  });
});

describe('mapToast, items', () => {
  const r = mapToast(base);
  const night = (d: string) => r.itemAudit!.filter((x) => x.sale_date === d).map((x) => [x.item_name, x.category_name, x.qty_sold, x.net_sales]);

  it('lists what sold, with categories from the menu, and nothing that was voided', () => {
    expect(night('2026-11-21')).toEqual([
      ['Bud Light', 'Beer', 2, 12],
      ['Fries', 'Sides', 1, 6],
      ['Margarita', 'Cocktails', 2, 21],
      ['Wings', 'Kitchen', 2, 24],
    ]);
  });
  it('counts quantity and ignores open tabs', () => {
    expect(night('2026-11-23')).toEqual([['Margarita', 'Cocktails', 2, 28.5]]);
  });
  it('is undefined for the items feed when items were not asked for', () => {
    expect(mapToast({ ...base, includeItems: false }).itemAudit).toBeUndefined();
  });
  it('still maps names when the menu could not be read, with no category', () => {
    const out = mapToast({ ...base, menu: null });
    expect(out.itemAudit!.find((x) => x.item_name === 'Wings' && x.sale_date === '2026-11-22')!.category_name).toBe('');
  });
  it('skips a selection with no name anywhere', () => {
    const o = fx.ord('X', 20261121, null, [fx.chk('CX', 4, [fx.pay('PX', 'CASH', 4, '2026-11-22T02:00:00Z')], [
      { guid: 'S', price: 4, quantity: 1, item: { guid: 'unknown' } },
    ])]);
    expect(one([o]).itemAudit).toEqual([]);
  });
});

describe('mapToast, shifts', () => {
  const r = mapToast(base);
  it('books overtime as plain hours so the pay run applies the weekly rule once', () => {
    const alice = r.ewReports!.find((x) => x.employee_name === 'Alice Reyes')!;
    expect(alice).toMatchObject({ shift_date: '2026-11-21', regular_hours: 10, overtime_hours: 0, total_sales: 21, tips_paid_out: 0 });
  });
  it('skips someone still clocked in, and deleted entries', () => {
    expect(r.ewReports!.map((x) => `${x.shift_date} ${x.employee_name}`)).toEqual([
      '2026-11-21 Alice Reyes', '2026-11-21 Bob', '2026-11-23 Bob',
    ]);
  });
  it('is undefined when the labor feed was not fetched', () => {
    expect(mapToast({ ...base, timeEntries: null }).ewReports).toBeUndefined();
  });
});
