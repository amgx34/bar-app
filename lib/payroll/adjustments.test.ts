import { describe, it, expect } from 'vitest';
import {
  applyTipTransfers,
  openerBonus,
  openerBonusFromSettings,
  applyTipRemovals,
  applyEmployeeRemovals,
} from './adjustments';

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

describe('applyTipRemovals', () => {
  const r = (amount: number, employeeId: string | null = null) => ({
    amount, employeeId, reason: 'Court-ordered payout',
  });

  it('takes the removal off the night before anything is split', () => {
    const out = applyTipRemovals(1000, [r(150)]);
    expect(out.tipsAfterRemoval).toBeCloseTo(850);
    expect(out.removed).toBeCloseTo(150);
    expect(out.overdrawn).toBe(false);
  });

  it('sums several pool-level removals on one night', () => {
    // Both unattributed: two claims against the house pool.
    const out = applyTipRemovals(1000, [r(100), r(50)]);
    expect(out.removed).toBeCloseTo(150);
    expect(out.tipsAfterRemoval).toBeCloseTo(850);
  });

  it('leaves the night untouched when there are no removals', () => {
    const out = applyTipRemovals(1000, []);
    expect(out.tipsAfterRemoval).toBeCloseTo(1000);
    expect(out.removed).toBeCloseTo(0);
  });

  it('never removes more than the night made', () => {
    // Clamped rather than allowed to go negative: a pool of -$200 would hand
    // every bartender a negative share and the pay run would stop reconciling.
    const out = applyTipRemovals(100, [r(250)]);
    expect(out.tipsAfterRemoval).toBeCloseTo(0);
    expect(out.removed).toBeCloseTo(100);
    expect(out.overdrawn).toBe(true);
  });

  it('ignores junk amounts instead of poisoning the total', () => {
    const out = applyTipRemovals(1000, [r(0), r(-50), { amount: NaN, employeeId: null, reason: 'x' }]);
    expect(out.removed).toBeCloseTo(0);
    expect(out.tipsAfterRemoval).toBeCloseTo(1000);
  });

  it('conserves the night: what is left plus what was removed is what came in', () => {
    for (const [tips, amounts] of [[1000, [150]], [1000, [100, 50]], [100, [250]], [0, [50]], [543.21, [1.23, 4.56]]] as const) {
      const out = applyTipRemovals(tips, amounts.map((a) => r(a)));
      expect(out.tipsAfterRemoval + out.removed).toBeCloseTo(tips, 6);
    }
  });

  it('handles a night that made no tips at all', () => {
    const out = applyTipRemovals(0, [r(50)]);
    expect(out.tipsAfterRemoval).toBeCloseTo(0);
    expect(out.removed).toBeCloseTo(0);
    expect(out.overdrawn).toBe(true);
  });
});

describe('applyTipRemovals — only pool-level removals shrink the night', () => {
  it('ignores a removal attributed to a person', () => {
    // Cashing one person out does not make the night smaller for everyone else:
    // that money was always going to be theirs, it just left as cash.
    const out = applyTipRemovals(1000, [{ amount: 150, employeeId: 'emp-1', reason: 'paid in cash' }]);
    expect(out.tipsAfterRemoval).toBeCloseTo(1000);
    expect(out.removed).toBeCloseTo(0);
  });

  it('still takes an unattributed removal off the top', () => {
    // A garnishment against the house pool has no employee.
    const out = applyTipRemovals(1000, [{ amount: 150, employeeId: null, reason: 'court order' }]);
    expect(out.tipsAfterRemoval).toBeCloseTo(850);
  });

  it('handles a night carrying both kinds', () => {
    const out = applyTipRemovals(1000, [
      { amount: 150, employeeId: null, reason: 'court order' },
      { amount: 90, employeeId: 'emp-1', reason: 'paid in cash' },
    ]);
    expect(out.removed).toBeCloseTo(150);
    expect(out.tipsAfterRemoval).toBeCloseTo(850);
  });
});

describe('applyEmployeeRemovals', () => {
  const tips = () => new Map([['xavier', 117.2], ['grace', 400], ['wes', 250]]);

  it('takes the cash-out off the person who was handed the cash', () => {
    const out = applyEmployeeRemovals(tips(), [{ amount: 117.2, employeeId: 'xavier', reason: 'paid out' }]);
    expect(out.tipsByEmployee.get('xavier')).toBeCloseTo(0);
  });

  it('leaves everybody else exactly as they were', () => {
    // The whole complaint: cashing Xavier out must not move Grace or Wes.
    const out = applyEmployeeRemovals(tips(), [{ amount: 117.2, employeeId: 'xavier', reason: 'paid out' }]);
    expect(out.tipsByEmployee.get('grace')).toBeCloseTo(400);
    expect(out.tipsByEmployee.get('wes')).toBeCloseTo(250);
  });

  it('ignores pool-level removals, which were already taken off the night', () => {
    // Applying them here as well would remove the same money twice.
    const out = applyEmployeeRemovals(tips(), [{ amount: 50, employeeId: null, reason: 'court order' }]);
    expect(out.removed).toBeCloseTo(0);
    expect(out.tipsByEmployee.get('xavier')).toBeCloseTo(117.2);
  });

  it('never pays a negative wage when the cash-out exceeds what they held', () => {
    const out = applyEmployeeRemovals(tips(), [{ amount: 500, employeeId: 'xavier', reason: 'too much' }]);
    expect(out.tipsByEmployee.get('xavier')).toBeCloseTo(0);
    expect(out.removed).toBeCloseTo(117.2);
    expect(out.overdrawn).toHaveLength(1);
    expect(out.overdrawn[0]).toMatchObject({ employeeId: 'xavier', requested: 500, applied: 117.2 });
  });

  it('sums several cash-outs for the same person', () => {
    const out = applyEmployeeRemovals(tips(), [
      { amount: 50, employeeId: 'xavier', reason: 'a' },
      { amount: 60, employeeId: 'xavier', reason: 'b' },
    ]);
    expect(out.tipsByEmployee.get('xavier')).toBeCloseTo(7.2);
  });

  it('ignores a cash-out for somebody with no tips that period', () => {
    const out = applyEmployeeRemovals(tips(), [{ amount: 20, employeeId: 'nobody', reason: 'x' }]);
    expect(out.removed).toBeCloseTo(0);
    expect(out.overdrawn).toHaveLength(1);
  });

  it('conserves the total: what is left plus what was removed is what came in', () => {
    const before = [...tips().values()].reduce((s, v) => s + v, 0);
    const out = applyEmployeeRemovals(tips(), [{ amount: 90, employeeId: 'grace', reason: 'x' }]);
    const after = [...out.tipsByEmployee.values()].reduce((s, v) => s + v, 0);
    expect(after + out.removed).toBeCloseTo(before, 6);
  });
});

describe('applyEmployeeRemovals — rounding', () => {
  it('does not call a sub-cent shortfall an overdraw', () => {
    // A pool share is a fraction, never the round figure counted into an
    // envelope. Xavier's real split was 117.1975 and he was cashed out for
    // 117.20 — the same money.
    const out = applyEmployeeRemovals(
      new Map([['xavier', 117.1975]]),
      [{ amount: 117.2, employeeId: 'xavier', reason: 'paid out' }],
    );
    expect(out.overdrawn).toHaveLength(0);
    expect(out.tipsByEmployee.get('xavier')).toBeCloseTo(0);
  });

  it('still reports a real overdraw', () => {
    const out = applyEmployeeRemovals(
      new Map([['xavier', 50]]),
      [{ amount: 200, employeeId: 'xavier', reason: 'too much' }],
    );
    expect(out.overdrawn).toHaveLength(1);
  });
});

describe('applyTipTransfers — cannot give away what you do not have', () => {
  it('caps a transfer at what the sender actually holds', () => {
    // Xavier's real case: transfers were entered when he held $117, then his
    // shift was removed and his pay type changed, leaving him with nothing to
    // give. Uncapped he finished on -$23.44, which docked his hourly wage.
    const out = applyTipTransfers(new Map([['a', 30], ['b', 0]]), [
      { fromEmployeeId: 'a', toEmployeeId: 'b', amount: 50 },
    ]);
    expect(out.get('a')).toBeCloseTo(0);
    expect(out.get('b')).toBeCloseTo(30);
  });

  it('never leaves anybody negative', () => {
    const out = applyTipTransfers(new Map([['a', 0]]), [
      { fromEmployeeId: 'a', toEmployeeId: 'b', amount: 77.72 },
    ]);
    expect(out.get('a')).toBeGreaterThanOrEqual(0);
  });

  it('caps against the running balance across several transfers', () => {
    // The second transfer sees what the first one left, not the opening figure.
    const out = applyTipTransfers(new Map([['a', 100]]), [
      { fromEmployeeId: 'a', toEmployeeId: 'b', amount: 80 },
      { fromEmployeeId: 'a', toEmployeeId: 'c', amount: 80 },
    ]);
    expect(out.get('a')).toBeCloseTo(0);
    expect(out.get('b')).toBeCloseTo(80);
    expect(out.get('c')).toBeCloseTo(20);
  });

  it('still conserves the total when capped', () => {
    const before = new Map([['a', 30], ['b', 10]]);
    const total = [...before.values()].reduce((s, v) => s + v, 0);
    const out = applyTipTransfers(before, [{ fromEmployeeId: 'a', toEmployeeId: 'b', amount: 999 }]);
    expect([...out.values()].reduce((s, v) => s + v, 0)).toBeCloseTo(total, 6);
  });

  it('moves the full amount when the sender can cover it', () => {
    const out = applyTipTransfers(new Map([['a', 100], ['b', 0]]), [
      { fromEmployeeId: 'a', toEmployeeId: 'b', amount: 40 },
    ]);
    expect(out.get('a')).toBeCloseTo(60);
    expect(out.get('b')).toBeCloseTo(40);
  });
});

describe('applyTipTransfers — order is significant once capped', () => {
  it('applies transfers in the order given', () => {
    // Documented rather than incidental: capping makes order matter, so the
    // caller must supply a deterministic one (payroll orders by created_at).
    // Eric must hold a balance: the engine seeds every payroll employee into
    // this map, and a sender who is absent now correctly moves nothing.
    const opening = new Map([['x', 0], ['eric', 1000], ['jio', 0]]);
    const inFirst = applyTipTransfers(opening, [
      { fromEmployeeId: 'eric', toEmployeeId: 'x', amount: 100 },
      { fromEmployeeId: 'x', toEmployeeId: 'jio', amount: 77.72 },
    ]);
    expect(inFirst.get('x')).toBeCloseTo(22.28);
    expect(inFirst.get('jio')).toBeCloseTo(77.72);

    const outFirst = applyTipTransfers(opening, [
      { fromEmployeeId: 'x', toEmployeeId: 'jio', amount: 77.72 },
      { fromEmployeeId: 'eric', toEmployeeId: 'x', amount: 100 },
    ]);
    // Nothing to give when the outgoing one runs first, so it moves nothing.
    expect(outFirst.get('x')).toBeCloseTo(100);
    expect(outFirst.get('jio') ?? 0).toBeCloseTo(0);
  });
});

describe('applyTipTransfers — a sender with nothing', () => {
  it('moves nothing from somebody who earned nothing', () => {
    // Before capping this credited the recipient anyway, inventing money the
    // night never made.
    const out = applyTipTransfers(new Map([['b', 0]]), [
      { fromEmployeeId: 'ghost', toEmployeeId: 'b', amount: 100 },
    ]);
    expect(out.get('b')).toBeCloseTo(0);
  });
});
