import { describe, it, expect } from 'vitest';
import { carveOutKeptTips, nightForSharing, type KeptTipsInput } from './night-split';
import { applyTipRemovals } from './adjustments';
import { splitBarbackTips } from './tip-pool';

/**
 * The Z total already contains every server's tips: on the real Scotty's Z
 * (Z_REPORT_SCHEMA.md) "Tips Paid Out" is 1099.20 and the five per-server rows sum
 * to exactly 1099.20. So what an individual-mode or sales-percentage employee
 * keeps has to come OUT of the night before the pool is shared, or the pay run
 * allocates more than the Z report holds (it did: $1,596 against $1,212).
 */

const server = (name: string, totalSales: number, tipsPaidOut: number) => ({ name, totalSales, tipsPaidOut });
const keeper = (employeeId: string, name: string, mode: 'individual' | 'sales_pct') => ({ employeeId, name, mode });

const base = (over: Partial<KeptTipsInput>): KeptTipsInput => ({
  dailyTips: 1000,
  serverTips: [],
  keepers: [],
  ...over,
});

const sum = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);

describe('carveOutKeptTips', () => {
  it('takes nothing out when nobody keeps their own tips', () => {
    const r = carveOutKeptTips(base({ serverTips: [server('wes', 2000, 360)] }));
    expect(r.kept.size).toBe(0);
    expect(r.remainder).toBe(1000);
    expect(r.overAllocated).toBe(false);
  });

  it('gives an individual-mode employee exactly their own tips and shrinks the pool by that much', () => {
    const r = carveOutKeptTips(base({
      dailyTips: 1212,
      serverTips: [server('wes berns', 2400, 432), server('danny rivera', 1200, 384)],
      keepers: [keeper('danny', 'danny rivera', 'individual')],
    }));
    expect(r.kept.get('danny')).toBe(384);
    expect(r.remainder).toBeCloseTo(828, 6);
  });

  it('prices a sales-percentage share against the night LESS what individuals keep', () => {
    // 1000 night, Danny keeps 300, Pat sold 500 of 2000 total server sales:
    // Pat's share is 500/2000 of the remaining 700, not of the full 1000.
    const r = carveOutKeptTips(base({
      serverTips: [server('wes', 800, 0), server('danny', 700, 300), server('pat', 500, 0)],
      keepers: [keeper('danny', 'danny', 'individual'), keeper('pat', 'pat', 'sales_pct')],
    }));
    expect(r.kept.get('danny')).toBe(300);
    expect(r.kept.get('pat')).toBeCloseTo(0.25 * 700, 6);
    expect(r.remainder).toBeCloseTo(1000 - 300 - 175, 6);
  });

  it('conserves the night: kept plus remainder is always the Z total', () => {
    for (const keepers of [
      [keeper('d', 'danny', 'individual')],
      [keeper('p', 'pat', 'sales_pct')],
      [keeper('d', 'danny', 'individual'), keeper('p', 'pat', 'sales_pct')],
    ]) {
      const r = carveOutKeptTips(base({
        dailyTips: 1234.56,
        serverTips: [server('wes', 900, 100), server('danny', 700, 250.25), server('pat', 400, 0)],
        keepers,
      }));
      expect(sum(r.kept) + r.remainder).toBeCloseTo(1234.56, 6);
    }
  });

  it('leaves a server who matches no employee in the pool, so nothing disappears', () => {
    const r = carveOutKeptTips(base({
      serverTips: [server('stranger', 1000, 400)],
      keepers: [keeper('danny', 'danny', 'individual')],
    }));
    expect(r.kept.size).toBe(0);
    expect(r.remainder).toBe(1000);
  });

  it('gives an individual-mode employee nothing on a night they have no server row', () => {
    const r = carveOutKeptTips(base({
      serverTips: [server('wes', 900, 100)],
      keepers: [keeper('danny', 'danny', 'individual')],
    }));
    expect(r.kept.has('danny')).toBe(false);
    expect(r.remainder).toBe(1000);
  });

  it('matches names without regard to case or surrounding space', () => {
    const r = carveOutKeptTips(base({
      serverTips: [server('  Danny Rivera ', 700, 250)],
      keepers: [keeper('danny', 'danny rivera', 'individual')],
    }));
    expect(r.kept.get('danny')).toBe(250);
  });

  it('adds up two rows for the same server on one night', () => {
    const r = carveOutKeptTips(base({
      serverTips: [server('danny', 400, 120), server('danny', 300, 80)],
      keepers: [keeper('danny', 'danny', 'individual')],
    }));
    expect(r.kept.get('danny')).toBe(200);
    expect(r.remainder).toBe(800);
  });

  it('ignores a zero or negative tips-paid-out row', () => {
    const r = carveOutKeptTips(base({
      serverTips: [server('danny', 700, 0), server('pat', 100, -50)],
      keepers: [keeper('danny', 'danny', 'individual'), keeper('pat', 'pat', 'individual')],
    }));
    expect(r.kept.size).toBe(0);
    expect(r.remainder).toBe(1000);
  });

  it('never over-allocates: carve-outs above the night are scaled to it and flagged', () => {
    const r = carveOutKeptTips(base({
      dailyTips: 1000,
      serverTips: [server('danny', 700, 900), server('pat', 300, 300)],
      keepers: [keeper('danny', 'danny', 'individual'), keeper('pat', 'pat', 'individual')],
    }));
    expect(r.overAllocated).toBe(true);
    expect(r.remainder).toBe(0);
    expect(sum(r.kept)).toBeCloseTo(1000, 6);
    expect(r.kept.get('danny')).toBeCloseTo(750, 6);
    expect(r.kept.get('pat')).toBeCloseTo(250, 6);
  });
});

describe('a whole night, end to end', () => {
  // The carve-out, then the barback cut and the hours-weighted pool on what is
  // left: the sum of every employee's allocation must equal the Z total.
  const hours = new Map([['wes', 8], ['kayla', 8]]);

  function allocate(dailyTips: number, keepers: ReturnType<typeof keeper>[], serverTips: ReturnType<typeof server>[]) {
    const carve = carveOutKeptTips({ dailyTips, serverTips, keepers });
    const barback = splitBarbackTips({
      dailyTips: carve.remainder,
      barbackFraction: 0.15,
      barbackShifts: [{ employeeId: 'alex', payType: 'percentage', hours: 7 }],
    });
    const totalHours = [...hours.values()].reduce((s, v) => s + v, 0);
    const pool = new Map<string, number>();
    for (const [id, h] of hours) pool.set(id, (h / totalHours) * barback.poolTips);
    return sum(carve.kept) + sum(barback.tipsByEmployee) + sum(pool);
  }

  it('sums to the Z total with no individual or sales-percentage staff (existing behaviour pinned)', () => {
    expect(allocate(1212, [], [server('wes', 2400, 432)])).toBeCloseTo(1212, 6);
  });

  it('sums to the Z total with an individual and a sales-percentage employee', () => {
    const total = allocate(
      1212,
      [keeper('danny', 'danny', 'individual'), keeper('pat', 'pat', 'sales_pct')],
      [server('wes', 2400, 432), server('danny', 1200, 384), server('pat', 600, 90)],
    );
    expect(total).toBeCloseTo(1212, 6);
  });
});

describe('nightForSharing', () => {
  const rm = (amount: number, employeeId: string | null = null) => ({ amount, employeeId, reason: 'x' });
  const run = (over: Partial<Parameters<typeof nightForSharing>[0]> = {}) =>
    nightForSharing({ zTotalTips: 1000, removals: [], serverTips: [], keepers: [], ...over });

  it('with no removals and no keepers the remainder is the Z total', () => {
    const r = run();
    expect(r).toMatchObject({ removed: 0, removalOverdrawn: false, keptTotal: 0, remainder: 1000, overAllocated: false });
  });
  it('an unattributed removal shrinks the night', () => {
    const r = run({ removals: [rm(100)] });
    expect(r.removed).toBe(100);
    expect(r.remainder).toBe(900);
  });
  it('a removal naming an employee does not shrink the night', () => {
    const r = run({ removals: [rm(100, 'e1')] });
    expect(r.removed).toBe(0);
    expect(r.remainder).toBe(1000);
  });
  it('a removal larger than the night leaves nothing and is flagged', () => {
    const r = run({ removals: [rm(1200)] });
    expect(r.remainder).toBe(0);
    expect(r.removed).toBe(1000);
    expect(r.removalOverdrawn).toBe(true);
  });
  it('removal then individual keeper', () => {
    const r = run({
      removals: [rm(100)],
      serverTips: [server('Dan', 2000, 300)],
      keepers: [keeper('k1', 'Dan', 'individual')],
    });
    expect(r.keptTotal).toBe(300);
    expect(r.remainder).toBe(600);
  });
  it('sales_pct keeper matches applyTipRemovals then carveOutKeptTips by hand', () => {
    const serverTips = [server('Sam', 3000, 0), server('Bo', 1000, 0)];
    const keepers = [keeper('k2', 'Sam', 'sales_pct')];
    const removals = [rm(250)];
    const hand = carveOutKeptTips({ dailyTips: applyTipRemovals(1000, removals).tipsAfterRemoval, serverTips, keepers });
    const r = run({ removals, serverTips, keepers });
    expect(r.remainder).toBe(hand.remainder);
    expect(r.keptTotal).toBe(sum(hand.kept));
    expect(r.kept).toEqual(hand.kept);
  });
  it('keeper tips larger than the night: overAllocated, remainder 0', () => {
    const r = run({ serverTips: [server('Dan', 100, 5000)], keepers: [keeper('k1', 'Dan', 'individual')] });
    expect(r.overAllocated).toBe(true);
    expect(r.remainder).toBe(0);
  });
});
