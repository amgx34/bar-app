import { getCurrentOrg } from '@/lib/org';
import { createAdminClient } from '@/lib/supabase/admin';
import { InventoryTable, type ItemRow } from './_components/inventory-table';
import { InventoryHeader } from './_components/inventory-header';
import { InventoryNav } from './_components/inventory-nav';
import { InventoryDashboard, type DashboardUsageLog, type DashboardItem } from './_components/inventory-dashboard';

export const revalidate = 0; // always fresh

type SearchParams = Promise<{
  q?: string;
  category?: string;
  include_inactive?: string;
}>;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { org, role } = await getCurrentOrg();
  const { q, category, include_inactive } = await searchParams;
  const supabase = createAdminClient();

  // Build query
  let query = supabase
    .from('inventory_items')
    .select(`
      id, name, sku, unit, par_level, cost_price, sale_price,
      current_stock, is_active, category_id, rep_id,
      inventory_categories ( id, name ),
      reps ( id, name )
    `)
    .eq('organization_id', org.id)
    .order('name');

  if (!include_inactive) query = query.eq('is_active', true);
  if (q) query = query.ilike('name', `%${q}%`);
  if (category && category !== 'all') query = query.eq('category_id', category);

  const [{ data: items, error }, { data: categories }, { data: reps }, { data: usageLogs }] = await Promise.all([
    query,
    supabase.from('inventory_categories').select('id, name').eq('organization_id', org.id).order('name'),
    supabase.from('reps').select('id, name').eq('organization_id', org.id).eq('is_active', true).order('name'),
    supabase
      .from('usage_logs')
      .select('item_id, quantity, reason, note, created_at, inventory_items(name)')
      .eq('organization_id', org.id)
      .order('created_at', { ascending: false })
      .limit(500),
  ]);

  if (error) {
    return <main className="p-6 text-destructive">{error.message}</main>;
  }

  return (
    <main className="p-6 space-y-4">
      <InventoryDashboard
        usageLogs={(usageLogs ?? []) as unknown as DashboardUsageLog[]}
        items={(items ?? []) as unknown as DashboardItem[]}
      />
      <InventoryHeader
        role={role}
        categories={categories ?? []}
        reps={reps ?? []}
        currentQ={q ?? ''}
        currentCategory={category ?? 'all'}
        includeInactive={include_inactive === '1'}
      />
      <InventoryNav />
      <InventoryTable
        items={(items ?? []) as unknown as ItemRow[]}
        categories={categories ?? []}
        reps={reps ?? []}
        role={role}
      />
    </main>
  );
}