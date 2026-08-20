import { describe, it, expect } from 'vitest';
import { applyTipTransfers, openerBonus, openerBonusFromSettings } from './adjustments';

/**
 * The opener bonus has four modes, and the thing that separates them is not the
 * amount — it is WHO PAYS. `fixed` and `percentage` come out of the tip pool,
 * so the opener's extra is the other bartenders' loss. `hours` is paid by the
 * bar as wages and must never touch the pool.
 *
 * Getting that backwards pays the bonus twice or takes it from the wrong people,
 * and neither is visible on any screen until somebody counts their cash.
 */
describe('openerBonus', () => {
  const POOL = 1000;

  it('pays nothing when disabled or set to zero', () => {
    expect(openerBonus({ type: 'none', value: 0 }, POOL))
      .toEqual({ bonusTips: 0, bonusHours: 0, fundedFromPool: 0 });
    expect(openerBonus({ type: 'percentage', value: 0 }, POOL).bonusTips).toBe(0);
  });

  it('takes a fixed bonus out of the pool', () => {
    const b = openerBonus({ type: 'fixed', value: 25 }, POOL);
    expect(b.bonusTips).toBe(25);
    expect(b.fundedFromPool).toBe(25);
    expect(b.bonusHours).toBe(0);
  });

  it('never lets a fixed bonus exceed the pool', () => {
    // A $25 bonus on a $10 night cannot leave the rest of the pool negative.
    const b = openerBonus({ type: 'fixed', value: 25 }, 10);
    expect(b.bonusTips).toBe(10);
    expect(b.fundedFromPool).toBe(10);
  });

  it('takes a percentage out of the pool', () => {
    const b = openerBonus({ type: 'percentage', value: 5 }, POOL);
    expect(b.bonusTips).toBeCloseTo(50);
    expect(b.fundedFromPool).toBeCloseTo(50);
  });

  it('clamps a percentage above 100 rather than over-allocating the night', () => {
    expect(openerBonus({ type: 'percentage', value: 150 }, POOL).bonusTips).toBe(POOL);
  });

  it('pays the hours mode as WAGES, never from the pool', () => {
    // The distinction this whole file turns on.
    const b = openerBonus({ type: 'hours', value: 2 }, POOL);
    expect(b.bonusHours).toBe(2);
    expect(b.bonusTips).toBe(0);
    expect(b.fundedFromPool).toBe(0);
  });

  it('caps bonus hours at a double shift', () => {
    // Hand-entered. A mistyped 80 would add a week's pay to one night.
    expect(openerBonus({ type: 'hours', value: 80 }, POOL).bonusHours).toBe(24);
  });

  it('never funds more than the pool holds, whatever the mode', () => {
    for (const cfg of [
      { type: 'fixed' as const, value: 9999 },
      { type: 'percentage' as const, value: 100 },
      { type: 'hours' as const, value: 24 },
    ]) {
      expect(openerBonus(cfg, POOL).fundedFromPool).toBeLessThanOrEqual(POOL);
    }
  });

  it('does not hand money back on a night with no tips', () => {
    for (const cfg of [
      { type: 'fixed' as const, value: 25 },
      { type: 'percentage' as const, value: 5 },
    ]) {
      const b = openerBonus(cfg, 0);
      expect(b.bonusTips).toBe(0);
      expect(b.fundedFromPool).toBe(0);
    }
  });
});

describe('openerBonusFromSettings', () => {
  it('reads a configured mode', () => {
    expect(openerBonusFromSettings({ opener_bonus_type: 'hours', opener_bonus_value: 2 }))
      .toEqual({ type: 'hours', value: 2 });
  });

  it('falls back to none for missing or unrecognised modes', () => {
    // An unknown mode must not be treated as a payout.
    expect(openerBonusFromSettings({}).type).toBe('none');
    expect(openerBonusFromSettings({ opener_bonus_type: 'nonsense' }).type).toBe('none');
  });

  it('coerces an unusable value to zero rather than NaN', () => {
    // NaN would propagate into every share on the night.
    const cfg = openerBonusFromSettings({ opener_bonus_type: 'fixed', opener_bonus_value: null });
    expect(cfg.value).toBe(0);
    expect(openerBonus(cfg, 1000).bonusTips).toBe(0);
  });
});

describe('applyTipTransfers', () => {
  const base = () => new Map([['a', 100], ['b', 50]]);

  it('moves an amount from one person to another', () => {
    const out = applyTipTransfers(base(), [{ fromEmployeeId: 'a', toEmployeeId: 'b', amount: 20 }]);
    expect(out.get('a')).toBe(80);
    expect(out.get('b')).toBe(70);
  });

  it('leaves the night total unchanged', () => {
    const before = [...base().values()].reduce((s, n) => s + n, 0);
    const out = applyTipTransfers(base(), [{ fromEmployeeId: 'a', toEmployeeId: 'b', amount: 35 }]);
    const after = [...out.values()].reduce((s, n) => s + n, 0);
    expect(after).toBeCloseTo(before);
  });

  it('ignores self-transfers and non-positive amounts', () => {
    const out = applyTipTransfers(base(), [
      { fromEmployeeId: 'a', toEmployeeId: 'a', amount: 20 },
      { fromEmployeeId: 'a', toEmployeeId: 'b', amount: 0 },
      { fromEmployeeId: 'a', toEmployeeId: 'b', amount: -5 },
    ]);
    expect(out.get('a')).toBe(100);
    expect(out.get('b')).toBe(50);
  });

  it('does not mutate the input map', () => {
    const original = base();
    applyTipTransfers(original, [{ fromEmployeeId: 'a', toEmployeeId: 'b', amount: 20 }]);
    expect(original.get('a')).toBe(100);
  });
});
