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

  if (data.ewReports?.length) {
    const { data: empRows } = await supabase
      .from('employees')
      .select('id, name')
      .eq('organization_id', resolvedOrgId);

    const empByName = new Map(
      (empRows ?? []).map(e => [e.name.toLowerCase(), e.id]),
    );

    for (const row of data.ewReports) {
      if (!row.employee_name?.trim() || !row.shift_date) continue;

      let empId = empByName.get(row.employee_name.toLowerCase());
      if (!empId) {
        const { data: newEmp } = await supabase
          .from('employees')
          .insert({ organization_id: resolvedOrgId, name: row.employee_name.trim(), tip_mode: 'pool' })
          .select('id').single();
        if (newEmp?.id) {
          empId = newEmp.id;
          empByName.set(row.employee_name.toLowerCase(), empId);
        }
      }
      if (!empId) continue;

      await supabase.from('employee_shifts').upsert({
        organization_id: resolvedOrgId,
        employee_id:     empId,
        shift_date:      row.shift_date,
        regular_hours:   row.regular_hours  ?? 0,
        overtime_hours:  row.overtime_hours ?? 0,
      }, { onConflict: 'organization_id,employee_id,shift_date' });

      if (row.tips_paid_out > 0) {
        await supabase.from('z_report_server_tips').upsert({
          organization_id: resolvedOrgId,
          report_date:     row.shift_date,
          employee_name:   row.employee_name.trim(),
          total_sales:     row.total_sales   ?? 0,
          tips_paid_out:   row.tips_paid_out ?? 0,
        }, { onConflict: 'organization_id,report_date,employee_name' });
      }

      result.ewReports++;
    }
  }

  // ── Item Audit → inventory items + categories ────────────────────────────

  if (data.itemAudit?.length) {
    const catNames = [...new Set(data.itemAudit.map(r => r.category_name).filter(Boolean))];
    const catIdMap = new Map<string, string>();

    for (const name of catNames) {
      const { data: cat } = await supabase
        .from('inventory_categories')
        .upsert({ organization_id: resolvedOrgId, name }, { onConflict: 'organization_id,name' })
        .select('id').single();
      if (cat?.id) catIdMap.set(name, cat.id);
    }

    for (const row of data.itemAudit) {
      if (!row.item_name?.trim()) continue;
      const catId = catIdMap.get(row.category_name ?? '') ?? null;

      await supabase.from('inventory_items').upsert({
        organization_id: resolvedOrgId,
        name:        row.item_name.trim(),
        category_id: catId,
        unit:        'each',
        is_active:   true,
      }, { onConflict: 'organization_id,name', ignoreDuplicates: true });

      result.itemAudit++;
    }
  }

  console.log(`[2touch/ingest] org=${resolvedOrgId}`, result);
  return NextResponse.json(result);
}
