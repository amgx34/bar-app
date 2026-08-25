import { describe, it, expect } from 'vitest';
import {
  classifyTipRole,
  tipExclusionReason,
  barbackFractionFromSettings,
  normalizePayType,
  splitBarbackTips,
  barbackSplitFromSettings,
  barbackTiersFromSettings,
  paysHourlyWage,
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

describe('normalizePayType', () => {
  it('defaults to percentage when unset', () => {
    // The whole feature is opt-in. An employee row that predates the column,
    // or a blank value, must keep taking their tip cut exactly as before.
    expect(normalizePayType(null)).toBe('percentage');
    expect(normalizePayType(undefined)).toBe('percentage');
    expect(normalizePayType('')).toBe('percentage');
  });

  it('reads hourly, case- and space-insensitively', () => {
    expect(normalizePayType('hourly')).toBe('hourly');
    expect(normalizePayType(' Hourly ')).toBe('hourly');
    expect(normalizePayType('HOURLY')).toBe('hourly');
  });

  it('treats an unrecognised value as percentage rather than guessing', () => {
    expect(normalizePayType('salaried')).toBe('percentage');
  });
});

describe('splitBarbackTips', () => {
  const pct = (employeeId: string) => ({ employeeId, payType: 'percentage' as const });
  const hr = (employeeId: string) => ({ employeeId, payType: 'hourly' as const });

  it('splits the cut equally when every barback is on percentage', () => {
    const r = splitBarbackTips({ dailyTips: 1000, barbackFraction: 0.15, barbackShifts: [pct('a'), pct('b')] });
    expect(r.tipsByEmployee.get('a')).toBeCloseTo(75);
    expect(r.tipsByEmployee.get('b')).toBeCloseTo(75);
    expect(r.poolTips).toBeCloseTo(850);
    expect(r.returnedToPool).toBeCloseTo(0);
  });

  it('does NOT enlarge the other barback when one goes hourly', () => {
    // The whole point. Filtering the hourly barback out of the divisor would
    // pay `b` the full 15% AND pay `a` an hourly wage for the same night.
    const r = splitBarbackTips({ dailyTips: 1000, barbackFraction: 0.15, barbackShifts: [hr('a'), pct('b')] });
    expect(r.tipsByEmployee.get('a')).toBeUndefined();
    expect(r.tipsByEmployee.get('b')).toBeCloseTo(75);
    expect(r.returnedToPool).toBeCloseTo(75);
    expect(r.poolTips).toBeCloseTo(925);
  });

  it('gives the bartenders the whole night when the only barback is hourly', () => {
    const r = splitBarbackTips({ dailyTips: 1000, barbackFraction: 0.15, barbackShifts: [hr('a')] });
    expect(r.tipsByEmployee.size).toBe(0);
    expect(r.poolTips).toBeCloseTo(1000);
  });

  it('behaves exactly as before when no barback worked', () => {
    const r = splitBarbackTips({ dailyTips: 1000, barbackFraction: 0.15, barbackShifts: [] });
    expect(r.poolTips).toBeCloseTo(1000);
    expect(r.returnedToPool).toBeCloseTo(0);
  });

  it('conserves the night total in every arrangement', () => {
    // Payroll reconciles against the Z report. If a split invents or loses a
    // cent, the night stops balancing and nobody can tell where it went.
    for (const shifts of [
      [pct('a'), pct('b')],
      [hr('a'), pct('b')],
      [hr('a'), hr('b')],
      [pct('a'), pct('b'), hr('c')],
      [],
    ]) {
      const r = splitBarbackTips({ dailyTips: 1234.56, barbackFraction: 0.15, barbackShifts: shifts });
      const paid = [...r.tipsByEmployee.values()].reduce((s, v) => s + v, 0);
      expect(paid + r.poolTips).toBeCloseTo(1234.56, 6);
    }
  });

  it('adds up two shifts by the same barback on one night', () => {
    // A split shift is two rows for one person; they hold two slots and must
    // be paid for both, not overwritten by the second.
    const r = splitBarbackTips({ dailyTips: 1000, barbackFraction: 0.15, barbackShifts: [pct('a'), pct('a')] });
    expect(r.tipsByEmployee.get('a')).toBeCloseTo(150);
    expect(r.poolTips).toBeCloseTo(850);
  });

  it('pays nothing and keeps the total when the night made no tips', () => {
    const r = splitBarbackTips({ dailyTips: 0, barbackFraction: 0.15, barbackShifts: [pct('a')] });
    expect(r.tipsByEmployee.get('a')).toBeCloseTo(0);
    expect(r.poolTips).toBeCloseTo(0);
  });
});

describe('splitBarbackTips and zero-hour shifts', () => {
  const shift = (employeeId: string, hours: number) =>
    ({ employeeId, payType: 'percentage' as const, hours });

  it('does not pay a barback whose hours were zeroed', () => {
    // "Remove from shift" sets hours to 0; it does not delete the row. The
    // barback cut splits by headcount, so without this a barback marked as not
    // working still collected a full share — which is exactly how somebody
    // logged as "wasnt working" was paid $117.20.
    const r = splitBarbackTips({
      dailyTips: 1000, barbackFraction: 0.15,
      barbackShifts: [shift('worked', 6), shift('removed', 0)],
    });
    expect(r.tipsByEmployee.get('removed')).toBeUndefined();
    expect(r.tipsByEmployee.get('worked')).toBeCloseTo(150);
  });

  it('does not shrink the other barbacks when one is removed', () => {
    // The removed shift is not a slot at all, so the remaining barback takes
    // the whole cut rather than half of it.
    const r = splitBarbackTips({
      dailyTips: 1000, barbackFraction: 0.15,
      barbackShifts: [shift('a', 5), shift('b', 0)],
    });
    expect(r.tipsByEmployee.get('a')).toBeCloseTo(150);
    expect(r.poolTips).toBeCloseTo(850);
  });

  it('gives the night to the bartenders when every barback was removed', () => {
    const r = splitBarbackTips({
      dailyTips: 1000, barbackFraction: 0.15,
      barbackShifts: [shift('a', 0), shift('b', 0)],
    });
    expect(r.tipsByEmployee.size).toBe(0);
    expect(r.poolTips).toBeCloseTo(1000);
  });

  it('still pays when hours are simply not recorded', () => {
    // undefined is "we do not know", which is not the same as a deliberate zero.
    const r = splitBarbackTips({
      dailyTips: 1000, barbackFraction: 0.15,
      barbackShifts: [{ employeeId: 'a', payType: 'percentage' }],
    });
    expect(r.tipsByEmployee.get('a')).toBeCloseTo(150);
  });
});

describe('barbackSplitFromSettings', () => {
  it('defaults to splitting by hours, like the bartender pool', () => {
    expect(barbackSplitFromSettings({})).toBe('hours');
    expect(barbackSplitFromSettings({ barback_split_method: null })).toBe('hours');
  });

  it('honours an explicit equal split', () => {
    expect(barbackSplitFromSettings({ barback_split_method: 'equal' })).toBe('equal');
  });

  it('treats anything unrecognised as hours rather than guessing', () => {
    expect(barbackSplitFromSettings({ barback_split_method: 'sideways' })).toBe('hours');
  });
});

describe('splitBarbackTips by hours', () => {
  const s = (employeeId: string, hours: number) =>
    ({ employeeId, payType: 'percentage' as const, hours });

  it('weights the cut by hours worked', () => {
    // 6h and 2h -> 3:1. Equal headcount would have paid them $75 each.
    const r = splitBarbackTips({
      dailyTips: 1000, barbackFraction: 0.15, method: 'hours',
      barbackShifts: [s('long', 6), s('short', 2)],
    });
    expect(r.tipsByEmployee.get('long')).toBeCloseTo(112.5);
    expect(r.tipsByEmployee.get('short')).toBeCloseTo(37.5);
    expect(r.poolTips).toBeCloseTo(850);
  });

  it('still splits equally when asked to', () => {
    const r = splitBarbackTips({
      dailyTips: 1000, barbackFraction: 0.15, method: 'equal',
      barbackShifts: [s('long', 6), s('short', 2)],
    });
    expect(r.tipsByEmployee.get('long')).toBeCloseTo(75);
    expect(r.tipsByEmployee.get('short')).toBeCloseTo(75);
  });

  it('adds up two shifts by the same barback', () => {
    const r = splitBarbackTips({
      dailyTips: 1000, barbackFraction: 0.15, method: 'hours',
      barbackShifts: [s('a', 3), s('a', 5)],
    });
    expect(r.tipsByEmployee.get('a')).toBeCloseTo(150);
  });

  it('gives an hourly barback nothing and does not enlarge the others', () => {
    const r = splitBarbackTips({
      dailyTips: 1000, barbackFraction: 0.15, method: 'hours',
      barbackShifts: [
        { employeeId: 'paid', payType: 'percentage', hours: 5 },
        { employeeId: 'wage', payType: 'hourly', hours: 5 },
      ],
    });
    expect(r.tipsByEmployee.get('wage')).toBeUndefined();
    // Half the cut, because the hourly barback still held their slot.
    expect(r.tipsByEmployee.get('paid')).toBeCloseTo(75);
    expect(r.returnedToPool).toBeCloseTo(75);
  });

  it('falls back to an equal split when no hours were recorded', () => {
    // Weighting by hours is impossible here, and paying nobody would be worse:
    // they worked, the hours just were not entered.
    const r = splitBarbackTips({
      dailyTips: 1000, barbackFraction: 0.15, method: 'hours',
      barbackShifts: [
        { employeeId: 'a', payType: 'percentage' },
        { employeeId: 'b', payType: 'percentage' },
      ],
    });
    expect(r.tipsByEmployee.get('a')).toBeCloseTo(75);
    expect(r.tipsByEmployee.get('b')).toBeCloseTo(75);
  });

  it('conserves the night whichever method is used', () => {
    for (const method of ['hours', 'equal'] as const) {
      const r = splitBarbackTips({
        dailyTips: 1234.56, barbackFraction: 0.15, method,
        barbackShifts: [s('a', 7.25), s('b', 1.5), s('c', 4)],
      });
      const paid = [...r.tipsByEmployee.values()].reduce((t, v) => t + v, 0);
      expect(paid + r.poolTips).toBeCloseTo(1234.56, 6);
    }
  });
});

/**
 * Tiered barback cuts.
 *
 * Some bars pay a bigger cut when more barbacks are on: one barback takes 10%
 * of the night, but two working the same Saturday share 15%. Without tiers the
 * only way to express that was to edit the slider between shifts.
 *
 * The tests below pin down the two things that are easy to get wrong: WHICH
 * barbacks count toward the headcount, and what happens when no tier matches.
 */
describe('barbackTiersFromSettings', () => {
  it('reads nothing while the toggle is off, so the flat slider still governs', () => {
    expect(barbackTiersFromSettings({
      barback_tiers_enabled: false,
      barback_tip_tiers: [{ minCount: 1, pct: 10 }],
    })).toEqual([]);
  });

  it('reads nothing when the toggle is on but no tier was configured', () => {
    expect(barbackTiersFromSettings({ barback_tiers_enabled: true })).toEqual([]);
  });

  it('converts percentages to fractions and sorts by headcount', () => {
    expect(barbackTiersFromSettings({
      barback_tiers_enabled: true,
      barback_tip_tiers: [{ minCount: 3, pct: 20 }, { minCount: 1, pct: 10 }],
    })).toEqual([
      { minCount: 1, fraction: 0.1 },
      { minCount: 3, fraction: 0.2 },
    ]);
  });

  it('drops rows that could never match a real night', () => {
    // A tier for "zero barbacks" is a row that can never be reached — the cut
    // is only taken when somebody barbacked.
    expect(barbackTiersFromSettings({
      barback_tiers_enabled: true,
      barback_tip_tiers: [
        { minCount: 0, pct: 10 },
        { minCount: 2, pct: null },
        { minCount: 2, pct: 15 },
      ],
    })).toEqual([{ minCount: 2, fraction: 0.15 }]);
  });

  it('clamps a percentage outside 0-100 rather than inverting the split', () => {
    expect(barbackTiersFromSettings({
      barback_tiers_enabled: true,
      barback_tip_tiers: [{ minCount: 1, pct: 140 }],
    })).toEqual([{ minCount: 1, fraction: 1 }]);
  });
});

describe('splitBarbackTips with headcount tiers', () => {
  const tiers = [
    { minCount: 1, fraction: 0.10 },
    { minCount: 2, fraction: 0.15 },
    { minCount: 3, fraction: 0.20 },
  ];
  const p = (employeeId: string, hours: number) =>
    ({ employeeId, payType: 'percentage' as const, hours });

  it('takes the cut named by tonight’s headcount', () => {
    const r = splitBarbackTips({
      dailyTips: 1000, barbackFraction: 0.15, method: 'equal', tiers,
      barbackShifts: [p('a', 5), p('b', 5)],
    });
    expect(r.appliedFraction).toBeCloseTo(0.15);
    expect(r.poolTips).toBeCloseTo(850);
  });

  it('pays the one-barback tier when only one worked', () => {
    const r = splitBarbackTips({
      dailyTips: 1000, barbackFraction: 0.15, method: 'equal', tiers,
      barbackShifts: [p('a', 5)],
    });
    expect(r.appliedFraction).toBeCloseTo(0.10);
    expect(r.tipsByEmployee.get('a')).toBeCloseTo(100);
  });

  it('holds at the top tier when more barbacks work than any row names', () => {
    const r = splitBarbackTips({
      dailyTips: 1000, barbackFraction: 0.15, method: 'equal', tiers,
      barbackShifts: [p('a', 5), p('b', 5), p('c', 5), p('d', 5)],
    });
    expect(r.appliedFraction).toBeCloseTo(0.20);
    expect(r.barbackCount).toBe(4);
  });

  it('falls back to the flat slider when no tier covers the headcount', () => {
    // Tiers that start at two leave a one-barback night undescribed. Paying
    // nothing would be the wrong answer — they worked.
    const r = splitBarbackTips({
      dailyTips: 1000, barbackFraction: 0.15, method: 'equal',
      tiers: [{ minCount: 2, fraction: 0.25 }],
      barbackShifts: [p('a', 5)],
    });
    expect(r.appliedFraction).toBeCloseTo(0.15);
    expect(r.tipsByEmployee.get('a')).toBeCloseTo(150);
  });

  it('counts people, not shifts, so a split shift is still one barback', () => {
    const r = splitBarbackTips({
      dailyTips: 1000, barbackFraction: 0.15, method: 'equal', tiers,
      barbackShifts: [p('a', 3), p('a', 4)],
    });
    expect(r.barbackCount).toBe(1);
    expect(r.appliedFraction).toBeCloseTo(0.10);
    expect(r.tipsByEmployee.get('a')).toBeCloseTo(100);
  });

  it('drops to the lower tier when a barback is removed from the shift', () => {
    const r = splitBarbackTips({
      dailyTips: 1000, barbackFraction: 0.15, method: 'equal', tiers,
      barbackShifts: [p('a', 5), p('removed', 0)],
    });
    expect(r.barbackCount).toBe(1);
    expect(r.appliedFraction).toBeCloseTo(0.10);
  });

  it('counts an hourly barback toward the tier, then returns their share', () => {
    // The tier sizes the cut by who is working the floor. The hourly barback
    // holds their slot and hands it back to the bartenders — the same rule as
    // the flat cut, so moving somebody to hourly never shrinks the cut AND
    // takes their slot.
    const r = splitBarbackTips({
      dailyTips: 1000, barbackFraction: 0.15, method: 'equal', tiers,
      barbackShifts: [p('paid', 5), { employeeId: 'wage', payType: 'hourly', hours: 5 }],
    });
    expect(r.barbackCount).toBe(2);
    expect(r.appliedFraction).toBeCloseTo(0.15);
    expect(r.tipsByEmployee.get('paid')).toBeCloseTo(75);
    expect(r.returnedToPool).toBeCloseTo(75);
  });

  it('conserves the night under tiers', () => {
    const r = splitBarbackTips({
      dailyTips: 1234.56, barbackFraction: 0.15, method: 'hours', tiers,
      barbackShifts: [p('a', 7.25), p('b', 1.5), p('c', 4)],
    });
    const paid = [...r.tipsByEmployee.values()].reduce((t, v) => t + v, 0);
    expect(paid + r.poolTips).toBeCloseTo(1234.56, 6);
  });

  it('behaves exactly as before when no tiers are configured', () => {
    const r = splitBarbackTips({
      dailyTips: 1000, barbackFraction: 0.15, method: 'equal', tiers: [],
      barbackShifts: [p('a', 5), p('b', 5)],
    });
    expect(r.appliedFraction).toBeCloseTo(0.15);
    expect(r.tipsByEmployee.get('a')).toBeCloseTo(75);
  });

  it('reports no cut at all when nobody barbacked', () => {
    const r = splitBarbackTips({
      dailyTips: 1000, barbackFraction: 0.15, tiers, barbackShifts: [],
    });
    expect(r.barbackCount).toBe(0);
    expect(r.appliedFraction).toBe(0);
    expect(r.poolTips).toBeCloseTo(1000);
  });
});

/**
 * Tips with no wage behind them.
 *
 * `pay_type` describes what somebody actually receives, and it now has three
 * corners rather than two: wage plus tips (the default), wage only, and tips
 * only. The last is for people who are not on the bar's payroll at all — a
 * contractor behind the stick for a night, a DJ taking a cut — and it is the
 * mirror of 'hourly' rather than a new idea.
 */
describe('normalizePayType and tips-only', () => {
  it('reads tips_only', () => {
    expect(normalizePayType('tips_only')).toBe('tips_only');
  });

  it('is not case or whitespace sensitive about it', () => {
    expect(normalizePayType('  Tips_Only ')).toBe('tips_only');
  });

  it('still treats anything unrecognised as percentage', () => {
    // The safe direction: a typo must never silently stop paying somebody
    // their wage, which is what falling through to tips_only would do.
    expect(normalizePayType('tipsonly')).toBe('percentage');
    expect(normalizePayType('tips only')).toBe('percentage');
  });
});

describe('paysHourlyWage', () => {
  it('pays a wage on the default arrangement', () => {
    expect(paysHourlyWage('percentage')).toBe(true);
  });

  it('pays a wage to somebody on hourly only', () => {
    expect(paysHourlyWage('hourly')).toBe(true);
  });

  it('pays no wage to somebody on tips only', () => {
    expect(paysHourlyWage('tips_only')).toBe(false);
  });
});

describe('splitBarbackTips and tips-only staff', () => {
  it('pays a tips-only barback their full share', () => {
    // The mirror of the hourly case: 'hourly' holds a slot without claiming it,
    // 'tips_only' claims it in full. Only the wage differs.
    const r = splitBarbackTips({
      dailyTips: 1000,
      barbackFraction: 0.15,
      method: 'equal',
      barbackShifts: [
        { employeeId: 'tips', payType: 'tips_only', hours: 5 },
        { employeeId: 'both', payType: 'percentage', hours: 5 },
      ],
    });
    expect(r.tipsByEmployee.get('tips')).toBeCloseTo(75);
    expect(r.tipsByEmployee.get('both')).toBeCloseTo(75);
    expect(r.returnedToPool).toBeCloseTo(0);
  });

  it('does not return a tips-only barback’s share to the bartenders', () => {
    const r = splitBarbackTips({
      dailyTips: 1000,
      barbackFraction: 0.15,
      method: 'equal',
      barbackShifts: [{ employeeId: 'tips', payType: 'tips_only', hours: 5 }],
    });
    expect(r.tipsByEmployee.get('tips')).toBeCloseTo(150);
    expect(r.poolTips).toBeCloseTo(850);
  });
});
