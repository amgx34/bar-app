import { describe, it, expect } from 'vitest';
import { normaliseServerRows, groupServerRowsByNight } from './server-sales';

describe('normaliseServerRows', () => {
  it('keeps a well-formed row and rounds money to cents', () => {
    expect(normaliseServerRows([
      { business_date: '2026-08-29', server_name: 'Kayla Chen', net_sales: 1840.005, ticket_count: 94, tips: 300.124 },
    ])).toEqual([
      { business_date: '2026-08-29', server_name: 'Kayla Chen', net_sales: 1840.01, ticket_count: 94, tips: 300.12 },
    ]);
  });

  it('trims and collapses whitespace in the name', () => {
    // The name is the natural key. '  Kayla  Chen ' and 'Kayla Chen' must not
    // become two bartenders who each sold half the night.
    expect(normaliseServerRows([
      { business_date: '2026-08-29', server_name: '  Kayla   Chen ', net_sales: 10, ticket_count: 1, tips: 0 },
      { business_date: '2026-08-29', server_name: 'Kayla Chen',      net_sales: 20, ticket_count: 2, tips: 0 },
    ])).toEqual([
      { business_date: '2026-08-29', server_name: 'Kayla Chen', net_sales: 30, ticket_count: 3, tips: 0 },
    ]);
  });

  it('merges names differing only by case', () => {
    expect(normaliseServerRows([
      { business_date: '2026-08-29', server_name: 'KAYLA CHEN', net_sales: 10, ticket_count: 1, tips: 0 },
      { business_date: '2026-08-29', server_name: 'Kayla Chen', net_sales: 20, ticket_count: 2, tips: 0 },
    ])).toHaveLength(1);
  });

  it('keeps the first spelling seen rather than upper-casing the display name', () => {
    const out = normaliseServerRows([
      { business_date: '2026-08-29', server_name: 'Kayla Chen', net_sales: 20, ticket_count: 2, tips: 0 },
      { business_date: '2026-08-29', server_name: 'KAYLA CHEN', net_sales: 10, ticket_count: 1, tips: 0 },
    ]);
    expect(out[0].server_name).toBe('Kayla Chen');
  });

  it('drops rows with no usable name or date', () => {
    expect(normaliseServerRows([
      { business_date: '2026-08-29', server_name: '   ', net_sales: 10, ticket_count: 1, tips: 0 },
      { business_date: '2026-08-29', net_sales: 10, ticket_count: 1, tips: 0 },
      { business_date: 'banana', server_name: 'Kayla Chen', net_sales: 10, ticket_count: 1, tips: 0 },
    ])).toEqual([]);
  });

  it('keeps a server who rang up nothing', () => {
    // Somebody clocked onto a till and sold nothing is a real, reportable fact.
    expect(normaliseServerRows([
      { business_date: '2026-08-29', server_name: 'Wes Berns' },
    ])).toEqual([
      { business_date: '2026-08-29', server_name: 'Wes Berns', net_sales: 0, ticket_count: 0, tips: 0 },
    ]);
  });

  it('rejects a negative ticket count but keeps negative money', () => {
    expect(normaliseServerRows([
      { business_date: '2026-08-29', server_name: 'Wes Berns', net_sales: -40, ticket_count: 1, tips: 0 },
    ])).toHaveLength(1);
    expect(normaliseServerRows([
      { business_date: '2026-08-29', server_name: 'Wes Berns', net_sales: 40, ticket_count: -1, tips: 0 },
    ])).toEqual([]);
  });
});

describe('groupServerRowsByNight', () => {
  it('groups rows by their business date', () => {
    const grouped = groupServerRowsByNight([
      { business_date: '2026-08-29', server_name: 'A', net_sales: 1, ticket_count: 1, tips: 0 },
      { business_date: '2026-08-30', server_name: 'A', net_sales: 1, ticket_count: 1, tips: 0 },
    ]);
    expect([...grouped.keys()].sort()).toEqual(['2026-08-29', '2026-08-30']);
  });
});
