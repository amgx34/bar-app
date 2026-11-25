// Pure assembly of GET /api/v1/me. All I/O is injected, so tests use plain objects.
import { parseBearer } from './bearer';
import { fail, ok, type ApiResult } from './envelope';
import { ownMemberships, selectActive } from './org-scope';
import { MeResponseSchema, ROLES } from './contract';
import { resolveAccountState, type AccountRow } from '../employee-portal/session-state';
import { visibleDestinations } from '../nav/destinations';
import type { Role } from '../permissions';

export interface MembershipRow {
  user_id?: string | null;
  organization_id: string;
  role: string;
  created_at?: string | null;
  organizations: { id: string; name: string } | { id: string; name: string }[] | null;
}

export interface MeDeps {
  authorization: string | null;
  requestedOrg: string | null;
  requestId: string;
  now: () => Date;
  /** Verifies the token with Supabase. `user: null` means invalid or expired. */
  verify: (token: string) => Promise<{ user: { id: string; email: string } | null; reason?: string }>;
  /** Reads the caller's own rows only, through the caller's own client. */
  load: (userId: string) => Promise<{ membershipRows: MembershipRow[]; accountRow: AccountRow | null }>;
}

export async function handleMe(d: MeDeps): Promise<ApiResult<unknown>> {
  const opts = { requestId: d.requestId };
  const withId = <T extends ApiResult<unknown>>(r: T): T => ({ ...r, headers: { ...r.headers, 'X-Request-Id': d.requestId } });
  try {
    const token = parseBearer(d.authorization);
    if (!token) return withId(fail('unauthenticated', 'Sign in to continue.', opts));
    const { user } = await d.verify(token);
    if (!user) return withId(fail('unauthenticated', 'Your session has expired. Sign in again.', opts));

    const { membershipRows, accountRow } = await d.load(user.id);
    const rows = ownMemberships(membershipRows, user.id).filter((r) => (ROLES as readonly string[]).includes(r.role));
    const own = rows.map((r) => {
      const org = Array.isArray(r.organizations) ? r.organizations[0] : r.organizations;
      return { r, org };
    }).filter((x) => x.org && x.org.id === x.r.organization_id);
    // Oldest first, so the list order is stable.
    own.sort((a, b) => (a.r.created_at ?? '').localeCompare(b.r.created_at ?? '') || a.r.organization_id.localeCompare(b.r.organization_id));

    // Only a requested bar the caller truly belongs to, or their sole bar, is active. Never guessed.
    const chosen = d.requestedOrg
      ? selectActive(own.map((x) => x.r), user.id, d.requestedOrg)?.organization_id === d.requestedOrg ? d.requestedOrg : null
      : own.length === 1 ? own[0].r.organization_id : null;

    const state = resolveAccountState(accountRow);
    const staff = state.kind === 'active'
      ? { kind: 'active' as const, orgId: state.session.orgId, employeeId: state.session.employeeId }
      : { kind: state.kind };

    const body = {
      data: {
        user: { id: user.id, email: user.email },
        memberships: own.map(({ r, org }) => ({
          orgId: r.organization_id,
          orgName: org!.name,
          role: r.role as Role,
          destinations: visibleDestinations(r.role as Role),
        })),
        activeOrgId: chosen,
        staff,
      },
      meta: { asOf: d.now().toISOString() },
    };
    const parsed = MeResponseSchema.safeParse(body);
    if (!parsed.success) return withId(fail('internal', '', opts));
    return withId({ status: 200, body: parsed.data, headers: ok(null).headers });
  } catch {
    return withId(fail('internal', '', opts));
  }
}
