import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export const CURRENT_ORG_COOKIE = 'current_org_id';

export type OrgMembership = {
  organization_id: string;
  role: 'owner' | 'manager' | 'accountant';
  organizations: {
    id: string;
    name: string;
    slug: string;
  };
};

export type CurrentOrgResult = {
  org: OrgMembership['organizations'];
  role: OrgMembership['role'];
  allMemberships: OrgMembership[];
};

/**
 * Returns the current user's active org + their role + all their memberships.
 * If the user has no memberships, redirects to /app/no-access.
 * If the cookie points at an org the user isn't a member of, falls back to
 * their first membership and updates the cookie next render.
 */
export async function getCurrentOrg(): Promise<CurrentOrgResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Pull all memberships (RLS already restricts this to the caller's own rows)
  const { data: memberships, error } = await supabase
    .from('memberships')
    .select('organization_id, role, organizations(id, name, slug)')
    .order('created_at', { ascending: true })
    .returns<OrgMembership[]>();

  if (error) throw error;
  if (!memberships || memberships.length === 0) {
    redirect('/app/no-access');
  }

  // Figure out which org is active
  const cookieStore = await cookies();
  const cookieOrgId = cookieStore.get(CURRENT_ORG_COOKIE)?.value;

  const active =
    memberships.find((m) => m.organization_id === cookieOrgId) ??
    memberships[0];

  return {
    org: active.organizations,
    role: active.role,
    allMemberships: memberships,
  };
}