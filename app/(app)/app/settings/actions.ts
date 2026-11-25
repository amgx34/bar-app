'use server';

import { validateRoutingNumber } from '@/lib/direct-deposit/routing';
import { revalidatePath } from 'next/cache';
import { randomBytes }    from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';
import { SITE_URL } from '@/lib/site';
import type { BarSettings, HourlyRates } from '@/lib/org';
import { deleteCredentials } from '@/lib/pos/credentials';
import type { PosConfig } from '@/lib/pos/pos-config';
import { runProviderSync } from '@/lib/pos/sync-run';
import { NeedsReauthError } from '@/lib/pos/providers/types';
import { openCloverClient } from '@/lib/pos/providers/clover/adapter';
import { openToastClient } from '@/lib/pos/providers/toast/adapter';
import { flattenMenuItems } from '@/lib/toast/client';

// ── Shared helper: safely merge into pos_config without overwriting other keys ──
async function mergePosConfig(orgId: string, updates: Record<string, unknown>) {
  const admin = createAdminClient();
  const { data } = await admin
    .from('organizations')
    .select('pos_config')
    .eq('id', orgId)
    .single();
  const existing = (data?.pos_config ?? {}) as Record<string, unknown>;
  return { ...existing, ...updates };
}

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
  bar_type?:             string;
  bar_city?:             string;
  bar_state?:            string;
  bar_phone?:            string;
  bar_address?:          string;
  // NACHA / ACH payroll fields
  nacha_routing_number?: string;
  nacha_company_ein?:    string;
  nacha_bank_name?:      string;
  nacha_company_name?:   string;
  // Sales tax. Both are needed before the books can split tax from profit —
  // see lib/books/sales-tax.ts for why neither can be inferred.
  sales_tax_rate?:         number;
  pos_prices_include_tax?: boolean;
}) {
  const { org, role } = await getCurrentOrg();
  assertEditor(role);

  // This number is the ODFI routing in every ACH file the bar sends. A value that
  // is not a real ABA routing number used to save with a "Saved" toast ("12345"
  // did) and would then be padded into the file. Blank is allowed: it clears the
  // field, and the NACHA export refuses to run until one is set.
  if (data.nacha_routing_number && !validateRoutingNumber(data.nacha_routing_number)) {
    throw new Error('Routing number must be 9 digits and pass the bank routing check. Check it against a check or your bank statement.');
  }

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

  // Keep all settings-level fields in bar_settings
  await mergeBarSettings(org.id, {
    bar_type:             data.bar_type,
    bar_city:             data.bar_city,
    bar_state:            data.bar_state,
    bar_phone:            data.bar_phone,
    bar_address:          data.bar_address,
    nacha_routing_number: data.nacha_routing_number ?? undefined,
    nacha_company_ein:    data.nacha_company_ein    ?? undefined,
    nacha_bank_name:      data.nacha_bank_name      ?? undefined,
    nacha_company_name:   data.nacha_company_name   ?? undefined,
    sales_tax_rate:          data.sales_tax_rate ?? undefined,
    pos_prices_include_tax:  data.pos_prices_include_tax ?? undefined,
  });
}

// ── Tip & pay settings ────────────────────────────────────────────────────────

export async function updateTipPaySettings(data: {
  tip_split_percent:  number;
  barback_tip_pct:    number;
  opener_bonus_type:  'none' | 'fixed' | 'percentage' | 'hours';
  sales_tax_rate?:         number;
  pos_prices_include_tax?: boolean;
  opener_bonus_value: number;
  default_hourly_rate: number;
  hourly_rates:       HourlyRates;
  barback_split_method?: 'hours' | 'equal';
  barback_tiers_enabled?: boolean;
  barback_tip_tiers?: Array<{ minCount: number; pct: number }>;
  overtime_enabled?:    boolean;
  overtime_multiplier?: number;
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

// ── Clover sync / disconnect ──────────────────────────────────────────────────

export type SyncResult = { created: number; updated: number; skipped: number };

/**
 * Pull the last N business dates of Clover trade through the shared pipeline:
 * Z totals net of tax, tips, cash/card split, hourly, per-server, hours and
 * items (which deplete stock by delta). Same writer as the nightly cron.
 */
export async function syncCloverSales(days = 7): Promise<{ upserted: number }> {
  return pullSales('clover', 'Clover', days);
}

/** One owner/manager-triggered pull for a pull-based POS, through the same writer as the nightly cron. */
async function pullSales(provider: 'clover' | 'toast', name: string, days: number): Promise<{ upserted: number }> {
  const { org, role } = await getCurrentOrg();
  assertEditor(role);
  if (org.pos_provider !== provider) throw new Error(`Not connected to ${name}`);

  const r = await runProviderSync(org.id, { days: Math.min(Math.max(1, Math.trunc(days) || 1), 31) });
  if (!r.ran) throw new Error(r.reason === 'already-running' ? 'A sync is already running. Try again in a minute.' : `Not connected to ${name}`);
  if (r.needsReauth) throw new Error(`${name} no longer accepts the saved login. Reconnect ${name} in Settings.`);
  if (!r.ok && !r.summary?.zReports) throw new Error(r.errors[0] ?? `${name} sync failed`);
  revalidatePath('/app/dashboard');
  return { upserted: r.summary?.zReports ?? 0 };
}

export async function syncCloverInventory(): Promise<SyncResult> {
  const { org } = await getCurrentOrg();
  if (org.pos_provider !== 'clover') throw new Error('Not connected to Clover');

  // Token handling, refresh and the region host all live behind the client.
  let elements: { id: string; name: string; price?: number; code?: string }[];
  try {
    elements = await openCloverClient(createAdminClient(), org.id, org.pos_config as PosConfig)
      .list('/items', { filter: ['hidden=false'] });
  } catch (e) {
    if (e instanceof NeedsReauthError) throw new Error('Clover no longer accepts the saved login. Reconnect Clover in Settings.');
    throw e;
  }
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
      // admin-scope-ok: match.id comes from `existing`, fetched with .eq('organization_id', org.id)
      const { error } = await admin.from('inventory_items').update({ sale_price: item.price != null ? item.price / 100 : undefined, sku: item.code || match.sku || null }).eq('id', match.id);
      error ? result.skipped++ : result.updated++;
    } else {
      const { error } = await admin.from('inventory_items').insert({ organization_id: org.id, name: item.name.trim(), sku: item.code || null, sale_price: item.price != null ? item.price / 100 : null, current_stock: 0, unit: 'each' });
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
  // The stored login goes first. If this fails the org stays connected and the owner can retry.
  await deleteCredentials(admin, org.id);
  const { error } = await admin.from('organizations').update({ pos_provider: null, pos_config: {} }).eq('id', org.id);
  if (error) throw new Error(error.message);
  revalidatePath('/app/settings');
}

// ── 2TouchPOS ─────────────────────────────────────────────────────────────────

export type TwoTouchAgentConfig = {
  orgId:       string;
  agentToken:  string;
  /** The single string the operator pastes into the agent's setup wizard. */
  pairingCode: string;
};

/**
 * RAIL1-<base64url({"o":orgId,"t":agentToken,"u":apiBaseUrl})> — see
 * `2touch-agent-dotnet/Setup/PairingCode.cs`, which parses this.
 *
 * Built on the SERVER on purpose. SITE_URL resolves from
 * VERCEL_PROJECT_PRODUCTION_URL, which is not a NEXT_PUBLIC_ variable and so is
 * undefined in the browser — assembling this client-side would silently fall
 * back to the hardcoded default origin and hand out codes pointing at the wrong
 * host on any non-default deployment.
 */
function buildPairingCode(orgId: string, agentToken: string): string {
  const payload = JSON.stringify({ o: orgId, t: agentToken, u: SITE_URL });
  const b64url  = Buffer.from(payload, 'utf8').toString('base64url');
  return `RAIL1-${b64url}`;
}

/**
 * Save 2Touch config and generate a unique per-org agent_token.
 * The token is half of the pairing code the installer consumes.
 * Using per-org tokens means 1000 different bars each have their own secret —
 * a compromised token from one bar cannot be used to inject data into another.
 */
export async function save2TouchConfig(senderEmail: string): Promise<TwoTouchAgentConfig> {
  const { org, role } = await getCurrentOrg();
  assertEditor(role);
  const admin = createAdminClient();

  // Preserve any existing token if re-saving (e.g. just updating sender email)
  const existing = await mergePosConfig(org.id, {});
  const agentToken = (existing.agent_token as string | undefined)
    ?? randomBytes(32).toString('hex'); // generate once, stable thereafter

  const merged = await mergePosConfig(org.id, {
    twotouch_sender_email: senderEmail.trim().toLowerCase() || null,
    agent_token:           agentToken,
  });

  const { error } = await admin
    .from('organizations')
    .update({ pos_provider: '2touch', pos_config: merged })
    .eq('id', org.id);
  if (error) throw new Error(error.message);
  revalidatePath('/app/settings');
  return { orgId: org.id, agentToken, pairingCode: buildPairingCode(org.id, agentToken) };
}

/** Returns the pairing code the agent's setup wizard asks for. */
export async function get2TouchAgentConfig(): Promise<TwoTouchAgentConfig | null> {
  const { org } = await getCurrentOrg();
  if (org.pos_provider !== '2touch') return null;
  const cfg = (org.pos_config ?? {}) as Record<string, unknown>;
  const token = cfg.agent_token as string | undefined;
  if (!token) return null;
  return { orgId: org.id, agentToken: token, pairingCode: buildPairingCode(org.id, token) };
}

/** Manually trigger an IMAP poll for new 2Touch emails. */
export async function triggerTwoTouchPoll(): Promise<{ processed: number; zReports: number; empReports: number }> {
  const { org } = await getCurrentOrg();
  if (org.pos_provider !== '2touch') throw new Error('2TouchPOS is not configured');
  const { poll2TouchEmails } = await import('@/lib/2touch/poll-emails');
  const result = await poll2TouchEmails();
  if (result.errors.length) console.warn('[2touch poll]', result.errors);
  return { processed: result.processed, zReports: result.zReports, empReports: result.empReports };
}

// ── Toast POS ─────────────────────────────────────────────────────────────────
// Connecting lives in app/(app)/setup/pos/toast/actions.ts. Credentials are
// encrypted in pos_credentials; nothing secret is kept in pos_config.

/** Pull the last N business dates of Toast trade through the shared pipeline: Z totals, tips, split, hourly, servers, hours and items. */
export async function syncToastSales(days = 7): Promise<{ upserted: number }> {
  return pullSales('toast', 'Toast', days);
}

/** Pull Toast menu items into the inventory table (names and prices; stock comes from sales, never from here). */
export async function syncToastInventory(): Promise<SyncResult> {
  const { org, role } = await getCurrentOrg();
  assertEditor(role);
  if (org.pos_provider !== 'toast') throw new Error('Toast is not connected');

  const admin = createAdminClient();
  let items;
  try {
    items = flattenMenuItems(await openToastClient(admin, org.id, org.pos_config as PosConfig).menus());
  } catch (e) {
    if (e instanceof NeedsReauthError) throw new Error('Toast no longer accepts the saved login. Reconnect Toast in Settings.');
    throw e;
  }
  if (!items.length) return { created: 0, updated: 0, skipped: 0 };

  const { data: existing } = await admin
    .from('inventory_items').select('id, name, sku').eq('organization_id', org.id);
  const byName = new Map((existing ?? []).map(i => [i.name.toLowerCase(), i]));
  const bySku  = new Map((existing ?? []).filter(i => i.sku).map(i => [i.sku!, i]));
  const result: SyncResult = { created: 0, updated: 0, skipped: 0 };
  // Toast documents dollars; TOAST_AMOUNTS_IN_CENTS flips it if a sandbox says otherwise.
  const div = process.env.TOAST_AMOUNTS_IN_CENTS === 'true' ? 100 : 1;

  for (const item of items) {
    if (!item.name?.trim()) { result.skipped++; continue; }
    const price = typeof item.price === 'number' ? item.price / div : null;
    const match = (item.sku && bySku.get(item.sku)) ?? byName.get(item.name.toLowerCase());
    if (match) {
      // admin-scope-ok: match.id comes from `existing`, fetched with .eq('organization_id', org.id)
      const { error } = await admin.from('inventory_items').update({
        sale_price: price ?? undefined,
        sku: item.sku || match.sku || null,
      }).eq('id', match.id);
      error ? result.skipped++ : result.updated++;
    } else {
      const { error } = await admin.from('inventory_items').insert({
        organization_id: org.id,
        name:       item.name.trim(),
        sku:        item.sku || null,
        sale_price: price,
        current_stock: 0,
        unit:       'each',
        is_active:  true,
      });
      error ? result.skipped++ : result.created++;
    }
  }

  revalidatePath('/app/inventory');
  return result;
}
