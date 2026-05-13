'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';
import type { BarSettings, HourlyRates } from '@/lib/org';

function assertEditor(role: string) {
  if (!['owner', 'manager'].includes(role)) throw new Error('Not authorized');
}

// ── Merge helper: deep-merges new values into existing bar_settings ───────────
async function mergeBarSettings(orgId: string, updates: Partial<BarSettings>) {
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('organizations')
    .select('bar_settings')
    .eq('id', orgId)
    .single();

  const current = (existing?.bar_settings ?? {}) as BarSettings;
  const merged  = { ...current, ...updates };

  const { error } = await admin
    .from('organizations')
    .update({ bar_settings: merged })
    .eq('id', orgId);

  if (error) throw new Error(error.message);
  revalidatePath('/app/settings');
}

// ── General info ──────────────────────────────────────────────────────────────

export async function updateGeneralInfo(data: {
  bar_type?:    string;
  bar_city?:    string;
  bar_state?:   string;
  bar_phone?:   string;
  bar_address?: string;
}) {
  const { org, role } = await getCurrentOrg();
  assertEditor(role);

  const admin = createAdminClient();
  const { error } = await admin
    .from('organizations')
    .update({
      bar_type:    data.bar_type ?? null,
      bar_address: data.bar_address ?? null,
      bar_phone:   data.bar_phone ?? null,
    })
    .eq('id', org.id);

  if (error) throw new Error(error.message);

  // Also keep city/state in bar_settings for easy reading
  await mergeBarSettings(org.id, {
    bar_type:    data.bar_type,
    bar_city:    data.bar_city,
    bar_state:   data.bar_state,
    bar_phone:   data.bar_phone,
    bar_address: data.bar_address,
  });
}

// ── Tip & pay settings ────────────────────────────────────────────────────────

export async function updateTipPaySettings(data: {
  tip_split_percent:  number;
  barback_tip_pct:    number;
  opener_bonus_type:  'none' | 'fixed' | 'percentage';
  opener_bonus_value: number;
  default_hourly_rate: number;
  hourly_rates:       HourlyRates;
}) {
  const { org, role } = await getCurrentOrg();
  assertEditor(role);
  await mergeBarSettings(org.id, data);
}

// ── Inventory / pour defaults ─────────────────────────────────────────────────

export async function updateInventoryDefaults(data: {
  default_pour_oz:     number;
  bottle_sizes_ml:     number[];
  auto_reorder_enabled: boolean;
}) {
  const { org, role } = await getCurrentOrg();
  assertEditor(role);
  await mergeBarSettings(org.id, data);
}

// ── Bar settings (legacy shim — used by bar-settings-form.tsx) ────────────────

export async function updateBarSettings(data: Partial<BarSettings>) {
  const { org, role } = await getCurrentOrg();
  assertEditor(role);
  await mergeBarSettings(org.id, data);
}

// ── Clover sync / disconnect (unchanged) ──────────────────────────────────────

export type SyncResult = { created: number; updated: number; skipped: number };

export async function syncCloverInventory(): Promise<SyncResult> {
  const { org } = await getCurrentOrg();
  if (org.pos_provider !== 'clover') throw new Error('Not connected to Clover');

  const cfg = org.pos_config as { merchant_id: string; access_token: string; expires_at: number | null };
  if (!cfg.access_token || !cfg.merchant_id) throw new Error('Clover connection is incomplete — please reconnect');
  if (cfg.expires_at && Date.now() > cfg.expires_at) throw new Error('Clover access token has expired — please reconnect');

  const base = process.env.CLOVER_SANDBOX === 'true' ? 'https://apisandbox.dev.clover.com' : 'https://api.clover.com';
  const res  = await fetch(`${base}/v3/merchants/${cfg.merchant_id}/items?limit=1000&filter=hidden=false`, { headers: { Authorization: `Bearer ${cfg.access_token}` } });

  if (!res.ok) throw new Error(`Clover API error: ${res.status}`);

  const { elements = [] } = await res.json() as { elements: { id: string; name: string; price?: number; code?: string; stockCount?: number }[] };
  if (!elements.length) return { created: 0, updated: 0, skipped: 0 };

  const supabase = await createClient();
  const { data: existing } = await supabase.from('inventory_items').select('id, name, sku').eq('organization_id', org.id);
  const byName = new Map((existing ?? []).map(i => [i.name.toLowerCase(), i]));
  const bySku  = new Map((existing ?? []).filter(i => i.sku).map(i => [i.sku!, i]));
  const admin  = createAdminClient();
  const result: SyncResult = { created: 0, updated: 0, skipped: 0 };

  for (const item of elements) {
    if (!item.name?.trim()) { result.skipped++; continue; }
    const match = (item.code && bySku.get(item.code)) ?? byName.get(item.name.toLowerCase());
    if (match) {
      const { error } = await admin.from('inventory_items').update({ sale_price: item.price != null ? item.price / 100 : undefined, sku: item.code || match.sku || null, ...(item.stockCount != null ? { current_stock: item.stockCount } : {}) }).eq('id', match.id);
      error ? result.skipped++ : result.updated++;
    } else {
      const { error } = await admin.from('inventory_items').insert({ organization_id: org.id, name: item.name.trim(), sku: item.code || null, sale_price: item.price != null ? item.price / 100 : null, current_stock: item.stockCount ?? 0, unit: 'each' });
      error ? result.skipped++ : result.created++;
    }
  }
  revalidatePath('/app/inventory');
  return result;
}

export async function disconnectPOS() {
  const { org, role } = await getCurrentOrg();
  if (role !== 'owner') throw new Error('Only owners can disconnect a POS');
  const admin = createAdminClient();
  const { error } = await admin.from('organizations').update({ pos_provider: null, pos_config: {} }).eq('id', org.id);
  if (error) throw new Error(error.message);
  revalidatePath('/app/settings');
}
