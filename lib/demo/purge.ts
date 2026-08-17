import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Deletes demo accounts past their TTL.
 *
 * This used to run inline at the top of every /api/demo request, paging through
 * every auth user in the project before provisioning anything — so a visitor's
 * wait, and the load on Supabase, grew with the total user count. It belongs on
 * a schedule, where it runs once regardless of traffic.
 */

const DEMO_TTL_HOURS = 24;
const DEMO_EMAIL_SUFFIX = '@rail.demo';

export type PurgeResult = {
  usersDeleted: number;
  orgsDeleted: number;
  errors: string[];
};

export async function purgeExpiredDemoUsers(): Promise<PurgeResult> {
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - DEMO_TTL_HOURS * 60 * 60 * 1000).toISOString();
  const errors: string[] = [];

  // Collect expired demo user IDs (paginated).
  const expiredIds: string[] = [];
  let page = 1;

  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) {
      errors.push(`listUsers page ${page}: ${error.message}`);
      break;
    }
    if (!data?.users?.length) break;

    for (const u of data.users) {
      if (u.email?.endsWith(DEMO_EMAIL_SUFFIX) && u.created_at < cutoff) {
        expiredIds.push(u.id);
      }
    }

    if (data.users.length < 100) break; // last page
    page++;
  }

  if (expiredIds.length === 0) {
    return { usersDeleted: 0, orgsDeleted: 0, errors };
  }

  // Organizations first — the cascade clears every child table
  // (inventory_items, z_report_days, employees, reps, weigh_reports, …).
  const { data: memberRows, error: memberErr } = await admin
    .from('memberships')
    .select('organization_id')
    .in('user_id', expiredIds);

  if (memberErr) errors.push(`memberships: ${memberErr.message}`);

  const orgIds = [...new Set((memberRows ?? []).map((m) => m.organization_id))];
  let orgsDeleted = 0;

  if (orgIds.length > 0) {
    const { error: orgErr } = await admin.from('organizations').delete().in('id', orgIds);
    if (orgErr) errors.push(`organizations: ${orgErr.message}`);
    else orgsDeleted = orgIds.length;
  }

  const results = await Promise.allSettled(
    expiredIds.map((id) => admin.auth.admin.deleteUser(id)),
  );
  const usersDeleted = results.filter((r) => r.status === 'fulfilled').length;

  return { usersDeleted, orgsDeleted, errors };
}
