export type CountRow = { item_id: string; name: string; expected: number; counted: number | null };
export type CountAdjustment = {
  item_id: string;
  new_stock: number;
  quantity: number;
  reason: 'recount';
  note: string;
};
export type CountPlan =
  | { ok: true; adjustments: CountAdjustment[]; unchanged: number; skipped: number }
  | { ok: false; error: string };

export function planCount(_rows: CountRow[], _orgItemIds: Set<string>): CountPlan {
  throw new Error('not implemented');
}
