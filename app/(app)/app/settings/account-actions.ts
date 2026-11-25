'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentOrg, CURRENT_ORG_COOKIE } from '@/lib/org';
import { createClient } from '@/lib/supabase/server';
import { isDemoOrg } from '@/lib/billing/store';
import { confirmationMatches, DeletionRefused } from '@/lib/account/deletion-plan';
import { deleteOrg, deletionEnabled } from '@/lib/account/delete-org';

export type CloseBarState = { error?: string };

/** Owner only, typed bar name, switched on by ACCOUNT_DELETION_OPEN. Never touches Stripe. */
export async function closeBar(_prev: CloseBarState, formData: FormData): Promise<CloseBarState> {
  const { org, role } = await getCurrentOrg();
  if (role !== 'owner') return { error: 'Only the owner can close this bar.' };
  if (isDemoOrg(org.slug)) return { error: 'Sample bars are removed automatically after 24 hours.' };
  if (!deletionEnabled()) return { error: 'Closing a bar is not switched on yet. Email us and we will do it for you.' };
  if (!confirmationMatches(String(formData.get('confirm') ?? ''), org.name)) {
    return { error: 'The name you typed does not match. Nothing was deleted.' };
  }
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) redirect('/login');

  try {
    await deleteOrg({ orgId: org.id, role, userId: user.id });
  } catch (e) {
    if (e instanceof DeletionRefused) return { error: e.message };
    console.error('[account] close failed', org.id, e);
    return { error: 'Something went wrong part way. Your sign-in still works, so try again. Nothing is lost by retrying.' };
  }
  (await cookies()).delete(CURRENT_ORG_COOKIE);
  redirect('/app');
}
