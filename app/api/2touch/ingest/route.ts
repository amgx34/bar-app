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
): Promise<{ valid: boolean; orgId: string | null }> {
  const supabase = createAdminClient();

  // Fetch the specific org — never scan all orgs
  const { data: org } = await supabase
    .from('organizations')
    .select('id, pos_provider, pos_config')
    .eq('id', orgId)
    .eq('pos_provider', '2touch')
    .single();

  if (!org) return { valid: false, orgId: null };

  const cfg         = (org.pos_config ?? {}) as Record<string, unknown>;
  const agentToken  = cfg.agent_token as string | null;

  // If no token stored yet, fall back to the global TWOTOUCH_INGEST_SECRET
  // (backwards-compat for initial setup before per-org tokens existed)
  const secret = agentToken ?? process.env.TWOTOUCH_INGEST_SECRET;
  if (!secret) return { valid: false, orgId: null };

  // Sign the RAW request body bytes — never a re-serialized copy.
  // The agent signs exactly the bytes it sends, so the signature is identical
  // regardless of the agent's language/JSON serializer (number formatting like
  // 4521.50 vs 4521.5, and non-ASCII escaping, differ between JSON.stringify
  // and .NET's System.Text.Json). Backward-compatible with the Node agent,
  // which already signs the exact string it POSTs.
  const expected = createHmac('sha256', secret).update(body).digest('hex');
  return { valid: expected === sig, orgId: org.id };
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

  const { valid, orgId: resolvedOrgId } = await resolveOrgAndVerify(body, sig, orgId);
  if (!valid || !resolvedOrgId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const data     = JSON.parse(body) as Payload;
  const supabase = createAdminClient();
  const result   = { zReports: 0, ewReports: 0, itemAudit: 0, errors: [] as string[] };

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
    const catNames = [...new Set(data.itemAudit.map(r => r.category_name).filter(Boolean))];
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
    for (const row of data.itemAudit) {
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
  }

  console.log(`[2touch/ingest] org=${resolvedOrgId}`, result);
  return NextResponse.json(result);
}
