import { describe, it, expect } from 'vitest';
import { valueDays } from './day-value';

const noTips = new Map<string, number>();
const ot = { enabled: true, multiplier: 1.5 };

// 2026-09-07 is a Monday.
const week = [
  { date: '2026-09-07', hours: 10 },
  { date: '2026-09-08', hours: 10 },
  { date: '2026-09-09', hours: 10 },
  { date: '2026-09-10', hours: 10 },
  { date: '2026-09-11', hours: 10 },
];

describe('valueDays', () => {
  it('pays every hour at base rate when the week stays under forty', () => {
    const out = valueDays({
      shifts: [{ date: '2026-09-07', hours: 8 }],
      tipsByDate: noTips, hourlyRate: 10, overtime: ot,
      selected: ['2026-09-07'],
    });
    expect(out.days[0].regularHours).toBe(8);
    expect(out.days[0].overtimeHours).toBe(0);
    expect(out.total).toBe(80);
  });

  it('makes the hours after the fortieth premium, chronologically', () => {
    // Mon-Thu use the 40. Friday is entirely overtime.
    const out = valueDays({
      shifts: week, tipsByDate: noTips, hourlyRate: 10, overtime: ot,
      selected: ['2026-09-11'],
    });
    expect(out.days[0].regularHours).toBe(0);
    expect(out.days[0].overtimeHours).toBe(10);
    expect(out.total).toBe(150);
  });

  it('lands a day exactly on the threshold as all regular', () => {
    // Mon-Wed are 30 hours; Thursday's first 10 reach exactly 40, so Thursday
    // is all regular and the premium starts on Friday.
    const out = valueDays({
      shifts: week, tipsByDate: noTips, hourlyRate: 10, overtime: ot,
      selected: ['2026-09-10'],
    });
    expect(out.days[0].regularHours).toBe(10);
    expect(out.days[0].overtimeHours).toBe(0);
  });

  it('splits a day that straddles the threshold into both parts', () => {
    // Mon+Tue+Wed at 12h each = 36. Thursday's 12 hours push the week from 36
    // to 48: only 4 of them are the last regular hours, the other 8 are
    // premium. A buggy all-or-nothing split (whole day overtime once the week
    // would exceed 40) would report 0 regular / 12 overtime here instead.
    const uneven = [
      { date: '2026-09-07', hours: 12 },
      { date: '2026-09-08', hours: 12 },
      { date: '2026-09-09', hours: 12 },
      { date: '2026-09-10', hours: 12 },
    ];
    const out = valueDays({
      shifts: uneven, tipsByDate: noTips, hourlyRate: 10, overtime: ot,
      selected: ['2026-09-10'],
    });
    expect(out.days[0].regularHours).toBe(4);
    expect(out.days[0].overtimeHours).toBe(8);
    expect(out.days[0].wage).toBe(160);
  });

  it('folds two shift rows on the same date before splitting overtime', () => {
    // If the fold were a plain .set() instead of a sum, the second row would
    // silently overwrite the first and the day would be under-counted.
    const out = valueDays({
      shifts: [
        { date: '2026-09-07', hours: 4 },
        { date: '2026-09-07', hours: 5 },
      ],
      tipsByDate: noTips, hourlyRate: 10, overtime: ot,
      selected: ['2026-09-07'],
    });
    expect(out.days[0].hours).toBe(9);
    expect(out.days[0].total).toBe(90);
  });

  it('only makes a day premium when the earlier days used the week up', () => {
    // The same Friday, alone in its week, is ordinary time.
    const out = valueDays({
      shifts: [{ date: '2026-09-11', hours: 10 }],
      tipsByDate: noTips, hourlyRate: 10, overtime: ot,
      selected: ['2026-09-11'],
    });
    expect(out.days[0].overtimeHours).toBe(0);
    expect(out.total).toBe(100);
  });

  it('values only the days that were ticked, contiguous or not', () => {
    const out = valueDays({
      shifts: [
        { date: '2026-09-07', hours: 5 },
        { date: '2026-09-08', hours: 5 },
        { date: '2026-09-09', hours: 5 },
      ],
      tipsByDate: noTips, hourlyRate: 10, overtime: ot,
      selected: ['2026-09-07', '2026-09-09'],
    });
    expect(out.days).toHaveLength(2);
    expect(out.total).toBe(100);
  });

  it('adds the tips attributed to each ticked day', () => {
    const out = valueDays({
      shifts: [{ date: '2026-09-07', hours: 5 }],
      tipsByDate: new Map([['2026-09-07', 60]]),
      hourlyRate: 10, overtime: ot, selected: ['2026-09-07'],
    });
    expect(out.days[0].tips).toBe(60);
    expect(out.total).toBe(110);
  });

  it('prices a ticked day with no shift at zero rather than dropping it', () => {
    // Shown as zero so the owner can see they ticked a night nobody worked.
    const out = valueDays({
      shifts: [], tipsByDate: noTips, hourlyRate: 10, overtime: ot,
      selected: ['2026-09-07'],
    });
    expect(out.days).toHaveLength(1);
    expect(out.days[0].total).toBe(0);
  });

  it('pays overtime hours at base rate when the premium is switched off', () => {
    // Off means no PREMIUM, never unpaid — matching lib/payroll/overtime.ts.
    const out = valueDays({
      shifts: week, tipsByDate: noTips, hourlyRate: 10,
      overtime: { enabled: false, multiplier: 1.5 },
      selected: ['2026-09-11'],
    });
    expect(out.total).toBe(100);
  });

  it('counts each workweek separately', () => {
    // 2026-09-14 is the next Monday: a fresh forty, so nothing is premium.
    const out = valueDays({
      shifts: [...week, { date: '2026-09-14', hours: 10 }],
      tipsByDate: noTips, hourlyRate: 10, overtime: ot,
      selected: ['2026-09-14'],
    });
    expect(out.days[0].overtimeHours).toBe(0);
  });
});

describe('per-day tips are the same money as the period total', () => {
  it('values a day from the same map computePayroll produced', () => {
    const out = valueDays({
      shifts: [{ date: '2026-09-07', hours: 5 }],
      tipsByDate: new Map(Object.entries({ '2026-09-07': 40.25 })),
      hourlyRate: 10, overtime: { enabled: true, multiplier: 1.5 },
      selected: ['2026-09-07'],
    });
    expect(out.total).toBe(90.25);
  });
});
