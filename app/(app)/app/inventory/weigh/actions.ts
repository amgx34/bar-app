'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOrg } from '@/lib/org';

const OZ_PER_ML = 0.033814;

/**
 * weigh_report_items carries no organization_id of its own — it inherits
 * tenancy from its parent report. Since createAdminClient() bypasses RLS, every
 * mutation has to walk that link by hand before touching a row, or a caller can
 * pass any UUID and reach another bar's data.
 *
 * Both helpers throw rather than return null: a caller that forgets to check a
 * return value would reintroduce exactly the hole these close.
 */
async function assertReportInOrg(
  supabase: ReturnType<typeof createAdminClient>,
  reportId: string,
  orgId: string,
): Promise<void> {
  const { data } = await supabase
    .from('weigh_reports')
    .select('id')
    .eq('id', reportId)
    .eq('organization_id', orgId)
    .maybeSingle();

  // Same message whether the report is missing or belongs to someone else —
  // distinguishing them would confirm the existence of another org's rows.
  if (!data) throw new Error('Weigh report not found');
}

async function assertItemInOrg(
  supabase: ReturnType<typeof createAdminClient>,
  itemId: string,
  orgId: string,
): Promise<void> {
  const { data } = await supabase
    .from('weigh_report_items')
    .select('id, weigh_reports!inner(organization_id)')
    .eq('id', itemId)
    .eq('weigh_reports.organization_id', orgId)
    .maybeSingle();

  if (!data) throw new Error('Weigh item not found');
}

function calcOzConsumed(item: {
  opening_level: number | null;
  closing_level: number | null;
  full_bottles_opened: number;
  bottle_size_ml: number | null;
}): number {
  if (!item.bottle_size_ml) return 0;
  const open  = item.opening_level  ?? 1;
  const close = item.closing_level  ?? 0;
  return (open - close + item.full_bottles_opened) * (item.bottle_size_ml * OZ_PER_ML);
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type WeighReport = {
  id: string;
  report_date: string;
  shift: 'opening' | 'closing' | 'daily';
  notes: string | null;
  created_at: string;
  item_count: number;
};

export type WeighReportItem = {
  id: string;
  weigh_report_id: string;
  inventory_item_id: string | null;
  item_name: string;
  bottle_size_ml: number | null;
  pour_size_oz: number | null;
  cost_price: number | null;
  opening_level: number | null;
  closing_level: number | null;
  full_bottles_opened: number;
  notes: string | null;
  oz_consumed: number;
  cost_consumed: number;
  expected_pours: number;
};

export type WeighReportDetail = WeighReport & { items: WeighReportItem[] };

export type InventoryItemForWeigh = {
  id: string;
  name: string;
  bottle_size_ml: number | null;
  pour_size_oz: number | null;
  cost_price: number | null;
};

export type PourAnalysisItem = {
  item_name: string;
  bottle_size_ml: number | null;
  pour_size_oz: number | null;
  cost_price: number | null;
  total_oz_consumed: number;
  cost_consumed: number;
  expected_pours: number;
  report_count: number;
};

// ── Queries ───────────────────────────────────────────────────────────────────

export async function getWeighReports(): Promise<WeighReport[]> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('weigh_reports')
    .select('id, report_date, shift, notes, created_at')
    .eq('organization_id', org.id)
    .order('report_date', { ascending: false });

  if (!data || data.length === 0) return [];

  const ids = data.map((r) => r.id);
  const { data: itemRows } = await supabase
    .from('weigh_report_items')
    // admin-scope-ok: `ids` come from a weigh_reports query filtered by
    // organization_id, so this .in() cannot reach another bar's rows.
    .select('weigh_report_id')
    .in('weigh_report_id', ids);

  const countMap = new Map<string, number>();
  for (const row of itemRows ?? []) {
    countMap.set(row.weigh_report_id, (countMap.get(row.weigh_report_id) ?? 0) + 1);
  }

  return data.map((r) => ({
    ...r,
    shift: r.shift as WeighReport['shift'],
    item_count: countMap.get(r.id) ?? 0,
  }));
}

export async function getWeighReport(id: string): Promise<WeighReportDetail | null> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();

  const { data: report } = await supabase
    .from('weigh_reports')
    .select('id, report_date, shift, notes, created_at')
    .eq('id', id)
    .eq('organization_id', org.id)
    .single();

  if (!report) return null;

  const { data: rawItems } = await supabase
    .from('weigh_report_items')
    // admin-scope-ok: the parent report was fetched above with
    // .eq('organization_id', org.id) and the function returns null if absent.
    .select('id, weigh_report_id, inventory_item_id, item_name, bottle_size_ml, pour_size_oz, cost_price, opening_level, closing_level, full_bottles_opened, notes')
    .eq('weigh_report_id', id)
    .order('item_name');

  const items: WeighReportItem[] = (rawItems ?? []).map((item) => {
    const oz        = calcOzConsumed(item);
    const bottleOz  = (item.bottle_size_ml ?? 0) * OZ_PER_ML;
    const costPerOz = item.cost_price && bottleOz > 0 ? item.cost_price / bottleOz : 0;
    return {
      ...item,
      opening_level:       item.opening_level as number | null,
      closing_level:       item.closing_level as number | null,
      oz_consumed:         oz,
      cost_consumed:       oz * costPerOz,
      expected_pours:      item.pour_size_oz && item.pour_size_oz > 0 ? oz / item.pour_size_oz : 0,
    };
  });

  return {
    ...report,
    shift:      report.shift as WeighReport['shift'],
    item_count: items.length,
    items,
  };
}

export async function getInventoryItemsForWeigh(): Promise<InventoryItemForWeigh[]> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('inventory_items')
    .select('id, name, bottle_size_ml, pour_size_oz, cost_price')
    .eq('organization_id', org.id)
    .eq('is_active', true)
    .not('bottle_size_ml', 'is', null)
    .order('name');
  return (data ?? []) as InventoryItemForWeigh[];
}

export async function getPourAnalysis(startDate: string, endDate: string): Promise<PourAnalysisItem[]> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();

  const { data: reports } = await supabase
    .from('weigh_reports')
    .select('id')
    .eq('organization_id', org.id)
    .gte('report_date', startDate)
    .lte('report_date', endDate);

  if (!reports || reports.length === 0) return [];

  // admin-scope-ok: `reports` was fetched with .eq('organization_id', org.id),
  // so this .in() can only match items under this bar's reports.
  const { data: items } = await supabase
    .from('weigh_report_items')
    .select('item_name, bottle_size_ml, pour_size_oz, cost_price, opening_level, closing_level, full_bottles_opened')
    .in('weigh_report_id', reports.map((r) => r.id));

  const grouped = new Map<string, {
    rows: typeof items;
    bottle_size_ml: number | null;
    pour_size_oz: number | null;
    cost_price: number | null;
  }>();

  for (const item of items ?? []) {
    if (!grouped.has(item.item_name)) {
      grouped.set(item.item_name, {
        rows: [],
        bottle_size_ml: item.bottle_size_ml,
        pour_size_oz:   item.pour_size_oz,
        cost_price:     item.cost_price,
      });
    }
    grouped.get(item.item_name)!.rows!.push(item);
  }

  return [...grouped.entries()]
    .map(([item_name, g]) => {
      const totalOz   = (g.rows ?? []).reduce((s, i) => s + calcOzConsumed(i), 0);
      const bottleOz  = (g.bottle_size_ml ?? 0) * OZ_PER_ML;
      const costPerOz = g.cost_price && bottleOz > 0 ? g.cost_price / bottleOz : 0;
      return {
        item_name,
        bottle_size_ml:    g.bottle_size_ml,
        pour_size_oz:      g.pour_size_oz,
        cost_price:        g.cost_price,
        total_oz_consumed: totalOz,
        cost_consumed:     totalOz * costPerOz,
        expected_pours:    g.pour_size_oz && g.pour_size_oz > 0 ? totalOz / g.pour_size_oz : 0,
        report_count:      (g.rows ?? []).length,
      };
    })
    .sort((a, b) => b.cost_consumed - a.cost_consumed);
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export async function createWeighReport(data: {
  report_date: string;
  shift: 'opening' | 'closing' | 'daily';
  notes?: string;
}): Promise<string> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();

  const { data: report, error } = await supabase
    .from('weigh_reports')
    .insert({
      organization_id: org.id,
      report_date: data.report_date,
      shift:       data.shift,
      notes:       data.notes || null,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);
  revalidatePath('/app/inventory/weigh');
  return report.id as string;
}

export async function addWeighItem(data: {
  weigh_report_id: string;
  inventory_item_id?: string | null;
  item_name: string;
  bottle_size_ml?: number | null;
  pour_size_oz?: number | null;
  cost_price?: number | null;
  opening_level?: number | null;
  closing_level?: number | null;
  full_bottles_opened?: number;
  notes?: string;
}): Promise<void> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();

  // The report id comes straight from the client, so it is checked before use.
  await assertReportInOrg(supabase, data.weigh_report_id, org.id);

  // admin-scope-ok: assertReportInOrg() above throws unless the parent
  // report belongs to the caller's org.
  const { error } = await supabase.from('weigh_report_items').insert({
    weigh_report_id:    data.weigh_report_id,
    inventory_item_id:  data.inventory_item_id  ?? null,
    item_name:          data.item_name,
    bottle_size_ml:     data.bottle_size_ml      ?? null,
    pour_size_oz:       data.pour_size_oz        ?? null,
    cost_price:         data.cost_price          ?? null,
    opening_level:      data.opening_level       ?? null,
    closing_level:      data.closing_level       ?? null,
    full_bottles_opened: data.full_bottles_opened ?? 0,
    notes:              data.notes               || null,
  });
  if (error) throw new Error(error.message);
  revalidatePath('/app/inventory/weigh');
}

export async function updateWeighItem(id: string, data: {
  opening_level?: number | null;
  closing_level?: number | null;
  full_bottles_opened?: number;
  notes?: string;
}): Promise<void> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();

  await assertItemInOrg(supabase, id, org.id);

  // admin-scope-ok: assertItemInOrg() above throws unless the item's parent
  // report belongs to the caller's org.
  const { error } = await supabase
    .from('weigh_report_items')
    .update({
      opening_level:       data.opening_level       ?? null,
      closing_level:       data.closing_level       ?? null,
      full_bottles_opened: data.full_bottles_opened ?? 0,
      notes:               data.notes               || null,
    })
    .eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/app/inventory/weigh');
}

export async function deleteWeighItem(id: string): Promise<void> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();

  await assertItemInOrg(supabase, id, org.id);

  // admin-scope-ok: assertItemInOrg() above throws unless the item's parent
  // report belongs to the caller's org.
  const { error } = await supabase.from('weigh_report_items').delete().eq('id', id);
  if (error) throw new Error(error.message);
  revalidatePath('/app/inventory/weigh');
}

export async function deleteWeighReport(id: string): Promise<void> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();
  await supabase.from('weigh_reports').delete().eq('id', id).eq('organization_id', org.id);
  revalidatePath('/app/inventory/weigh');
}
