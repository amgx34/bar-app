/**
 * POST /api/2touch/ingest
 *
 * Receives Z Report, EW Report, and Item Audit data from the local
 * 2Touch SQL agent running on each bar's POS server.
 *
 * MULTI-TENANT ROUTING:
 *   Each agent includes its org_id in the payload.
 *   Authentication is validated against THAT org's unique agent_token
 *   (stored in pos_config.agent_token), so 1000 different bars each
 *   have their own secret — no shared credential, no cross-org leakage.
 *
 * Security: HMAC-SHA256 in X-Rail-Signature, keyed by the org's agent_token.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createHmac }                from 'crypto';
import { createAdminClient }         from '@/lib/supabase/admin';
import { buildExclusionSet, isExcluded, posItemMatchKey } from '@/lib/pos/excluded-items';
import { resolveSales, toRpcComponents, type BundleRecipe } from '@/lib/pos/bundles';

export const runtime     = 'nodejs';
export const maxDuration = 30;

// ── Types ─────────────────────────────────────────────────────────────────────

type ZReportRow = {
  report_date: string;
  total_sales: number;
  cc_tips:     number;
  cash_tips:   number;
};

type EWReportRow = {
  shift_date:     string;
  employee_name:  string;
  total_sales:    number;
  tips_paid_out:  number;
  regular_hours:  number;
  overtime_hours: number;
};

type ItemAuditRow = {
  sale_date:     string;
  item_name:     string;
  category_name: string;
  qty_sold:      number;
  net_sales:     number;
};

type Payload = {
  org_id:    string;           // REQUIRED — which bar is sending this
  source:    string;
  pulledAt:  string;
  zReports:  ZReportRow[];
  ewReports: EWReportRow[];
  itemAudit: ItemAuditRow[];
};

// Shapes written to Supabase. Collected into arrays and sent as one upsert per
// table rather than one per row — see the note in the EW section below.

type ShiftInsert = {
  organization_id: string;
  employee_id:     string;
  shift_date:      string;
  regular_hours:   number;
  overtime_hours:  number;
};

type ServerTipInsert = {
  organization_id: string;
  report_date:     string;
  employee_name:   string;
  total_sales:     number;
  tips_paid_out:   number;
};

type InventoryItemInsert = {
  organization_id: string;
  name:            string;
  category_id:     string | null;
  unit:            string;
  is_active:       boolean;
};

// ── Auth: per-org HMAC ────────────────────────────────────────────────────────

async function resolveOrgAndVerify(
  body:    string,
  sig:     string,
  orgId:   string,
): Promise<{ valid: boolean; orgId: string | null; posConfig: Record<string, unknown> }> {
  const supabase = createAdminClient();

  // Fetch the specific org — never scan all orgs
  const { data: org } = await supabase
    .from('organizations')
    .select('id, pos_provider, pos_config')
    .eq('id', orgId)
    .eq('pos_provider', '2touch')
    .single();

  if (!org) return { valid: false, orgId: null, posConfig: {} };

  const cfg         = (org.pos_config ?? {}) as Record<string, unknown>;
  const agentToken  = cfg.agent_token as string | null;

  // If no token stored yet, fall back to the global TWOTOUCH_INGEST_SECRET
  // (backwards-compat for initial setup before per-org tokens existed)
  const secret = agentToken ?? process.env.TWOTOUCH_INGEST_SECRET;
  if (!secret) return { valid: false, orgId: null, posConfig: cfg };

  // Sign the RAW request body bytes — never a re-serialized copy.
  // The agent signs exactly the bytes it sends, so the signature is identical
  // regardless of the agent's language/JSON serializer (number formatting like
  // 4521.50 vs 4521.5, and non-ASCII escaping, differ between JSON.stringify
  // and .NET's System.Text.Json). Backward-compatible with the Node agent,
  // which already signs the exact string it POSTs.
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  return { valid: expected === sig, orgId: org.id, posConfig: cfg };
}

/**
 * Stores the last sync time and any errors from it on the org.
 *
 * Written on every sync rather than only on failure, so "last sync succeeded at
 * 21:05" is a positive signal and not merely the absence of a bad one. Errors
 * are truncated: this is a status line, not a log store.
 */
async function recordSyncOutcome(
  orgId: string,
  posConfig: Record<string, unknown>,
  errors: string[],
): Promise<void> {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from('organizations')
    .update({
      pos_config: {
        ...posConfig,
        last_sync_at: new Date().toISOString(),
        last_sync_errors: errors.slice(0, 5).map((e) => e.slice(0, 300)),
      },
    })
    .eq('id', orgId);

  // Never fail an otherwise-good ingest because the status line would not save.
  if (error) console.warn('[2touch] could not record sync outcome:', error.message);
}

/**
 * Records the agent version reported in X-Rail-Agent.
 *
 * Written only when it actually changes. A sync runs every five minutes per
 * bar, so an unconditional write would be ~288 pointless updates a day per
 * organisation, on the row that also holds the auth token.
 */
async function recordAgentVersion(
  orgId: string,
  posConfig: Record<string, unknown>,
  userAgent: string | null,
): Promise<void> {
  // "rail-2touch-agent/1.2.0 (dotnet)" → "1.2.0"
  const version = userAgent?.match(/rail-2touch-agent\/([\d.]+)/)?.[1] ?? null;
  if (!version || posConfig.agent_version === version) return;

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('organizations')
    .update({
      pos_config: { ...posConfig, agent_version: version, agent_seen_at: new Date().toISOString() },
    })
    .eq('id', orgId);

  // Non-fatal by design: failing an entire night's ingest because a version
  // string could not be filed would be a poor trade.
  if (error) console.warn('[2touch] could not record agent version:', error.message);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig  = req.headers.get('x-rail-signature') ?? '';

  // Parse just enough to get org_id for auth
  let orgId: string;
  try {
    const parsed = JSON.parse(body) as Partial<Payload>;
    orgId = parsed.org_id ?? '';
    if (!orgId) return NextResponse.json({ error: 'org_id required in payload' }, { status: 400 });
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { valid, orgId: resolvedOrgId, posConfig } = await resolveOrgAndVerify(body, sig, orgId);
  if (!valid || !resolvedOrgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // After authentication, so an unauthenticated caller cannot write anything.
  await recordAgentVersion(resolvedOrgId, posConfig, req.headers.get('x-rail-agent'));

  const data     = JSON.parse(body) as Payload;
  const supabase = createAdminClient();
  const result   = {
    zReports: 0,
    ewReports: 0,
    itemAudit: 0,
    itemAuditSkipped: 0,
    // Bundle/depletion observability. `stockMoved` counts item-days actually
    // changed, which on a repeated sync of an unchanged day is correctly zero.
    bundlesExpanded: 0,
    salesRecorded: 0,
    stockMoved: 0,
    unresolvedItems: 0,
    errors: [] as string[],
  };

  // ── Z Reports → z_report_days ─────────────────────────────────────────────

  if (data.zReports?.length) {
    const rows = data.zReports
      .filter(r => r.report_date && r.total_sales >= 0)
      .map(r => ({
        organization_id: resolvedOrgId,
        report_date:     r.report_date,
        total_sales:     Math.round(r.total_sales  * 100) / 100,
        cc_tips:         Math.round((r.cc_tips   ?? 0) * 100) / 100,
        cash_tips:       Math.round((r.cash_tips ?? 0) * 100) / 100,
      }));

    if (rows.length) {
      const { error } = await supabase
        .from('z_report_days')
        .upsert(rows, { onConflict: 'organization_id,report_date' });
      if (error) result.errors.push(`z_report_days: ${error.message}`);
      else result.zReports = rows.length;
    }
  }

  // ── EW Reports → employee_shifts + z_report_server_tips ──────────────────

  // This section used to issue two round-trips PER ROW (plus one insert per
  // unseen employee). At ~165ms each, a two-week backfill needed well over the
  // 30s function budget and died mid-write with a 504, leaving the payload
  // half-applied. It is now a fixed handful of statements regardless of size.

  if (data.ewReports?.length) {
    const rows = data.ewReports.filter(r => r.employee_name?.trim() && r.shift_date);

    const { data: empRows, error: empErr } = await supabase
      .from('employees')
      .select('id, name')
      .eq('organization_id', resolvedOrgId);
    if (empErr) result.errors.push(`employees: ${empErr.message}`);

    const empByName = new Map(
      (empRows ?? []).map(e => [e.name.toLowerCase(), e.id]),
    );

    // Create every unseen employee in one insert. Keyed lowercase so a bar that
    // spells a name two ways doesn't end up with two employee records.
    const newNames = [...new Map(
      rows
        .map(r => r.employee_name.trim())
        .filter(n => !empByName.has(n.toLowerCase()))
        .map(n => [n.toLowerCase(), n]),
    ).values()];

    if (newNames.length) {
      const { data: created, error } = await supabase
        .from('employees')
        .insert(newNames.map(name => ({
          organization_id: resolvedOrgId,
          name,
          tip_mode: 'pool',
        })))
        .select('id, name');
      if (error) result.errors.push(`employees: ${error.message}`);
      for (const e of created ?? []) empByName.set(e.name.toLowerCase(), e.id);
    }

    // Postgres rejects an ON CONFLICT statement that touches the same key twice
    // ("cannot affect row a second time"), so collapse duplicates before
    // sending. Keyed exactly like each table's unique constraint, and last row
    // wins — the same result the previous row-by-row upserts produced.
    const shifts = new Map<string, ShiftInsert>();
    const tips   = new Map<string, ServerTipInsert>();

    for (const row of rows) {
      const name  = row.employee_name.trim();
      const empId = empByName.get(name.toLowerCase());
      if (!empId) continue;

      shifts.set(`${empId}|${row.shift_date}`, {
        organization_id: resolvedOrgId,
        employee_id:     empId,
        shift_date:      row.shift_date,
        regular_hours:   row.regular_hours  ?? 0,
        overtime_hours:  row.overtime_hours ?? 0,
      });

      if (row.tips_paid_out > 0) {
        tips.set(`${row.shift_date}|${name}`, {
          organization_id: resolvedOrgId,
          report_date:     row.shift_date,
          employee_name:   name,
          total_sales:     row.total_sales   ?? 0,
          tips_paid_out:   row.tips_paid_out ?? 0,
        });
      }
    }

    if (shifts.size) {
      const { error } = await supabase
        .from('employee_shifts')
        .upsert([...shifts.values()], { onConflict: 'organization_id,employee_id,shift_date' });
      if (error) result.errors.push(`employee_shifts: ${error.message}`);
      else result.ewReports = shifts.size;
    }

    if (tips.size) {
      const { error } = await supabase
        .from('z_report_server_tips')
        .upsert([...tips.values()], { onConflict: 'organization_id,report_date,employee_name' });
      if (error) result.errors.push(`z_report_server_tips: ${error.message}`);
    }
  }

  // ── Item Audit → inventory items + categories ────────────────────────────

  if (data.itemAudit?.length) {
    // Deals and combos ring up like products but are not stock. Filtering here
    // rather than after the upsert means they never reach inventory at all.
    const { data: exclusionRows, error: exclusionErr } = await supabase
      .from('pos_excluded_items')
      .select('match_key')
      .eq('organization_id', resolvedOrgId);

    if (exclusionErr) {
      // Fail loudly rather than silently syncing everything: a dropped
      // exclusion list would refill inventory with the deals the operator
      // already removed once.
      result.errors.push(`pos_excluded_items: ${exclusionErr.message}`);
    }

    const exclusions = buildExclusionSet(exclusionRows ?? []);
    const skipped: string[] = [];

    data.itemAudit = data.itemAudit.filter((r) => {
      const name = r.item_name?.trim();
      if (name && isExcluded(name, exclusions)) {
        skipped.push(name);
        return false;
      }
      return true;
    });

    if (skipped.length) {
      console.log(`[2touch] skipped ${skipped.length} excluded item(s)`);
    }
    result.itemAuditSkipped = skipped.length;
  }

  if (data.itemAudit?.length) {
    // ── Bundle recipes ──────────────────────────────────────────────────────
    //
    // Loaded before anything is created, because a bundle must never become an
    // inventory item — that is the phantom-stock problem this exists to end.
    const { data: bundleRows, error: bundleErr } = await supabase
      .from('pos_bundles')
      .select('id, match_key, pos_bundle_components(inventory_item_id, quantity)')
      .eq('organization_id', resolvedOrgId)
      .eq('is_active', true);

    if (bundleErr) {
      // Same reasoning as the exclusion list: syncing as though no bundle
      // existed would recreate the phantom items and deplete nothing.
      result.errors.push(`pos_bundles: ${bundleErr.message}`);
    }

    const bundles: BundleRecipe[] = (bundleRows ?? []).map((b) => ({
      match_key: b.match_key,
      components: (b.pos_bundle_components ?? []).map((c) => ({
        inventory_item_id: c.inventory_item_id,
        quantity: Number(c.quantity),
      })),
    }));
    const bundleKeySet = new Set(bundles.map((b) => b.match_key));

    // Rows that are genuinely stock. Bundles are excluded from category and
    // item creation but stay in `data.itemAudit` for the sales facts below,
    // because their revenue belongs to the deal, not to its components.
    const stockRows = data.itemAudit.filter(
      (r) => r.item_name?.trim() && !bundleKeySet.has(posItemMatchKey(r.item_name.trim())),
    );

    const catNames = [...new Set(stockRows.map(r => r.category_name).filter(Boolean))];
    const catIdMap = new Map<string, string>();

    if (catNames.length) {
      const { data: cats, error } = await supabase
        .from('inventory_categories')
        .upsert(
          catNames.map(name => ({ organization_id: resolvedOrgId, name })),
          { onConflict: 'organization_id,name' },
        )
        .select('id, name');
      if (error) result.errors.push(`inventory_categories: ${error.message}`);
      for (const c of cats ?? []) catIdMap.set(c.name, c.id);
    }

    // Keyed on name alone, matching the UNIQUE (organization_id, name)
    // constraint this upsert targets.
    const items = new Map<string, InventoryItemInsert>();
    for (const row of stockRows) {
      const name = row.item_name?.trim();
      if (!name) continue;
      items.set(name, {
        organization_id: resolvedOrgId,
        name,
        category_id: catIdMap.get(row.category_name ?? '') ?? null,
        unit:        'each',
        is_active:   true,
      });
    }

    if (items.size) {
      // ignoreDuplicates leaves items the bar already has untouched, so manual
      // edits to category/unit/pricing survive the next sync.
      //
      // The error check matters: this upsert silently failed with 42P10 on
      // every row until inventory_items got its UNIQUE (organization_id, name)
      // constraint, while the old code still counted the rows as written.
      const { error } = await supabase
        .from('inventory_items')
        .upsert([...items.values()], {
          onConflict: 'organization_id,name',
          ignoreDuplicates: true,
        });
      if (error) result.errors.push(`inventory_items: ${error.message}`);
      else result.itemAudit = items.size;
    }

    // ── Sales facts and stock depletion ────────────────────────────────────
    //
    // Read back after the upsert rather than from its return value:
    // `ignoreDuplicates` returns nothing for rows that already existed, which
    // is most of them on every sync after the first.
    const { data: allItems, error: itemsErr } = await supabase
      .from('inventory_items')
      .select('id, name')
      .eq('organization_id', resolvedOrgId);

    if (itemsErr) result.errors.push(`inventory_items lookup: ${itemsErr.message}`);

    const idByMatchKey = new Map<string, string>();
    for (const item of allItems ?? []) {
      idByMatchKey.set(posItemMatchKey(item.name), item.id);
    }

    const resolved = resolveSales(data.itemAudit, bundles, idByMatchKey);
    result.bundlesExpanded = resolved.bundleKeys.size;
    result.unresolvedItems = resolved.unresolvedNames.length;

    if (resolved.facts.length) {
      const { error } = await supabase
        .from('pos_item_sales')
        .upsert(
          resolved.facts.map((f) => ({
            organization_id: resolvedOrgId,
            sale_date:     f.sale_date,
            item_name:     f.item_name,
            match_key:     f.match_key,
            category_name: f.category_name,
            qty_sold:      f.qty_sold,
            net_sales:     Math.round(f.net_sales * 100) / 100,
            is_bundle:     f.is_bundle,
            updated_at:    new Date().toISOString(),
          })),
          { onConflict: 'organization_id,sale_date,match_key' },
        );
      if (error) result.errors.push(`pos_item_sales: ${error.message}`);
      else result.salesRecorded = resolved.facts.length;
    }

    // One call per business day. The agent's lookback is two days by default,
    // so this is two or three round trips — not a loop over rows.
    //
    // Each call is delta-based against pos_stock_applications, which is what
    // makes re-sending the same day every five minutes a no-op instead of
    // draining the bar's stock. See the migration for the full reasoning.
    for (const [saleDate, dayMap] of resolved.depletionByDate) {
      const { data: moved, error } = await supabase.rpc('pos_apply_item_sales', {
        p_org:        resolvedOrgId,
        p_sale_date:  saleDate,
        p_components: toRpcComponents(dayMap),
      });
      if (error) {
        result.errors.push(`pos_apply_item_sales(${saleDate}): ${error.message}`);
        // Keep going: a failure on one day should not block the others, and the
        // ledger means the failed day is simply retried on the next sync.
        continue;
      }
      result.stockMoved += (moved ?? []).length;
    }

    if (resolved.unresolvedNames.length) {
      // Expected to be everything on a first sync, and a broken link afterwards
      // — a POS rename, or an item deactivated in Rail but still selling.
      console.log(
        `[2touch] ${resolved.unresolvedNames.length} item(s) had no inventory match:`,
        resolved.unresolvedNames.slice(0, 20),
      );
    }
  }

  // Record the outcome on the org so a failing sync is visible in the app.
  //
  // This exists because pos_apply_item_sales failed on every single sync for
  // days without anyone noticing: the route deliberately collects RPC errors
  // and carries on so one bad day cannot block the rest, but "carries on" also
  // meant the only trace was a server log nobody reads. The POS settings panel
  // now shows the last sync and anything that went wrong on it.
  await recordSyncOutcome(resolvedOrgId, posConfig, result.errors);

  if (result.errors.length) {
    console.error(`[2touch/ingest] org=${resolvedOrgId} FAILED`, result.errors);
  } else {
    console.log(`[2touch/ingest] org=${resolvedOrgId}`, result);
  }
  return NextResponse.json(result);
}
