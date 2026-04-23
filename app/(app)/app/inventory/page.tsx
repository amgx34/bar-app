import { getCurrentOrg } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { InventoryTable } from './_components/inventory-table';
import { InventoryHeader } from './_components/inventory-header';

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
  const { role } = await getCurrentOrg();
  const { q, category, include_inactive } = await searchParams;
  const supabase = await createClient();

  // Build query
  let query = supabase
    .from('inventory_items')
    .select(`
      id, name, sku, unit, par_level, cost_price, sale_price,
      current_stock, is_active, category_id,
      inventory_categories ( id, name )
    `)
    .order('name');

  if (!include_inactive) query = query.eq('is_active', true);
  if (q) query = query.ilike('name', `%${q}%`);
  if (category && category !== 'all') query = query.eq('category_id', category);

  const [{ data: items, error }, { data: categories }] = await Promise.all([
    query,
    supabase.from('inventory_categories').select('id, name').order('name'),
  ]);

  if (error) {
    return <main className="p-6 text-destructive">{error.message}</main>;
  }

  return (
    <main className="p-6 space-y-4">
      <InventoryHeader
        role={role}
        categories={categories ?? []}
        currentQ={q ?? ''}
        currentCategory={category ?? 'all'}
        includeInactive={include_inactive === '1'}
      />
      <InventoryTable
        items={items ?? []}
        categories={categories ?? []}
        role={role}
      />
    </main>
  );
}