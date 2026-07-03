'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { getCurrentOrg } from '@/lib/org';
import type { Role } from '@/lib/permissions';

export type TeamMember = {
  user_id:   string;
  email:     string;
  role:      Role;
  joined_at: string | null;
  is_self:   boolean;
};

const VALID_ROLES: Role[] = ['owner', 'manager', 'accountant'];

type Admin = ReturnType<typeof createAdminClient>;

function assertOwner(role: Role) {
  if (role !== 'owner') throw new Error('Only owners can manage team members');
}

/**
 * Find an existing auth user by email. Supabase's admin API has no
 * get-user-by-email, so we page through listUsers. Fine at bar scale (a handful
 * of members); revisit with a profiles table if the total user count grows large.
 */
async function findUserIdByEmail(admin: Admin, email: string): Promise<string | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const match = data.users.find((u) => (u.email ?? '').toLowerCase() === target);
    if (match) return match.id;
    if (data.users.length < 200) break; // last page
  }
  return null;
}

/** Throws if removing/demoting this user would leave the org with no owner. */
async function assertNotLastOwner(admin: Admin, orgId: string, userId: string) {
  const { data: owners } = await admin
    .from('memberships')
    .select('user_id')
    .eq('organization_id', orgId)
    .eq('role', 'owner');

  const ownerIds = (owners ?? []).map((o) => o.user_id);
  if (ownerIds.length <= 1 && ownerIds.includes(userId)) {
    throw new Error('You can’t remove or demote the last owner — promote someone else first');
  }
}

/** All members of the current org, with emails resolved from auth. */
export async function listTeamMembers(): Promise<{ members: TeamMember[]; canManage: boolean }> {
  const { org, role } = await getCurrentOrg();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const admin = createAdminClient();
  const { data: rows, error } = await admin
    .from('memberships')
    .select('user_id, role, created_at')
    .eq('organization_id', org.id)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message);

  const members = await Promise.all(
    (rows ?? []).map(async (row): Promise<TeamMember> => {
      const { data: u } = await admin.auth.admin.getUserById(row.user_id);
      return {
        user_id:   row.user_id,
        email:     u?.user?.email ?? '(unknown)',
        role:      row.role as Role,
        joined_at: row.created_at ?? null,
        is_self:   row.user_id === user?.id,
      };
    }),
  );

  return { members, canManage: role === 'owner' };
}

/**
 * Add a teammate to the current org. If they already have a login, they're just
 * granted access (the temp password is ignored); otherwise a confirmed account
 * is created with the provided temp password so they can sign in immediately.
 */
export async function addTeamMember(input: {
  email: string;
  password: string;
  role: Role;
}): Promise<{ status: 'created' | 'added_existing'; email: string }> {
  const { org, role } = await getCurrentOrg();
  assertOwner(role);

  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('Enter a valid email address');
  if (!VALID_ROLES.includes(input.role)) throw new Error('Invalid role');

  const admin = createAdminClient();

  let userId = await findUserIdByEmail(admin, email);
  let status: 'created' | 'added_existing';

  if (userId) {
    status = 'added_existing';
  } else {
    if (!input.password || input.password.length < 8) {
      throw new Error('Temporary password must be at least 8 characters');
    }
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password: input.password,
      email_confirm: true, // no confirmation email — they can log in right away
    });
    if (error || !data.user) throw new Error(error?.message ?? 'Could not create the account');
    userId = data.user.id;
    status = 'created';
  }

  const { data: existing } = await admin
    .from('memberships')
    .select('user_id')
    .eq('organization_id', org.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (existing) throw new Error('That person is already a member of this bar');

  const { error: memberErr } = await admin
    .from('memberships')
    .insert({ user_id: userId, organization_id: org.id, role: input.role });
  if (memberErr) throw new Error(memberErr.message);

  revalidatePath('/app/settings');
  return { status, email };
}

export async function changeMemberRole(input: { userId: string; role: Role }): Promise<void> {
  const { org, role } = await getCurrentOrg();
  assertOwner(role);
  if (!VALID_ROLES.includes(input.role)) throw new Error('Invalid role');

  const admin = createAdminClient();
  if (input.role !== 'owner') await assertNotLastOwner(admin, org.id, input.userId);

  const { error } = await admin
    .from('memberships')
    .update({ role: input.role })
    .eq('organization_id', org.id)
    .eq('user_id', input.userId);
  if (error) throw new Error(error.message);

  revalidatePath('/app/settings');
}

export async function removeTeamMember(input: { userId: string }): Promise<void> {
  const { org, role } = await getCurrentOrg();
  assertOwner(role);

  const admin = createAdminClient();
  await assertNotLastOwner(admin, org.id, input.userId);

  // Remove only the membership — never the auth user, who may belong to other bars.
  const { error } = await admin
    .from('memberships')
    .delete()
    .eq('organization_id', org.id)
    .eq('user_id', input.userId);
  if (error) throw new Error(error.message);

  revalidatePath('/app/settings');
}
