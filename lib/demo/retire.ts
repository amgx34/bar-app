/**
 * Which old per-visitor demo orgs and users are safe to retire. Pure: the script
 * reads the rows and prints or applies this plan, so what it may delete is a
 * tested property. The permanent sample bars and the shared visitor never appear.
 */
import { DEMO_EMAIL_SUFFIX, DEMO_SLUG_PREFIX } from './constants.ts';
import { UNIVERSAL_EMAIL, UNIVERSAL_SLUG_PREFIX } from './universal.ts';

type Org = { id: string; slug: string | null; created_at: string; bar_settings?: Record<string, unknown> | null };
type User = { id: string; email?: string | null; created_at: string };
type Membership = { user_id: string; organization_id: string };

export function planRetire(input: { orgs: Org[]; users: User[]; memberships: Membership[] }) {
  const isOld = (o: Org) => !o.slug?.startsWith(UNIVERSAL_SLUG_PREFIX)
    && (!!o.slug?.startsWith(DEMO_SLUG_PREFIX) || o.bar_settings?._is_demo === true);
  const candidates = input.orgs.filter(isOld);
  const demoUser = (u: User) => !!u.email?.endsWith(DEMO_EMAIL_SUFFIX) && u.email.toLowerCase() !== UNIVERSAL_EMAIL;
  const demoIds = new Set(input.users.filter(demoUser).map((u) => u.id));

  // A real person on the org means it is not a throwaway, whatever its name says.
  const real = new Set(input.memberships.filter((m) => !demoIds.has(m.user_id)).map((m) => m.organization_id));
  const orgs = candidates.filter((o) => !real.has(o.id));
  const protectedOrgs = candidates.filter((o) => real.has(o.id));
  const dates = orgs.map((o) => o.created_at).sort();

  return {
    orgs, protectedOrgs, users: input.users.filter(demoUser),
    oldestOrg: dates[0] ?? null, newestOrg: dates[dates.length - 1] ?? null,
  };
}
