export type CountRow = { item_id: string; name: string; expected: number; counted: number | null };
export type CountAdjustment = {
  item_id: string;
  new_stock: number;
  /** Absolute movement in stock units, as adjustStock writes it; the note carries the direction. */
  quantity: number;
  reason: 'recount';
  note: string;
};
export type CountPlan =
  | { ok: true; adjustments: CountAdjustment[]; unchanged: number; skipped: number }
  | { ok: false; error: string };

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Pure: turns counted figures (stock units) into recount adjustments.
 * All or none: any bad row refuses the whole batch. A count is never a delivery.
 */
export function planCount(rows: CountRow[], orgItemIds: Set<string>): CountPlan {
  const seen = new Set<string>();
  const adjustments: CountAdjustment[] = [];
  let unchanged = 0;
  let skipped = 0;

  for (const r of rows) {
    if (!orgItemIds.has(r.item_id)) return { ok: false, error: 'An item in this count was not found.' };
    if (seen.has(r.item_id)) return { ok: false, error: `${r.name} appears twice in this count.` };
    seen.add(r.item_id);

    if (r.counted === null) { skipped++; continue; }
    if (!Number.isFinite(r.counted) || r.counted < 0) {
      return { ok: false, error: `${r.name}: a count cannot be below zero.` };
    }
    const counted = round3(r.counted);
    const expected = round3(r.expected);
    if (counted === expected) { unchanged++; continue; }
    adjustments.push({
      item_id: r.item_id,
      new_stock: counted,
      quantity: round3(Math.abs(counted - expected)),
      reason: 'recount',
      note: `Count: expected ${expected}, counted ${counted}`,
    });
  }
  return { ok: true, adjustments, unchanged, skipped };
}
