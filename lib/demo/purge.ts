import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { selectExpiredDemoOrgs } from './expired';
import { DEMO_EMAIL_SUFFIX, DEMO_SLUG_PREFIX } from './constants';

/**
 * Deletes demo accounts past their TTL.
 *
 * This used to run inline at the top of every /api/demo request, paging through
 * every auth user in the project before provisioning anything — so a visitor's
 * wait, and the load on Supabase, grew with the total user count. It belongs on
 * a schedule, where it runs once regardless of traffic.
 */

const DEMO_TTL_HOURS = 24;


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

  // ── Organizations ──────────────────────────────────────────────────────────
  // Swept by their OWN slug and age, not by joining through memberships.
  //
  // The membership-driven version could not be made to work: deleting the demo
  // user cascades the membership away, so the purge destroyed its own only
  // handle on the org. Anything that missed a pass — an org-delete error (users
  // were deleted regardless), a user removed by hand, the older inline purge
  // that swept users only — was orphaned permanently. 35 had built up, each one
  // counting forever against MAX_LIVE_DEMO_ORGS in /api/demo and walking that
  // endpoint toward a 503 it could never recover from.
  //
  // A demo org's slug and created_at depend on nothing this function deletes, so
  // this sweep reclaims the existing orphans and cannot create new ones. It runs
  // even when no expired users were found, which is exactly the case the old
  // code could not handle.
  // admin-scope-ok: demo orgs are not tenant data — this is the cross-org
  // housekeeping job that owns their lifecycle, and the filter below restricts
  // it to the demo slug prefix and the TTL cutoff.
  const { data: orgRows, error: orgListErr } = await admin
    .from('organizations')
    .select('id, slug, created_at')
    .like('slug', `${DEMO_SLUG_PREFIX}%`);

  if (orgListErr) errors.push(`organizations list: ${orgListErr.message}`);

  const orgIds = selectExpiredDemoOrgs(orgRows ?? [], DEMO_SLUG_PREFIX, cutoff);
  let orgsDeleted = 0;

  if (orgIds.length > 0) {
    // The cascade clears every child table (inventory_items, z_report_days,
    // employees, reps, weigh_reports, …).
    const { error: orgErr } = await admin.from('organizations').delete().in('id', orgIds);
    if (orgErr) errors.push(`organizations: ${orgErr.message}`);
    else orgsDeleted = orgIds.length;
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  if (expiredIds.length === 0) {
    return { usersDeleted: 0, orgsDeleted, errors };
  }

  const results = await Promise.allSettled(
    expiredIds.map((id) => admin.auth.admin.deleteUser(id)),
  );
  const usersDeleted = results.filter((r) => r.status === 'fulfilled').length;

  return { usersDeleted, orgsDeleted, errors };
}
