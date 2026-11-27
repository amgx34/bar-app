import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentOrg } from '@/lib/org';
import { createAdminClient } from '@/lib/supabase/admin';
import { canAdjustStock } from '@/lib/permissions';
import { CountSession, type CountItem } from './_components/count-session';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Count stock' };

export default async function CountPage() {
  const { org, role } = await getCurrentOrg();
  if (!canAdjustStock(role)) redirect('/app/inventory');

  const { data } = await createAdminClient()
    .from('inventory_items')
    .select('id, name, unit, current_stock, is_active, inventory_categories ( name )')
    .eq('organization_id', org.id)
    .order('name');

  const items: CountItem[] = (data ?? [])
    .filter((i) => i.is_active !== false)
    .map((i) => ({
      id: i.id as string,
      name: i.name as string,
      unit: (i.unit as string) ?? '',
      expected: Number(i.current_stock),
      category: (i.inventory_categories as unknown as { name: string } | null)?.name ?? 'Uncategorized',
    }))
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  return <CountSession orgId={org.id} items={items} />;
}
