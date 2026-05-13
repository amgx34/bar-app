'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';

// ── Bar settings ──────────────────────────────────────────────────────────────

export async function updateBarSettings(data: {
  tip_split_percent: number;
  default_hourly_rate: number;
}) {
  const { org, role } = await getCurrentOrg();
  if (!['owner', 'manager'].includes(role)) throw new Error('Not authorized');

  const admin = createAdminClient();
  const { error } = await admin
    .from('organizations')
    .update({
      bar_settings: {
        tip_split_percent: data.tip_split_percent,
        default_hourly_rate: data.default_hourly_rate,
      },
    })
    .eq('id', org.id);

  if (error) throw new Error(error.message);
  revalidatePath('/app/settings');
}

// ── Clover inventory sync ─────────────────────────────────────────────────────

export type SyncResult = { created: number; updated: number; skipped: number };

export async function syncCloverInventory(): Promise<SyncResult> {
  const { org } = await getCurrentOrg();
  if (org.pos_provider !== 'clover') throw new Error('Not connected to Clover');

  const cfg = org.pos_config as {
    merchant_id: string;
    access_token: string;
    expires_at: number | null;
  };

  if (!cfg.access_token || !cfg.merchant_id) {
    throw new Error('Clover connection is incomplete — please reconnect');
  }

  if (cfg.expires_at && Date.now() > cfg.expires_at) {
    throw new Error('Clover access token has expired — please reconnect in Settings');
  }

  const base =
    process.env.CLOVER_SANDBOX === 'true'
      ? 'https://apisandbox.dev.clover.com'
      : 'https://api.clover.com';

  const res = await fetch(
    `${base}/v3/merchants/${cfg.merchant_id}/items?limit=1000&filter=hidden=false`,
    { headers: { Authorization: `Bearer ${cfg.access_token}` } }
  );

  if (!res.ok) {
    if (res.status === 401) throw new Error('Clover token rejected — please reconnect');
    throw new Error(`Clover API error: ${res.status}`);
  }

  const json = await res.json() as { elements: CloverItem[] };
  const cloverItems = json.elements ?? [];

  if (cloverItems.length === 0) return { created: 0, updated: 0, skipped: 0 };

  const supabase = await createClient(); // respects RLS
  const { data: existing } = await supabase
    .from('inventory_items')
    .select('id, name, sku')
    .eq('organization_id', org.id);

  const byName = new Map((existing ?? []).map((i) => [i.name.toLowerCase(), i]));
  const bySku  = new Map((existing ?? []).filter((i) => i.sku).map((i) => [i.sku!, i]));

  const admin = createAdminClient();
  const result: SyncResult = { created: 0, updated: 0, skipped: 0 };

  for (const item of cloverItems) {
    if (!item.name?.trim()) { result.skipped++; continue; }

    const match = (item.code && bySku.get(item.code)) ?? byName.get(item.name.toLowerCase());

    if (match) {
      const { error } = await admin
        .from('inventory_items')
        .update({
          sale_price: item.price != null ? item.price / 100 : undefined,
          sku: item.code || match.sku || null,
          ...(item.stockCount != null ? { current_stock: item.stockCount } : {}),
        })
        .eq('id', match.id);
      if (!error) result.updated++;
      else result.skipped++;
    } else {
      const { error } = await admin.from('inventory_items').insert({
        organization_id: org.id,
        name: item.name.trim(),
        sku: item.code || null,
        sale_price: item.price != null ? item.price / 100 : null,
        current_stock: item.stockCount ?? 0,
        unit: 'each',
      });
      if (!error) result.created++;
      else result.skipped++;
    }
  }

  revalidatePath('/app/inventory');
  return result;
}

// ── Disconnect POS ────────────────────────────────────────────────────────────

export async function disconnectPOS() {
  const { org, role } = await getCurrentOrg();
  if (role !== 'owner') throw new Error('Only owners can disconnect a POS');

  const admin = createAdminClient();
  const { error } = await admin
    .from('organizations')
    .update({ pos_provider: null, pos_config: {} })
    .eq('id', org.id);

  if (error) throw new Error(error.message);
  revalidatePath('/app/settings');
}

// ── Types ─────────────────────────────────────────────────────────────────────

type CloverItem = {
  id: string;
  name: string;
  price?: number;
  code?: string;
  stockCount?: number;
};
