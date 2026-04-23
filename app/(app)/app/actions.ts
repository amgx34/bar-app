'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { CURRENT_ORG_COOKIE } from '@/lib/org';

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
export async function switchOrg(orgId: string) {
  // Verify the user is actually a member of the target org (RLS does this too,
  // but we want to fail loudly at this layer with a clear error).
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('memberships')
    .select('organization_id')
    .eq('organization_id', orgId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Not a member of that organization');

  const cookieStore = await cookies();
  cookieStore.set(CURRENT_ORG_COOKIE, orgId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  revalidatePath('/app', 'layout');
}