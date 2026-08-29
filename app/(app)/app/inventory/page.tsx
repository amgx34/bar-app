import type { Metadata } from 'next';
import { getCurrentOrg } from '@/lib/org';
import { createAdminClient } from '@/lib/supabase/admin';
import { InventoryTable, type ItemRow } from './_components/inventory-table';
import { InventoryHeader } from './_components/inventory-header';
import dynamicImport from 'next/dynamic';
import type { DashboardUsageLog, DashboardItem } from './_components/inventory-dashboard';
import { listShipments } from './shipment-actions';

// The only chart component in the app still imported statically, which pulled
// the whole of recharts (~330KB) into the Items route — the most-visited
// inventory page, where the charts sit inside a collapsible panel and are
// hidden entirely below `sm`. Every other chart in the app was already loaded
// this way; this one was the outlier.
//
// The types above stay a normal `import type`: they are erased at compile time
// and never reach the bundle.
const InventoryDashboard = dynamicImport(
  () => import('./_components/inventory-dashboard').then((m) => ({ default: m.InventoryDashboard })),
);

export const revalidate = 0; // always fresh

type SearchParams = Promise<{
  q?: string;
  category?: string;
  include_inactive?: string;
}>;

export const metadata: Metadata = { title: 'Inventory' };

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
      bottle_size_ml, pour_size_oz,
      inventory_categories ( id, name ),
      reps ( id, name )
    `)
    .eq('organization_id', org.id)
    .order('name');

  if (!include_inactive) query = query.eq('is_active', true);
  if (q) query = query.ilike('name', `%${q}%`);
  if (category && category !== 'all') query = query.eq('category_id', category);

  const [{ data: items, error }, { data: categories }, { data: reps }, { data: usageLogs }, shipments] = await Promise.all([
    query,
    supabase.from('inventory_categories').select('id, name, cost_type, default_pour_oz').eq('organization_id', org.id).order('name'),
    supabase.from('reps').select('id, name').eq('organization_id', org.id).eq('is_active', true).order('name'),
    supabase
      .from('usage_logs')
      .select('item_id, quantity, reason, note, logged_at, shipment_id, inventory_items(name)')
      .eq('organization_id', org.id)
      .order('logged_at', { ascending: false })
      .limit(500),
    // Feeds the dashboard's "Latest Shipment" panel. This is a server
    // component, so the real document (vendor, invoice total) can be
    // awaited here and passed straight down as a prop instead of the
    // dashboard reaching for it itself — it stays a plain client component
    // with no server action call hiding in an effect. listShipments is
    // already role-gated and org-scoped internally (see shipment-actions.ts).
    listShipments(),
  ]);

  if (error) {
    return <main className="p-6 text-destructive">{error.message}</main>;
  }

  return (
    <main className="p-6 space-y-4">
      {/* This page leads with a dashboard rather than a title bar, so the
          heading is visually hidden — but the document still needs one h1. */}
      <h1 className="sr-only">Inventory</h1>
      <InventoryDashboard
        usageLogs={(usageLogs ?? []) as unknown as DashboardUsageLog[]}
        items={(items ?? []) as unknown as DashboardItem[]}
        shipments={shipments}
      />
      <InventoryHeader
        role={role}
        categories={categories ?? []}
        reps={reps ?? []}
        currentQ={q ?? ''}
        currentCategory={category ?? 'all'}
        includeInactive={include_inactive === '1'}
        defaultPourOz={org.bar_settings?.default_pour_oz ?? 1.5}
        bottleSizesMl={org.bar_settings?.bottle_sizes_ml ?? [375, 750, 1000, 1750]}
      />
      <InventoryTable
        items={(items ?? []) as unknown as ItemRow[]}
        categories={categories ?? []}
        reps={reps ?? []}
        role={role}
        defaultPourOz={org.bar_settings?.default_pour_oz ?? 1.5}
        bottleSizesMl={org.bar_settings?.bottle_sizes_ml ?? [375, 750, 1000, 1750]}
      />
    </main>
  );
}