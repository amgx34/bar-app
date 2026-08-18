'use server';

import { revalidatePath } from 'next/cache';
import { randomBytes }    from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';
import { SITE_URL } from '@/lib/site';
import type { BarSettings, HourlyRates } from '@/lib/org';

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

// ── Clover sync / disconnect ──────────────────────────────────────────────────

export type SyncResult = { created: number; updated: number; skipped: number };

/** Pull the last N days of Clover orders → z_report_days */
export async function syncCloverSales(days = 7): Promise<{ upserted: number }> {
  const { org } = await getCurrentOrg();
  if (org.pos_provider !== 'clover') throw new Error('Not connected to Clover');

  const cfg = org.pos_config as { merchant_id: string; access_token: string };
  if (!cfg.access_token || !cfg.merchant_id) throw new Error('Clover connection incomplete — please reconnect');

  const base = process.env.CLOVER_SANDBOX === 'true' ? 'https://apisandbox.dev.clover.com' : 'https://api.clover.com';
  const headers = { Authorization: `Bearer ${cfg.access_token}` };

  // Build per-day buckets over the requested window
  const now = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const startMs = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - (days - 1) * dayMs;

  // Paginate through all orders — a busy bar can have thousands per week
  const endMs   = Date.now();
  const PAGE    = 500;
  const elements: Array<{
    createdTime: number;
    total?: number;
    payments?: { elements?: Array<{ amount?: number; tipAmount?: number; result?: string }> };
  }> = [];

  let offset = 0;
  for (;;) {
    const url = `${base}/v3/merchants/${cfg.merchant_id}/orders`
      + `?expand=payments`
      + `&filter=createdTime>=${startMs}&filter=createdTime<=${endMs}`
      + `&limit=${PAGE}&offset=${offset}`;
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error(`Clover API error: ${res.status}`);
    const page = await res.json() as { elements?: typeof elements };
    const batch = page.elements ?? [];
    elements.push(...batch);
    if (batch.length < PAGE) break; // last page
    offset += PAGE;
    if (offset > 50_000) break;     // safety cap: 50k orders max per sync
  }

  // Aggregate by calendar date (local date string YYYY-MM-DD)
  const byDate = new Map<string, { sales: number; tips: number }>();
  for (const order of elements) {
    const d = new Date(order.createdTime);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!byDate.has(key)) byDate.set(key, { sales: 0, tips: 0 });
    const bucket = byDate.get(key)!;
    bucket.sales += (order.total ?? 0) / 100;
    for (const payment of order.payments?.elements ?? []) {
      if (payment.result === 'SUCCESS') bucket.tips += (payment.tipAmount ?? 0) / 100;
    }
  }

  if (!byDate.size) return { upserted: 0 };

  const admin = createAdminClient();
  const rows = [...byDate.entries()].map(([report_date, { sales, tips }]) => ({
    organization_id: org.id,
    report_date,
    total_sales: Math.round(sales * 100) / 100,
    cc_tips:     Math.round(tips * 100) / 100,
    cash_tips:   0,
  }));

  const { error } = await admin
    .from('z_report_days')
    .upsert(rows, { onConflict: 'organization_id,report_date' });

  if (error) throw new Error(error.message);
  revalidatePath('/app/dashboard');
  return { upserted: rows.length };
}

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
      // admin-scope-ok: match.id comes from `existing`, fetched with .eq('organization_id', org.id)
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

type ToastConfig = { client_id: string; client_secret: string; restaurant_guid: string };

async function getToastClient() {
  const { org } = await getCurrentOrg();
  if (org.pos_provider !== 'toast') throw new Error('Toast is not connected');
  const cfg = org.pos_config as ToastConfig;
  if (!cfg.client_id || !cfg.client_secret || !cfg.restaurant_guid) {
    throw new Error('Toast connection is incomplete — please reconnect in Settings → POS Integration');
  }
  const { ToastClient } = await import('@/lib/toast/client');
  const client = await ToastClient.authenticate(cfg.client_id, cfg.client_secret, cfg.restaurant_guid);
  return { client, org };
}

/** Save Toast credentials after verifying they authenticate successfully. */
export async function connectToast(data: ToastConfig): Promise<void> {
  const { org, role } = await getCurrentOrg();
  assertEditor(role);

  const { ToastClient } = await import('@/lib/toast/client');
  // Test credentials — throws if invalid
  await ToastClient.authenticate(data.client_id, data.client_secret, data.restaurant_guid);

  const admin = createAdminClient();
  const { error } = await admin.from('organizations').update({
    pos_provider: 'toast',
    pos_config:   data,
  }).eq('id', org.id);
  if (error) throw new Error(error.message);
  revalidatePath('/app/settings');
}

/** Pull the last N business days of Toast orders → z_report_days. */
export async function syncToastSales(days = 7): Promise<{ upserted: number }> {
  const { client, org } = await getToastClient();
  const { toToastDate, fromToastDate } = await import('@/lib/toast/client');
  const admin = createAdminClient();

  const rows: Array<{
    organization_id: string;
    report_date: string;
    total_sales: number;
    cc_tips: number;
    cash_tips: number;
  }> = [];

  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const bizDate    = toToastDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    const reportDate = fromToastDate(Number(bizDate));

    const orders = await client.getOrdersByBusinessDate(bizDate);

    let totalSales = 0, ccTips = 0, cashTips = 0;
    for (const order of orders) {
      if (order.voided || order.deleted) continue;
      for (const check of order.checks ?? []) {
        if (check.paymentStatus === 'VOID') continue;
        // sales = total - tip (Toast includes tip in totalAmount)
        const checkTip   = (check.tipAmount ?? 0) / 100;
        const checkTotal = (check.totalAmount ?? 0) / 100;
        totalSales += checkTotal - checkTip;
        // Split by payment type
        if (check.payments?.length) {
          for (const p of check.payments) {
            const t = (p.tipAmount ?? 0) / 100;
            if (p.type === 'CASH') cashTips += t; else ccTips += t;
          }
        } else {
          ccTips += checkTip; // default to CC if no payment breakdown
        }
      }
    }

    if (totalSales > 0 || ccTips > 0 || cashTips > 0) {
      rows.push({
        organization_id: org.id,
        report_date: reportDate,
        total_sales: Math.round(totalSales * 100) / 100,
        cc_tips:     Math.round(ccTips    * 100) / 100,
        cash_tips:   Math.round(cashTips  * 100) / 100,
      });
    }
  }

  if (!rows.length) return { upserted: 0 };

  const { error } = await admin
    .from('z_report_days')
    .upsert(rows, { onConflict: 'organization_id,report_date' });
  if (error) throw new Error(error.message);

  revalidatePath('/app/dashboard');
  return { upserted: rows.length };
}

/** Pull Toast menu items into the inventory table. */
export async function syncToastInventory(): Promise<SyncResult> {
  const { client, org } = await getToastClient();
  const items = await client.getAllMenuItems();
  if (!items.length) return { created: 0, updated: 0, skipped: 0 };

  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('inventory_items').select('id, name, sku').eq('organization_id', org.id);
  const byName = new Map((existing ?? []).map(i => [i.name.toLowerCase(), i]));
  const bySku  = new Map((existing ?? []).filter(i => i.sku).map(i => [i.sku!, i]));
  const result: SyncResult = { created: 0, updated: 0, skipped: 0 };

  for (const item of items) {
    if (!item.name?.trim() || item.hidden) { result.skipped++; continue; }
    const match = (item.sku && bySku.get(item.sku)) ?? byName.get(item.name.toLowerCase());
    if (match) {
      // admin-scope-ok: match.id comes from `existing`, fetched with .eq('organization_id', org.id)
      const { error } = await admin.from('inventory_items').update({
        sale_price: item.price != null ? item.price / 100 : undefined,
        sku: item.sku || match.sku || null,
      }).eq('id', match.id);
      error ? result.skipped++ : result.updated++;
    } else {
      const { error } = await admin.from('inventory_items').insert({
        organization_id: org.id,
        name:       item.name.trim(),
        sku:        item.sku || null,
        sale_price: item.price != null ? item.price / 100 : null,
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

/** Pull Toast employee shifts for the last N business days → employee_shifts. */
export async function syncToastShifts(days = 7): Promise<{ upserted: number; newEmployees: number }> {
  const { client, org } = await getToastClient();
  const { toToastDate } = await import('@/lib/toast/client');
  const admin = createAdminClient();

  // Fetch Toast employees for name lookup
  const toastEmps = await client.getEmployees();
  const empByGuid = new Map(toastEmps.filter(e => !e.deleted).map(e => [
    e.guid,
    `${e.firstName} ${e.lastName}`.trim(),
  ]));

  // Get existing Rail employees for this org
  const { data: railEmps } = await admin
    .from('employees').select('id, name').eq('organization_id', org.id);
  const railByName = new Map((railEmps ?? []).map(e => [e.name.toLowerCase(), e.id]));

  let upserted = 0, newEmployees = 0;

  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    const bizDate    = toToastDate(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
    const shiftDate  = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

    const shifts = await client.getShiftsByBusinessDate(bizDate);
    for (const shift of shifts) {
      if (shift.deleted) continue;
      const empName = empByGuid.get(shift.employee?.guid ?? '') ?? '';
      if (!empName) continue;

      // Create employee if missing
      let empId = railByName.get(empName.toLowerCase());
      if (!empId) {
        const { data: newEmp } = await admin.from('employees').insert({
          organization_id: org.id,
          name: empName,
          tip_mode: 'pool',
        }).select('id').single();
        if (newEmp) {
          empId = newEmp.id;
          railByName.set(empName.toLowerCase(), empId);
          newEmployees++;
        }
      }
      if (!empId) continue;

      // Calculate hours
      const inMs  = shift.inDate  ? new Date(shift.inDate).getTime()  : 0;
      const outMs = shift.outDate ? new Date(shift.outDate).getTime() : 0;
      const hoursWorked = outMs > inMs ? (outMs - inMs) / (1000 * 60 * 60) : 0;

      await admin.from('employee_shifts').upsert({
        organization_id: org.id,
        employee_id:     empId,
        shift_date:      shiftDate,
        regular_hours:   Math.round(Math.min(hoursWorked, 8) * 100) / 100,
        overtime_hours:  Math.round(Math.max(hoursWorked - 8, 0) * 100) / 100,
      }, { onConflict: 'organization_id,employee_id,shift_date' });
      upserted++;
    }
  }

  revalidatePath('/app/payroll');
  return { upserted, newEmployees };
}
