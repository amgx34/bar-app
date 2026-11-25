import { describe, it, expect } from 'vitest';
import { pickDemoPrefill } from './prefill';
import { demoTimeLeft } from './time-left';

describe('pickDemoPrefill', () => {
  it('carries pay, tip, pour and tax settings', () => {
    expect(pickDemoPrefill({ tip_split_percent: 20, barback_tip_pct: 12, default_pour_oz: 1.5, sales_tax_rate: 8.25, overtime_enabled: true }))
      .toEqual({ tip_split_percent: 20, barback_tip_pct: 12, default_pour_oz: 1.5, sales_tax_rate: 8.25, overtime_enabled: true });
  });
  it('never carries identity, bank, POS credentials or demo-only state', () => {
    const out = pickDemoPrefill({
      tip_split_percent: 10, bar_address: '1 Fake St', bar_city: 'Chicago', bar_phone: '555', admin_phone: '555',
      nacha_routing: '1', nacha_account: '2', onboarding_dismissed_at: 'x', timezone: 'America/Chicago',
    });
    expect(out).toEqual({ tip_split_percent: 10 });
  });
  it('rejects hostile values from user-writable metadata', () => {
    expect(pickDemoPrefill({ tip_split_percent: 'all', default_hourly_rate: -1, sales_tax_rate: 1e9, default_pour_oz: 1.25 }))
      .toEqual({ default_pour_oz: 1.25 });
  });
  it('tolerates a missing or non-object settings value', () => {
    for (const v of [null, undefined, 'x', []]) expect(pickDemoPrefill(v)).toEqual({});
  });
});

describe('demoTimeLeft', () => {
  const created = '2026-11-25T00:00:00Z';
  it('is quiet with more than 2 hours left', () => {
    expect(demoTimeLeft(created, new Date('2026-11-25T10:00:00Z'))).toEqual({ expired: false, urgent: false, label: '14 hours' });
  });
  it('is urgent under 2 hours and counts minutes', () => {
    expect(demoTimeLeft(created, new Date('2026-11-25T22:30:00Z'))).toEqual({ expired: false, urgent: true, label: '1 hour 30 minutes' });
    expect(demoTimeLeft(created, new Date('2026-11-25T23:50:00Z'))).toEqual({ expired: false, urgent: true, label: '10 minutes' });
  });
  it('is expired at and after 24 hours', () => {
    expect(demoTimeLeft(created, new Date('2026-11-26T00:00:00Z')).expired).toBe(true);
  });
  it('treats an unreadable date as no clock at all', () => {
    expect(demoTimeLeft('nope', new Date())).toBeNull();
    expect(demoTimeLeft(undefined, new Date())).toBeNull();
  });
});
