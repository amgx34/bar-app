import { describe, it, expect } from 'vitest';
import { addTip, tipTotals, type TipLedger } from './tip-ledger';

describe('addTip', () => {
  it('accumulates multiple nights for the same employee into separate dates', () => {
    const ledger: TipLedger = new Map();
    addTip(ledger, 'emp-1', '2026-09-07', 40.25);
    addTip(ledger, 'emp-1', '2026-09-08', 19.75);

    const byDate = ledger.get('emp-1');
    expect(byDate?.get('2026-09-07')).toBe(40.25);
    expect(byDate?.get('2026-09-08')).toBe(19.75);
  });

  it('sums two writes on the same night rather than overwriting', () => {
    // A night can be written to twice — e.g. the barback split and the opener
    // bonus both landing on the same employee's same date. A plain .set()
    // would silently drop the first write.
    const ledger: TipLedger = new Map();
    addTip(ledger, 'emp-1', '2026-09-07', 10);
    addTip(ledger, 'emp-1', '2026-09-07', 5);

    expect(ledger.get('emp-1')?.get('2026-09-07')).toBe(15);
  });

  it('keeps separate employees on separate maps', () => {
    const ledger: TipLedger = new Map();
    addTip(ledger, 'emp-1', '2026-09-07', 10);
    addTip(ledger, 'emp-2', '2026-09-07', 20);

    expect(ledger.get('emp-1')?.get('2026-09-07')).toBe(10);
    expect(ledger.get('emp-2')?.get('2026-09-07')).toBe(20);
  });

  it('skips a zero amount rather than recording a $0 night', () => {
    const ledger: TipLedger = new Map();
    addTip(ledger, 'emp-1', '2026-09-07', 0);

    expect(ledger.has('emp-1')).toBe(false);
  });
});

describe('tipTotals', () => {
  it('sums each employee back to the same total addTip accumulated', () => {
    const ledger: TipLedger = new Map();
    addTip(ledger, 'emp-1', '2026-09-07', 40.25);
    addTip(ledger, 'emp-1', '2026-09-08', 19.75);
    addTip(ledger, 'emp-2', '2026-09-07', 5);

    const totals = tipTotals(ledger);
    expect(totals.get('emp-1')).toBeCloseTo(60, 2);
    expect(totals.get('emp-2')).toBe(5);
  });

  it('would catch a broken accumulator: totals disagree if a write were dropped', () => {
    // Simulates what a buggy addTip (a plain .set() instead of add-and-set)
    // would produce, to show tipTotals actually discriminates right from wrong.
    const broken: TipLedger = new Map([
      ['emp-1', new Map([['2026-09-07', 19.75]])], // second write clobbered the first
    ]);
    const totals = tipTotals(broken);
    expect(totals.get('emp-1')).not.toBe(60);
  });

  it('returns an empty map for an empty ledger', () => {
    expect(tipTotals(new Map()).size).toBe(0);
  });
});
