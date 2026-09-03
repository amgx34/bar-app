import { describe, it, expect } from 'vitest';
import { togglePackLine, lineTotal, type PackLine } from './pack-line';

const line = (over: Partial<PackLine> = {}): PackLine =>
  ({ quantity: 5, unitCost: 28.5, unitsPerPack: 24, packApplied: false, ...over });

describe('togglePackLine', () => {
  it('expands packs into singles', () => {
    const out = togglePackLine(line());
    expect(out.quantity).toBe(120);
    expect(out.packApplied).toBe(true);
  });

  it('preserves the line total when expanding', () => {
    // The bug this exists to prevent: 5 cases at $28.50 is $142.50, and it is
    // still $142.50 as 120 cans. Converting quantity alone would report $3,420.
    const before = line();
    const after = togglePackLine(before);
    expect(lineTotal(after)).toBeCloseTo(lineTotal(before), 10);
    expect(lineTotal(after)).toBeCloseTo(142.5, 10);
  });

  it('splits the unit cost to match', () => {
    expect(togglePackLine(line()).unitCost).toBeCloseTo(1.1875, 10);
  });

  it('folds back to packs', () => {
    const out = togglePackLine(togglePackLine(line()));
    expect(out.quantity).toBe(5);
    expect(out.unitCost).toBeCloseTo(28.5, 10);
    expect(out.packApplied).toBe(false);
  });

  it('round-trips the line total across awkward pack sizes', () => {
    // 7 and 3 do not divide evenly into money; the product must still hold.
    for (const per of [2, 3, 6, 7, 12, 24, 30]) {
      const before = line({ unitsPerPack: per, quantity: 5, unitCost: 28.5 });
      const there = togglePackLine(before);
      const back = togglePackLine(there);
      expect(lineTotal(there)).toBeCloseTo(lineTotal(before), 10);
      expect(back.quantity).toBeCloseTo(before.quantity, 10);
      expect(back.unitCost!).toBeCloseTo(before.unitCost!, 10);
    }
  });

  it('is a no-op for an item with no pack size', () => {
    const before = line({ unitsPerPack: null });
    expect(togglePackLine(before)).toEqual(before);
  });

  it('is a no-op for a pack size of 1', () => {
    // Guarded by a CHECK in the database, but the UI must not depend on that.
    const before = line({ unitsPerPack: 1 });
    expect(togglePackLine(before)).toEqual(before);
  });

  it('handles a line with no unit cost', () => {
    // A hand-typed delivery may carry no price at all; quantity still converts.
    const out = togglePackLine(line({ unitCost: null }));
    expect(out.quantity).toBe(120);
    expect(out.unitCost).toBeNull();
  });

  it('does not double-apply when toggled twice', () => {
    // A one-way button tapped twice would make 5 cases into 2,880 cans.
    const out = togglePackLine(togglePackLine(line()));
    expect(out.quantity).toBe(5);
  });
});
