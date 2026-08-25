import { describe, it, expect } from 'vitest';
import { allocateShipmentCharges, flagPriceChanges, reconcileTotal, PRICE_CHANGE_THRESHOLD } from './shipments';

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

/**
 * The model reads the numbers, so one mis-parsed digit can reprice the bar.
 * A big move is not rejected — distributors really do raise prices — it is
 * held for a human to confirm.
 */
describe('flagPriceChanges', () => {
  const costs = new Map([['tito', 21.10], ['jame', 19.85]]);
  const line = (itemId: string | null, quantity: number, unitCost: number | null) =>
    ({ itemId, quantity, unitCost });

  it('applies a small rise without asking', () => {
    const r = flagPriceChanges([line('tito', 6, 22.40)], costs);
    expect(r.get('tito')!.needsConfirm).toBe(false);
    expect(r.get('tito')!.to).toBeCloseTo(22.40);
  });

  it('holds a large rise for confirmation', () => {
    const r = flagPriceChanges([line('tito', 6, 40.00)], costs);
    expect(r.get('tito')!.needsConfirm).toBe(true);
  });

  it('holds a large FALL for confirmation too', () => {
    // $45.00 read as $4.50 is the characteristic model slip, and it is a
    // decrease — a rise-only guard would wave the worst case straight through.
    const r = flagPriceChanges([line('tito', 6, 4.50)], costs);
    expect(r.get('tito')!.needsConfirm).toBe(true);
    expect(r.get('tito')!.pctChange).toBeLessThan(0);
  });

  it('collapses two lines for one item into a quantity-weighted average', () => {
    // A split line, or two drops on one document. Taking whichever row came
    // last would make the new cost depend on the order the model emitted rows.
    const r = flagPriceChanges([line('tito', 6, 22.00), line('tito', 2, 30.00)], costs);
    // (6*22 + 2*30) / 8 = 24.00
    expect(r.get('tito')!.to).toBeCloseTo(24.0);
  });

  it('does not treat an item with no stored cost as a jump', () => {
    const r = flagPriceChanges([line('newitem', 3, 12.00)], costs);
    expect(r.get('newitem')!.needsConfirm).toBe(false);
    expect(r.get('newitem')!.from).toBe(0);
  });

  it('skips lines with no matched item', () => {
    const r = flagPriceChanges([line(null, 3, 12.00)], costs);
    expect(r.size).toBe(0);
  });

  it("skips lines with no price, rather than zeroing the item's cost", () => {
    const r = flagPriceChanges([line('tito', 6, null)], costs);
    expect(r.size).toBe(0);
  });

  it('leaves an unchanged price unflagged', () => {
    const r = flagPriceChanges([line('jame', 12, 19.85)], costs);
    expect(r.get('jame')!.needsConfirm).toBe(false);
    expect(r.get('jame')!.pctChange).toBeCloseTo(0);
  });

  it('uses ten percent as the threshold', () => {
    expect(PRICE_CHANGE_THRESHOLD).toBe(0.10);
  });
});

/**
 * "Does this tie to the paper" and "what did the beer cost" are two different
 * questions. Deposits are billed on the invoice, so they belong in the first
 * and not the second.
 */
describe('reconcileTotal', () => {
  const noCharges = { freight: 0, tax: 0, otherCharges: 0, deposits: 0 };

  it('adds lines and charges and compares to the stated total', () => {
    const r = reconcileTotal(
      [{ lineTotal: 134.40 }, { lineTotal: 238.20 }],
      { ...noCharges, freight: 18.0 },
      390.60,
    );
    expect(r.computed).toBeCloseTo(390.60);
    expect(r.matches).toBe(true);
    expect(r.difference).toBeCloseTo(0);
  });

  it('INCLUDES deposits, so a deposit-bearing invoice ties to the paper', () => {
    // Deposits are excluded from cost of sales but they are still money on the
    // invoice. Subtracting here made every keg invoice read as short.
    const r = reconcileTotal([{ lineTotal: 100 }], { ...noCharges, deposits: 7.20 }, 107.20);
    expect(r.matches).toBe(true);
  });

  it('flags a shortfall and says how big it is', () => {
    const r = reconcileTotal([{ lineTotal: 100 }], noCharges, 118.0);
    expect(r.matches).toBe(false);
    expect(r.difference).toBeCloseTo(-18.0);
  });

  it('tolerates a cent of rounding', () => {
    const r = reconcileTotal([{ lineTotal: 100.004 }], noCharges, 100.0);
    expect(r.matches).toBe(true);
  });

  it('reports nothing to check when no total was stated', () => {
    const r = reconcileTotal([{ lineTotal: 100 }], noCharges, null);
    expect(r.stated).toBeNull();
    expect(r.matches).toBe(true);
    expect(r.difference).toBe(0);
  });
});
