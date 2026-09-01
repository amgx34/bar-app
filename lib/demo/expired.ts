/**
 * Which demo organizations are past their TTL.
 *
 * This exists as its own function because the purge used to find demo orgs only
 * by joining through `memberships` — and deleting the demo user cascades that
 * membership away. The purge's only handle on an org was destroyed by the purge
 * itself, so any org that missed its pass (an org-delete error, a user removed
 * by hand, the older inline purge that swept users only) was orphaned for good.
 * 35 of them had accumulated, counting permanently against the live-demo cap.
 *
 * An org's slug and its own created_at do not depend on anything the purge
 * deletes, so a sweep keyed on those is idempotent and self-healing: it reclaims
 * the existing orphans on its first run and cannot create new ones.
 */

export type PurgeableOrg = {
  id:         string;
  slug:       string | null;
  created_at: string;
};

export function selectExpiredDemoOrgs(
  orgs: readonly PurgeableOrg[],
  slugPrefix: string,
  cutoffIso: string,
): string[] {
  return orgs
    .filter((o) => o.slug?.startsWith(slugPrefix) && o.created_at < cutoffIso)
    .map((o) => o.id);
}
