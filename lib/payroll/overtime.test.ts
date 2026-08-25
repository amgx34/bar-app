import { describe, it, expect } from 'vitest';
import {
  overtimeFromSettings, overtimePay, describeOvertime, DEFAULT_OVERTIME_MULTIPLIER,
  splitWeeklyOvertime, WEEKLY_OVERTIME_THRESHOLD,
} from './overtime';

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

/**
 * Overtime is a WEEKLY rule, not a daily one.
 *
 * Every source of hours used to decide overtime per day — the Toast sync split
 * at eight hours flat, and the POS feeds passed through whatever their own
 * daily rule produced. A bar does not work eight-hour days: a close runs past
 * midnight and one shift is routinely ten or eleven hours. That paid a premium
 * on a 30-hour week and, worse, made the figure depend on which importer the
 * hours arrived through.
 *
 * The threshold is per workweek starting Monday, matching defaultWeek() — a
 * bar's Sunday belongs to the week that preceded it.
 */
describe('splitWeeklyOvertime', () => {
  const shift = (date: string, hours: number) => ({ date, hours });

  it('pays no overtime for long days inside a short week', () => {
    // Three eleven-hour closes: 33 hours. The old daily rule called nine of
    // these overtime; the week never reached forty.
    const r = splitWeeklyOvertime([
      shift('2026-08-17', 11), shift('2026-08-18', 11), shift('2026-08-19', 11),
    ]);
    expect(r.regularHours).toBeCloseTo(33);
    expect(r.overtimeHours).toBe(0);
  });

  it('pays overtime only on the hours past forty', () => {
    const r = splitWeeklyOvertime([
      shift('2026-08-17', 10), shift('2026-08-18', 10),
      shift('2026-08-19', 10), shift('2026-08-20', 10),
      shift('2026-08-21', 5),
    ]);
    expect(r.regularHours).toBeCloseTo(40);
    expect(r.overtimeHours).toBeCloseTo(5);
  });

  it('counts a week that starts on Monday and ends on Sunday', () => {
    // Sun 2026-08-23 closes the week that began Mon 2026-08-17, so these 42
    // hours are one week and two of them are overtime.
    const r = splitWeeklyOvertime([
      shift('2026-08-17', 20), shift('2026-08-22', 12), shift('2026-08-23', 10),
    ]);
    expect(r.overtimeHours).toBeCloseTo(2);
  });

  it('starts a fresh forty on Monday rather than pooling the period', () => {
    // Two calendar weeks of 30 hours each. Sixty hours in a fortnight is not
    // twenty hours of overtime — neither week passed forty.
    const r = splitWeeklyOvertime([
      shift('2026-08-19', 30),
      shift('2026-08-26', 30),
    ]);
    expect(r.regularHours).toBeCloseTo(60);
    expect(r.overtimeHours).toBe(0);
  });

  it('adds up overtime from each week separately', () => {
    const r = splitWeeklyOvertime([
      shift('2026-08-19', 45),
      shift('2026-08-26', 44),
    ]);
    expect(r.regularHours).toBeCloseTo(80);
    expect(r.overtimeHours).toBeCloseTo(9);
  });

  it('adds up several shifts in the same week before applying the threshold', () => {
    // Splitting per shift would find no overtime at all here.
    const r = splitWeeklyOvertime([
      shift('2026-08-17', 9), shift('2026-08-18', 9), shift('2026-08-19', 9),
      shift('2026-08-20', 9), shift('2026-08-21', 9),
    ]);
    expect(r.overtimeHours).toBeCloseTo(5);
  });

  it('conserves the hours worked, whatever the split', () => {
    const r = splitWeeklyOvertime([shift('2026-08-17', 38.75), shift('2026-08-18', 7.5)]);
    expect(r.regularHours + r.overtimeHours).toBeCloseTo(46.25);
  });

  it('is empty for somebody with no shifts', () => {
    expect(splitWeeklyOvertime([])).toEqual({ regularHours: 0, overtimeHours: 0 });
  });

  it('ignores junk hours rather than returning NaN', () => {
    const r = splitWeeklyOvertime([
      shift('2026-08-17', Number.NaN), shift('2026-08-18', 8),
    ]);
    expect(r.regularHours).toBeCloseTo(8);
    expect(r.overtimeHours).toBe(0);
  });

  it('skips a row with no usable date rather than inventing a week for it', () => {
    const r = splitWeeklyOvertime([{ date: 'banana', hours: 50 }]);
    expect(r.regularHours).toBeCloseTo(50);
    expect(r.overtimeHours).toBe(0);
  });

  it('uses forty as the threshold', () => {
    expect(WEEKLY_OVERTIME_THRESHOLD).toBe(40);
  });
});
