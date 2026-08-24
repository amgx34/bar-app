import { describe, it, expect } from 'vitest';
import { overtimeFromSettings, overtimePay, describeOvertime, DEFAULT_OVERTIME_MULTIPLIER } from './overtime';

describe('overtimeFromSettings', () => {
  it('defaults to time-and-a-half when never configured', () => {
    // Every pay run before this setting existed used 1.5x. A bar that has not
    // touched it must not have its overtime quietly reduced.
    for (const s of [{}, { overtime_enabled: null }, { overtime_multiplier: null }]) {
      expect(overtimeFromSettings(s)).toEqual({ enabled: true, multiplier: DEFAULT_OVERTIME_MULTIPLIER });
    }
  });

  it('only an explicit false turns it off', () => {
    expect(overtimeFromSettings({ overtime_enabled: false }).enabled).toBe(false);
    expect(overtimeFromSettings({ overtime_enabled: true }).enabled).toBe(true);
  });

  it('honours a custom multiplier', () => {
    expect(overtimeFromSettings({ overtime_multiplier: 2 }).multiplier).toBe(2);
  });

  it('refuses a multiplier below 1', () => {
    // Paying overtime less than normal hours is never a real arrangement — far
    // more likely 0.5 was typed meaning "plus 50%".
    expect(overtimeFromSettings({ overtime_multiplier: 0.5 }).multiplier).toBe(1.5);
    expect(overtimeFromSettings({ overtime_multiplier: 0 }).multiplier).toBe(1.5);
    expect(overtimeFromSettings({ overtime_multiplier: -2 }).multiplier).toBe(1.5);
  });

  it('caps an absurd multiplier and ignores junk', () => {
    expect(overtimeFromSettings({ overtime_multiplier: 500 }).multiplier).toBe(5);
    expect(overtimeFromSettings({ overtime_multiplier: NaN }).multiplier).toBe(1.5);
  });
});

describe('overtimePay', () => {
  const on = { enabled: true, multiplier: 1.5 };
  const off = { enabled: false, multiplier: 1.5 };

  it('pays the premium when enabled', () => {
    expect(overtimePay(10, 20, on)).toBeCloseTo(300);
  });

  it('still pays the hours at base rate when disabled', () => {
    // Off means no PREMIUM. The hours were worked and are still owed.
    expect(overtimePay(10, 20, off)).toBeCloseTo(200);
  });

  it('honours a 2x agreement', () => {
    expect(overtimePay(10, 20, { enabled: true, multiplier: 2 })).toBeCloseTo(400);
  });

  it('is zero for no overtime, and never negative', () => {
    expect(overtimePay(0, 20, on)).toBe(0);
    expect(overtimePay(-5, 20, on)).toBe(0);
    expect(overtimePay(10, 0, on)).toBe(0);
  });

  it('copes with junk instead of returning NaN', () => {
    expect(overtimePay(NaN, 20, on)).toBe(0);
    expect(overtimePay(10, NaN, on)).toBe(0);
  });
});

describe('describeOvertime', () => {
  it('says what will actually happen', () => {
    expect(describeOvertime({ enabled: true, multiplier: 1.5 })).toMatch(/1.5x/);
    expect(describeOvertime({ enabled: false, multiplier: 1.5 })).toMatch(/base rate/);
  });
});
