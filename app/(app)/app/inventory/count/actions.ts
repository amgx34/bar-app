'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOrg } from '@/lib/org';
import { canAdjustStock } from '@/lib/permissions';
import { planCount, type CountAdjustment } from '@/lib/inventory/count';

export type CountResult =
  | { ok: true; changed: number; unchanged: number; skipped: number }
  | { ok: false; error: string };

/** Counted figures are in STOCK units. Never throws on bad input: returns a message. */
export async function saveCount(
  input: { item_id: string; counted: number | null }[],
): Promise<CountResult> {
  const { org, role } = await getCurrentOrg();
  if (!canAdjustStock(role)) return { ok: false, error: 'You do not have permission to count stock.' };
  if (!Array.isArray(input) || input.length === 0 || input.length > 2000) {
    return { ok: false, error: 'Nothing to save.' };
  }
  const ids = input.map((r) => String(r.item_id));
  const supabase = createAdminClient();

  // Expected stock is read now, not trusted from the browser, and only from this org.
  const { data: items, error } = await supabase
    .from('inventory_items')
    .select('id, name, current_stock')
    .eq('organization_id', org.id)
    .in('id', ids);
  if (error) return { ok: false, error: 'Could not read stock. Nothing was saved.' };
  const byId = new Map((items ?? []).map((i) => [i.id as string, i]));

  const plan = planCount(
    input.map((r) => ({
      item_id: String(r.item_id),
      name: byId.get(String(r.item_id))?.name ?? 'Item',
      expected: Number(byId.get(String(r.item_id))?.current_stock ?? 0),
      counted: r.counted === null ? null : Number(r.counted),
    })),
    new Set(byId.keys()),
  );
  if (!plan.ok) return plan;
  if (plan.adjustments.length > 0) {
    const err = await apply(supabase, org.id, plan.adjustments, byId);
    if (err) return { ok: false, error: err };
  }
  revalidatePath('/app/inventory');
  return { ok: true, changed: plan.adjustments.length, unchanged: plan.unchanged, skipped: plan.skipped };
}

type Admin = ReturnType<typeof createAdminClient>;

async function apply(
  supabase: Admin,
  orgId: string,
  adj: CountAdjustment[],
  before: Map<string, { current_stock: unknown }>,
): Promise<string | null> {
  const fail = 'The count could not be saved. Nothing was changed.';
  const { error: rpcErr } = await supabase.rpc('inventory_apply_count', { p_org: orgId, p_rows: adj });
  if (!rpcErr) return null;
  // Function not created yet (migration unapplied): fall back to per-row writes with rollback.
  const missing = rpcErr.code === 'PGRST202' || rpcErr.code === '42883';
  if (!missing) return fail;

  const { data: logs, error: logErr } = await supabase
    .from('usage_logs')
    .insert(adj.map((a) => ({
      organization_id: orgId, item_id: a.item_id, quantity: a.quantity, reason: a.reason, note: a.note,
    })))
    .select('id');
  if (logErr) return fail;

  const done: string[] = [];
  for (const a of adj) {
    const { error } = await supabase
      .from('inventory_items')
      .update({ current_stock: a.new_stock })
      .eq('id', a.item_id)
      .eq('organization_id', orgId);
    if (error) {
      for (const id of done) {
        await supabase.from('inventory_items')
          .update({ current_stock: before.get(id)!.current_stock })
          .eq('id', id).eq('organization_id', orgId);
      }
      await supabase.from('usage_logs').delete()
        .in('id', (logs ?? []).map((l) => l.id)).eq('organization_id', orgId);
      return fail;
    }
    done.push(a.item_id);
  }
  return null;
}
