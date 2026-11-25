import { describe, it, expect } from 'vitest';
import { parsePrefill } from './prefill';

describe('parsePrefill', () => {
  it('keeps valid allowed fields', () => {
    expect(parsePrefill({ tip_split_percent: 18, default_hourly_rate: 14, hourly_rates: { bartender: 15 }, overtime_enabled: false }))
      .toEqual({ tip_split_percent: 18, default_hourly_rate: 14, hourly_rates: { bartender: 15 }, overtime_enabled: false });
  });
  it('returns nothing for non-objects', () => {
    for (const v of [null, undefined, 'x', 5, [], true]) expect(parsePrefill(v)).toEqual({});
  });
  it('drops identity and bank keys and unknown keys', () => {
    const out = parsePrefill({ name: 'Evil', bar_city: 'X', nacha_routing: '1', admin_phone: '1', __proto__: { x: 1 }, tip_split_percent: 10 });
    expect(out).toEqual({ tip_split_percent: 10 });
  });
  it('drops hostile values but keeps the good fields beside them', () => {
    const out = parsePrefill({ tip_split_percent: 'lots', default_hourly_rate: -5, default_pour_oz: 1.5, sales_tax_rate: 1e9, hourly_rates: { bartender: 'x' } });
    expect(out).toEqual({ default_pour_oz: 1.5 });
  });
  it('rejects NaN and Infinity', () => {
    expect(parsePrefill({ tip_split_percent: NaN, default_hourly_rate: Infinity })).toEqual({});
  });
});
