import { describe, it, expect } from 'vitest';
import { normaliseHourlyRows, groupByNight } from './hourly-sales';

describe('normaliseHourlyRows', () => {
  it('keeps a well-formed row and rounds money to cents', () => {
    expect(normaliseHourlyRows([
      { business_date: '2026-08-29', hour: 23, net_sales: 890.005, ticket_count: 41, tips: 120.126 },
    ])).toEqual([
      { business_date: '2026-08-29', hour: 23, net_sales: 890.01, ticket_count: 41, tips: 120.13 },
    ]);
  });

  it('keeps hour 0 and hour 23, which bracket the night', () => {
    const out = normaliseHourlyRows([
      { business_date: '2026-08-29', hour: 0, net_sales: 10, ticket_count: 1, tips: 0 },
      { business_date: '2026-08-29', hour: 23, net_sales: 20, ticket_count: 2, tips: 0 },
    ]);
    expect(out.map((r) => r.hour)).toEqual([0, 23]);
  });

  it('drops rows the POS could not date or hour', () => {
    // These arrive over HTTP from an agent on someone else's hardware. A bad
    // row must not become an hour of trade attributed to the wrong night.
    expect(normaliseHourlyRows([
      { business_date: 'banana', hour: 3, net_sales: 10, ticket_count: 1, tips: 0 },
      { business_date: '2026-08-29', hour: 24, net_sales: 10, ticket_count: 1, tips: 0 },
      { business_date: '2026-08-29', hour: -1, net_sales: 10, ticket_count: 1, tips: 0 },
      { business_date: '2026-08-29', hour: 1.5, net_sales: 10, ticket_count: 1, tips: 0 },
      { business_date: '2026-08-29', net_sales: 10, ticket_count: 1, tips: 0 },
    ])).toEqual([]);
  });

  it('treats missing money as zero but never as a dropped row', () => {
    // An hour that traded no money still traded: it is a real, quiet hour, and
    // dropping it would make the curve claim the bar was shut.
    expect(normaliseHourlyRows([
      { business_date: '2026-08-29', hour: 15 },
    ])).toEqual([
      { business_date: '2026-08-29', hour: 15, net_sales: 0, ticket_count: 0, tips: 0 },
    ]);
  });

  it('sums duplicate hours rather than letting one win', () => {
    // The Hist and Daily tables are UNIONed at source, so the same hour can
    // arrive twice. An upsert would keep whichever landed last and silently
    // halve the night.
    expect(normaliseHourlyRows([
      { business_date: '2026-08-29', hour: 22, net_sales: 100, ticket_count: 5, tips: 10 },
      { business_date: '2026-08-29', hour: 22, net_sales: 50,  ticket_count: 3, tips: 5 },
    ])).toEqual([
      { business_date: '2026-08-29', hour: 22, net_sales: 150, ticket_count: 8, tips: 15 },
    ]);
  });

  it('coerces numeric strings, which JSON round-trips produce', () => {
    expect(normaliseHourlyRows([
      { business_date: '2026-08-29', hour: '22', net_sales: '100.50', ticket_count: '5', tips: '0' },
    ])).toEqual([
      { business_date: '2026-08-29', hour: 22, net_sales: 100.5, ticket_count: 5, tips: 0 },
    ]);
  });

  it('rejects a negative ticket count but keeps negative money', () => {
    // Net sales can legitimately go negative on a refund hour. A negative
    // ticket count cannot happen and signals a broken feed.
    expect(normaliseHourlyRows([
      { business_date: '2026-08-29', hour: 2, net_sales: -40, ticket_count: 1, tips: 0 },
    ])).toEqual([
      { business_date: '2026-08-29', hour: 2, net_sales: -40, ticket_count: 1, tips: 0 },
    ]);
    expect(normaliseHourlyRows([
      { business_date: '2026-08-29', hour: 2, net_sales: 40, ticket_count: -1, tips: 0 },
    ])).toEqual([]);
  });
});

describe('groupByNight', () => {
  it('groups rows by their business date', () => {
    const grouped = groupByNight([
      { business_date: '2026-08-29', hour: 22, net_sales: 1, ticket_count: 1, tips: 0 },
      { business_date: '2026-08-29', hour: 23, net_sales: 1, ticket_count: 1, tips: 0 },
      { business_date: '2026-08-30', hour: 22, net_sales: 1, ticket_count: 1, tips: 0 },
    ]);
    expect([...grouped.keys()].sort()).toEqual(['2026-08-29', '2026-08-30']);
    expect(grouped.get('2026-08-29')).toHaveLength(2);
  });

  it('returns an empty map for no rows', () => {
    expect(groupByNight([]).size).toBe(0);
  });
});
