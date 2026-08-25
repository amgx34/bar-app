import { describe, it, expect } from 'vitest';
import { allocateShipmentCharges } from './shipments';

/**
 * Freight, tax and other charges are invoice-level, but pour cost is measured
 * per category. Dumping all of an invoice's freight into beverage would inflate
 * the one ratio the whole cost_type split exists to protect.
 */
describe('allocateShipmentCharges', () => {
  const bev = (lineTotal: number) => ({ costType: 'beverage_cogs' as const, lineTotal });
  const sup = (lineTotal: number) => ({ costType: 'supplies' as const, lineTotal });
  const none = { freight: 0, tax: 0, otherCharges: 0 };

  it("splits a charge by each line's share of the value", () => {
    // 300 and 100 -> 3:1, so $40 of freight goes 30/10.
    const r = allocateShipmentCharges([bev(300), sup(100)], { ...none, freight: 40 });
    expect(r.byLine[0]).toBeCloseTo(30);
    expect(r.byLine[1]).toBeCloseTo(10);
    expect(r.unallocated).toBeCloseTo(0);
  });

  it('adds every kind of charge together', () => {
    const r = allocateShipmentCharges([bev(100)], { freight: 10, tax: 5, otherCharges: 2.5 });
    expect(r.byLine[0]).toBeCloseTo(17.5);
  });

  it('conserves the charge total to the cent', () => {
    const r = allocateShipmentCharges(
      [bev(33.33), bev(33.33), sup(33.34)],
      { ...none, freight: 10 },
    );
    const spread = r.byLine.reduce((t, v) => t + v, 0);
    expect(spread + r.unallocated).toBeCloseTo(10, 6);
  });

  it('reports the whole charge as unallocated when there are no lines', () => {
    // An all-freight credit note, or a half-entered invoice. Silently dropping
    // the money would understate costs with nothing on screen to notice.
    const r = allocateShipmentCharges([], { ...none, freight: 25 });
    expect(r.byLine).toEqual([]);
    expect(r.unallocated).toBeCloseTo(25);
  });

  it('reports the charge as unallocated when every line is worth nothing', () => {
    // Dividing by a zero total would produce NaN and poison the P&L.
    const r = allocateShipmentCharges([bev(0), sup(0)], { ...none, freight: 25 });
    expect(r.byLine).toEqual([0, 0]);
    expect(r.unallocated).toBeCloseTo(25);
  });

  it('allocates nothing when there is nothing to allocate', () => {
    const r = allocateShipmentCharges([bev(100), sup(50)], none);
    expect(r.byLine).toEqual([0, 0]);
    expect(r.unallocated).toBe(0);
  });

  it('ignores a negative or unreadable line value rather than inverting a share', () => {
    const r = allocateShipmentCharges(
      [bev(100), sup(Number.NaN), bev(-50)],
      { ...none, freight: 10 },
    );
    expect(r.byLine[0]).toBeCloseTo(10);
    expect(r.byLine[1]).toBe(0);
    expect(r.byLine[2]).toBe(0);
  });
});
