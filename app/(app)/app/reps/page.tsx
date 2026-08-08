import type { Metadata } from 'next';
import { getCurrentOrg } from '@/lib/org';
import { createAdminClient } from '@/lib/supabase/admin';
import { RepsTable } from './_components/reps-table';
import type { Rep } from './actions';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = { title: 'Reps' };

export default async function RepsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { org, role } = await getCurrentOrg();
  const params = await searchParams;
  const admin  = createAdminClient();

  const { data: repsRaw } = await admin
    .from('reps')
    .select('id, name, company, phone, email, notes, is_active, created_at')
    .eq('organization_id', org.id)
    .eq('is_active', true)
    .order('name');

  // Get product counts per rep
  const repIds = (repsRaw ?? []).map((r) => r.id as string);
  let countMap: Record<string, number> = {};
  if (repIds.length > 0) {
    const { data: countRows } = await admin
      .from('inventory_items')
      .select('rep_id')
      .eq('organization_id', org.id)
      .eq('is_active', true)
      .in('rep_id', repIds);
    for (const row of countRows ?? []) {
      if (row.rep_id) countMap[row.rep_id as string] = (countMap[row.rep_id as string] ?? 0) + 1;
    }
  }

  const reps: Rep[] = (repsRaw ?? []).map((r) => ({
    ...r,
    company: r.company ?? null,
    phone:   r.phone   ?? null,
    email:   r.email   ?? null,
    notes:   r.notes   ?? null,
    product_count: countMap[r.id as string] ?? 0,
  }));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reps</h1>
        <p className="text-muted-foreground">Manage sales reps and suppliers, and send purchase orders</p>
      </div>

      <RepsTable
        reps={reps}
        role={role}
        defaultOrderId={params.order ?? null}
      />
    </div>
  );
}
