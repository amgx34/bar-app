import { describe, it, expect } from 'vitest';
import { rankTopSellers, type RankableLog } from './usage-rank';

const log = (item_id: string, name: string, quantity: number, reason: string): RankableLog => ({
  item_id,
  quantity,
  reason,
  inventory_items: { name },
});

describe('rankTopSellers', () => {
  it('returns an empty list for no input', () => {
    expect(rankTopSellers([])).toEqual([]);
  });

  it('sums pos_sale per item, in stock units', () => {
    const out = rankTopSellers([
      log('a', 'Vodka', 0.5, 'pos_sale'),
      log('a', 'Vodka', 1.5, 'pos_sale'),
      log('b', 'Gin', 1, 'pos_sale'),
    ]);
    expect(out).toEqual([
      { name: 'Vodka', total: 2 },
      { name: 'Gin', total: 1 },
    ]);
  });

  it('subtracts pos_reversal from sales', () => {
    const out = rankTopSellers([log('a', 'Vodka', 10, 'pos_sale'), log('a', 'Vodka', 3, 'pos_reversal')]);
    expect(out).toEqual([{ name: 'Vodka', total: 7 }]);
  });

  it('ignores every non-sale reason', () => {
    const reasons = ['spillage', 'comp', 'staff_drink', 'delivery', 'recount', 'other'];
    expect(rankTopSellers(reasons.map((r) => log('a', 'Vodka', 5, r)))).toEqual([]);
  });

  it('omits items whose net is zero or negative', () => {
    const out = rankTopSellers([
      log('a', 'Vodka', 3, 'pos_sale'),
      log('a', 'Vodka', 3, 'pos_reversal'),
      log('b', 'Gin', 1, 'pos_sale'),
      log('b', 'Gin', 2, 'pos_reversal'),
      log('c', 'Rum', 1, 'pos_sale'),
    ]);
    expect(out).toEqual([{ name: 'Rum', total: 1 }]);
  });

  it('orders ties by name', () => {
    const out = rankTopSellers([log('b', 'Zin', 2, 'pos_sale'), log('a', 'Ale', 2, 'pos_sale')]);
    expect(out.map((e) => e.name)).toEqual(['Ale', 'Zin']);
  });

  it('keeps at most five, largest first', () => {
    const logs = Array.from({ length: 7 }, (_, i) => log(`i${i}`, `Item${i}`, i + 1, 'pos_sale'));
    const out = rankTopSellers(logs);
    expect(out).toHaveLength(5);
    expect(out[0].total).toBe(7);
  });
});
