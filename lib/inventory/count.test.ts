import { describe, it, expect } from 'vitest';
import { planCount, type CountRow } from './count';

const A = '00000000-0000-0000-0000-00000000000a';
const B = '00000000-0000-0000-0000-00000000000b';
const mine = new Set([A, B]);
const row = (item_id: string, expected: number, counted: number | null): CountRow => ({
  item_id, name: 'Item ' + item_id.slice(-1), expected, counted,
});

describe('planCount', () => {
  it('logs every changed row as recount, never delivery, in stock units', () => {
    const p = planCount([row(A, 10, 7), row(B, 2, 5)], mine);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.adjustments.map((a) => a.reason)).toEqual(['recount', 'recount']);
    expect(p.adjustments[0]).toMatchObject({ item_id: A, new_stock: 7, quantity: 3 });
    expect(p.adjustments[1]).toMatchObject({ item_id: B, new_stock: 5, quantity: 3 });
    expect(p.adjustments[0].note).toContain('10');
    expect(p.adjustments[0].note).toContain('7');
  });

  it('leaves uncounted rows alone and does not log a count that matches', () => {
    const p = planCount([row(A, 4, null), row(B, 4, 4)], mine);
    expect(p).toMatchObject({ ok: true, adjustments: [], unchanged: 1, skipped: 1 });
  });

  it('accepts a count of zero', () => {
    const p = planCount([row(A, 3, 0)], mine);
    expect(p.ok && p.adjustments[0]).toMatchObject({ new_stock: 0, quantity: 3 });
  });

  it('refuses a negative count with a message naming the item', () => {
    const p = planCount([row(A, 3, -1)], mine);
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.error).toMatch(/Item a/);
  });

  it('refuses NaN and infinity', () => {
    expect(planCount([row(A, 3, NaN)], mine).ok).toBe(false);
    expect(planCount([row(A, 3, Infinity)], mine).ok).toBe(false);
  });

  it('refuses the whole batch when any item is not in the caller org', () => {
    const other = '00000000-0000-0000-0000-0000000000ff';
    const p = planCount([row(A, 1, 2), row(other, 1, 2)], mine);
    expect(p.ok).toBe(false);
  });

  it('refuses a repeated item rather than applying it twice', () => {
    expect(planCount([row(A, 1, 2), row(A, 1, 3)], mine).ok).toBe(false);
  });

  it('is all or none: one bad row yields no adjustments', () => {
    const p = planCount([row(A, 1, 2), row(B, 1, -5)], mine);
    expect(p).toEqual({ ok: false, error: expect.any(String) });
  });
});
