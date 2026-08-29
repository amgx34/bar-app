import { describe, it, expect } from 'vitest';
import { computeVelocity, topSellers, type ItemRef, type SalesFact, type UsageLogFact } from './velocity';
import { unitsPerSale } from './pour';

/**
 * Velocity draws on two sources that are NOT in the same unit:
 *
 *   pos_item_sales.qty_sold   counts DRINKS, straight off the POS
 *   usage_logs.quantity       counts STOCK, already converted by the ingest route
 *
 * Adding them raw treats a shot as a bottle. That is what these tests exist to
 * prevent, because the resulting dailyUsage divides into current_stock to
 * produce "days remaining" — so a 17x error there became reorder alerts for
 * items with plenty on the shelf.
 */

const VODKA_PER_SALE = unitsPerSale({ bottleSizeMl: 750, pourSizeOz: 1.5 });

const vodka: ItemRef = {
  id: 'i-vodka',
  name: 'Well Vodka',
  matchKey: 'well vodka',
  unitsPerSale: VODKA_PER_SALE,
};

const beer: ItemRef = {
  id: 'i-beer',
  name: 'Domestic Bottle',
  matchKey: 'domestic bottle',
  unitsPerSale: 1,
};

const sale = (matchKey: string, qtySold: number, netSales = 0): SalesFact =>
  ({ matchKey, qtySold, netSales, saleDate: '2026-08-01' });

const usage = (itemId: string, quantity: number, reason: string): UsageLogFact =>
  ({ itemId, quantity, reason });

const shipmentUsage = (itemId: string, quantity: number, reason: string, shipmentId: string): UsageLogFact =>
  ({ itemId, quantity, reason, shipmentId });

describe('computeVelocity', () => {
  it('reports sales in STOCK units, not drinks', () => {
    const [v] = computeVelocity([vodka], [sale('well vodka', 185)], [], 30);

    // The bug: this used to be 185.
    expect(v.unitsSold).toBeCloseTo(185 * VODKA_PER_SALE, 6);
    expect(v.unitsSold).toBeCloseTo(10.94, 2);

    // The raw drink count is still available for questions about the POS.
    expect(v.salesCount).toBe(185);
  });

  it('adds stock lost to stock sold, in the same unit', () => {
    const [v] = computeVelocity(
      [vodka],
      [sale('well vodka', 185)],
      // Two whole bottles broken. Already stock units.
      [usage('i-vodka', 2, 'spillage')],
      30,
    );

    expect(v.unitsLost).toBe(2);
    expect(v.unitsMoved).toBeCloseTo(185 * VODKA_PER_SALE + 2, 6);
  });

  it('produces a dailyUsage that divides sensibly into a stock level', () => {
    // 8 bottles on the shelf against this rate should be weeks of cover, not
    // hours. This is the assertion that would have caught the original bug.
    const [v] = computeVelocity([vodka], [sale('well vodka', 185)], [], 30);
    const daysRemaining = 8 / v.dailyUsage;

    expect(daysRemaining).toBeGreaterThan(20);
    expect(daysRemaining).toBeLessThan(30);
  });

  it('leaves whole-unit items exactly as they were', () => {
    const [v] = computeVelocity([beer], [sale('domestic bottle', 40)], [], 30);
    expect(v.unitsSold).toBe(40);
    expect(v.salesCount).toBe(40);
  });

  it('defaults to 1:1 when no conversion factor is supplied', () => {
    const bare: ItemRef = { id: 'x', name: 'X', matchKey: 'x' };
    const [v] = computeVelocity([bare], [sale('x', 12)], [], 30);
    expect(v.unitsSold).toBe(12);
  });

  it('ignores a nonsensical conversion factor rather than zeroing movement', () => {
    const broken: ItemRef = { id: 'x', name: 'X', matchKey: 'x', unitsPerSale: 0 };
    const [v] = computeVelocity([broken], [sale('x', 12)], [], 30);
    expect(v.unitsSold).toBe(12);
  });

  it('does not double-count pos_sale usage logs against the sales feed', () => {
    // pos_apply_item_sales writes a usage log for every unit it deducts, so the
    // same movement appears in both sources. Only one may be counted.
    const [v] = computeVelocity(
      [beer],
      [sale('domestic bottle', 40)],
      [usage('i-beer', 40, 'pos_sale')],
      30,
    );
    expect(v.unitsMoved).toBe(40);
  });

  it('excludes deliveries and reversals, which add stock rather than consume it', () => {
    const [v] = computeVelocity(
      [beer],
      [sale('domestic bottle', 10)],
      [usage('i-beer', 24, 'delivery'), usage('i-beer', 3, 'pos_reversal')],
      30,
    );
    expect(v.unitsMoved).toBe(10);
  });

  it('excludes a void reversal from consumption even though its reason is not delivery/pos_reversal', () => {
    // voidShipment() logs the reversal with reason: 'other' (deliberately not
    // 'recount' or anything else NON_CONSUMPTION recognises by reason alone),
    // linked back to the shipment it undid via shipment_id. Reason-only
    // filtering would read a voided 40-case delivery as 40 cases of usage;
    // the shipment_id link is what lets this be told apart from a genuine
    // floor loss also logged as 'other'.
    const [v] = computeVelocity(
      [beer],
      [sale('domestic bottle', 10)],
      [shipmentUsage('i-beer', 40, 'other', 'ship-1')],
      30,
    );
    expect(v.unitsMoved).toBe(10);
  });

  it('still counts a manual "other" adjustment with no shipment link as a loss', () => {
    // Confirms the shipment_id check is additive, not a blanket exemption for
    // reason: 'other' — stock-adjust-dialog.tsx uses 'other' for hand-logged
    // adjustments unrelated to any shipment, and those must still count.
    const [v] = computeVelocity(
      [beer],
      [sale('domestic bottle', 10)],
      [usage('i-beer', 3, 'other')],
      30,
    );
    expect(v.unitsMoved).toBe(13);
  });

  it('divides by the window length, not by days that had activity', () => {
    // Otherwise an item that sold once looks like it sells one a day.
    const [v] = computeVelocity([beer], [sale('domestic bottle', 30)], [], 30);
    expect(v.dailyUsage).toBeCloseTo(1, 6);
  });

  it('drops items that did not move', () => {
    expect(computeVelocity([beer], [], [], 30)).toHaveLength(0);
  });
});

describe('topSellers', () => {
  it('ranks by drinks sold, not by stock consumed', () => {
    // A keg outranks everything on stock terms — it is one unit that empties
    // slowly — but nobody would call it the bar's best seller.
    const keg: ItemRef = { id: 'i-keg', name: 'Keg', matchKey: 'keg', unitsPerSale: 1 };
    const velocity = computeVelocity(
      [vodka, keg],
      [sale('well vodka', 185), sale('keg', 20)],
      [],
      30,
    );

    const top = topSellers(velocity, 5);
    expect(top[0].name).toBe('Well Vodka');
    expect(top[0].salesCount).toBe(185);
  });

  it('omits items with no POS sales', () => {
    const velocity = computeVelocity([beer], [], [usage('i-beer', 5, 'spillage')], 30);
    expect(topSellers(velocity)).toHaveLength(0);
  });
});
