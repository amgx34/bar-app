import { describe, it, expect } from 'vitest';
import {
  classifyTipRole,
  tipExclusionReason,
  barbackFractionFromSettings,
} from './tip-pool';

/**
 * These rules decide who gets a share of a night's tips. They were duplicated
 * between the payroll engine and the Day Split screen and drifted apart, so the
 * point of this file is to pin the behaviour down in one place that both now
 * depend on.
 */
describe('classifyTipRole', () => {
  it('puts a pooled bartender in the pool', () => {
    expect(classifyTipRole({ role: 'bartender', tipMode: 'pool' })).toBe('pool');
  });

  it('recognises a barback by role', () => {
    expect(classifyTipRole({ role: 'barback', tipMode: 'pool' })).toBe('barback');
  });

  it('recognises a barback by tip mode when the role is blank', () => {
    // Bars express this both ways; both have to work or somebody is unpaid.
    expect(classifyTipRole({ role: null, tipMode: 'barback' })).toBe('barback');
  });

  it('excludes managers and security even when their tip mode says pool', () => {
    expect(classifyTipRole({ role: 'manager', tipMode: 'pool' })).toBe('none');
    expect(classifyTipRole({ role: 'security', tipMode: 'pool' })).toBe('none');
  });

  it('excludes anyone set to no_tip, whatever their role', () => {
    // no_tip has to win over everything, including a barback role, or somebody
    // deliberately taken out of the arrangement collects anyway.
    expect(classifyTipRole({ role: 'bartender', tipMode: 'no_tip' })).toBe('none');
    expect(classifyTipRole({ role: 'barback', tipMode: 'no_tip' })).toBe('none');
  });

  it('excludes tip modes that are paid some other way', () => {
    expect(classifyTipRole({ role: 'bartender', tipMode: 'individual' })).toBe('none');
    expect(classifyTipRole({ role: 'bartender', tipMode: 'sales_pct' })).toBe('none');
  });

  it('excludes an unrecognised tip mode rather than assuming the pool', () => {
    // Guessing "pool" here would quietly dilute everyone else's share.
    expect(classifyTipRole({ role: 'bartender', tipMode: 'something_new' })).toBe('none');
    expect(classifyTipRole({ role: 'bartender', tipMode: null })).toBe('none');
  });

  it('is not case or whitespace sensitive', () => {
    // Roles come from a fixed lowercase dropdown, but CSV and POS imports do not.
    expect(classifyTipRole({ role: ' Barback ', tipMode: 'pool' })).toBe('barback');
    expect(classifyTipRole({ role: 'Manager', tipMode: 'POOL' })).toBe('none');
    expect(classifyTipRole({ role: 'Bartender', tipMode: 'Pool' })).toBe('pool');
  });
});

describe('tipExclusionReason', () => {
  it('gives no reason for somebody who IS in the split', () => {
    expect(tipExclusionReason({ role: 'bartender', tipMode: 'pool' })).toBeNull();
    expect(tipExclusionReason({ role: 'barback', tipMode: 'barback' })).toBeNull();
  });

  it('names the specific reason so the row explains itself', () => {
    expect(tipExclusionReason({ role: 'bartender', tipMode: 'no_tip' }))
      .toBe('Set to Not Tipped');
    expect(tipExclusionReason({ role: 'bartender', tipMode: 'individual' }))
      .toBe('Keeps their own tips');
    expect(tipExclusionReason({ role: 'manager', tipMode: 'pool' }))
      .toBe('Manager — not in the tip pool');
  });

  it('always returns something for an excluded person', () => {
    // A blank reason next to a missing name reads as a bug in the calculator.
    const reason = tipExclusionReason({ role: null, tipMode: 'mystery' });
    expect(reason).toBeTruthy();
  });
});

describe('barbackFractionFromSettings', () => {
  it('defaults to 15% when unset', () => {
    expect(barbackFractionFromSettings({})).toBeCloseTo(0.15);
    expect(barbackFractionFromSettings({ barback_tip_pct: null })).toBeCloseTo(0.15);
  });

  it('uses the configured percentage', () => {
    // The bug this file exists for: Day Split ignored this and always used 15%.
    expect(barbackFractionFromSettings({ barback_tip_pct: 20 })).toBeCloseTo(0.20);
    expect(barbackFractionFromSettings({ barback_tip_pct: 0 })).toBe(0);
  });

  it('clamps values outside 0-100 rather than inverting the split', () => {
    expect(barbackFractionFromSettings({ barback_tip_pct: 150 })).toBe(1);
    expect(barbackFractionFromSettings({ barback_tip_pct: -10 })).toBe(0);
  });
});
