import { describe, it, expect } from 'vitest';
import { buildBarSettings, inferTimezone, barSlug, decideCreate } from './create-bar';

describe('inferTimezone', () => {
  it('maps Ohio and Kentucky to New York time', () => {
    expect(inferTimezone('OH')).toBe('America/New_York');
    expect(inferTimezone('KY')).toBe('America/New_York');
    expect(inferTimezone('oh')).toBe('America/New_York');
  });
  it('returns nothing for an unknown or split-zone state, so the form asks', () => {
    expect(inferTimezone('')).toBeUndefined();
    expect(inferTimezone('ZZ')).toBeUndefined();
    expect(inferTimezone('TX')).toBeUndefined();
    expect(inferTimezone(undefined)).toBeUndefined();
  });
});

describe('buildBarSettings', () => {
  it('leaves money fields absent when nobody supplied them', () => {
    const s = buildBarSettings({ name: 'Tavern', bar_state: 'OH' }, {});
    for (const k of ['tip_split_percent', 'default_hourly_rate', 'barback_tip_pct', 'hourly_rates', 'default_pour_oz']) {
      expect(s).not.toHaveProperty(k);
    }
    expect(s.timezone).toBe('America/New_York');
    expect(s.bar_state).toBe('OH');
  });
  it('takes prefill for money fields', () => {
    const s = buildBarSettings({ name: 'T' }, { tip_split_percent: 20, default_hourly_rate: 12 });
    expect(s.tip_split_percent).toBe(20);
    expect(s.default_hourly_rate).toBe(12);
  });
  it('lets explicit input beat prefill', () => {
    const s = buildBarSettings({ name: 'T', tip_split_percent: 10 }, { tip_split_percent: 20 });
    expect(s.tip_split_percent).toBe(10);
  });
  it('an explicit time zone beats the inferred one', () => {
    expect(buildBarSettings({ name: 'T', bar_state: 'OH', timezone: 'America/Chicago' }, {}).timezone).toBe('America/Chicago');
  });
  it('omits timezone when it cannot be inferred', () => {
    expect(buildBarSettings({ name: 'T', bar_state: 'TX' }, {})).not.toHaveProperty('timezone');
  });
});

describe('barSlug', () => {
  it('is lowercase, hyphenated, with the given suffix', () => {
    expect(barSlug("The Tipsy Tavern!", 'abc12')).toBe('the-tipsy-tavern-abc12');
  });
  it('never starts with a hyphen, for unicode or empty names', () => {
    expect(barSlug('', 'abc12')).toBe('bar-abc12');
    expect(barSlug('   ', 'abc12')).toBe('bar-abc12');
    expect(barSlug('Café Ñandú', 'abc12')).toMatch(/^[a-z0-9]/);
    expect(barSlug('酒吧', 'abc12')).toBe('bar-abc12');
    expect(barSlug('---x---', 'abc12')).toBe('x-abc12');
  });
  it('caps the name part at 60 characters', () => {
    expect(barSlug('a'.repeat(200), 'abc12').length).toBe(60 + 1 + 5);
  });
});

describe('decideCreate', () => {
  it('refuses an unverified email', () => {
    expect(decideCreate({ emailConfirmedAt: null, ownedBarId: null })).toEqual({ kind: 'unverified' });
  });
  it('returns the existing bar instead of creating a second', () => {
    expect(decideCreate({ emailConfirmedAt: '2026-01-01', ownedBarId: 'org1' })).toEqual({ kind: 'existing', orgId: 'org1' });
  });
  it('creates when verified with no bar', () => {
    expect(decideCreate({ emailConfirmedAt: '2026-01-01', ownedBarId: null })).toEqual({ kind: 'create' });
  });
  it('checks verification before reuse', () => {
    expect(decideCreate({ emailConfirmedAt: undefined, ownedBarId: 'org1' })).toEqual({ kind: 'unverified' });
  });
});
