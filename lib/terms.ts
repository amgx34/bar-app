import 'server-only';

import { headers } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { clientIp } from '@/lib/rate-limit';
import { TERMS_VERSION } from '@/lib/legal';

/**
 * Terms acceptance.
 *
 * Deliberately NOT scoped to an organisation. A person agrees to the terms
 * once, as a person; the org they happened to be acting for is recorded as
 * context but is not part of the key. Scoping by org would re-prompt anyone who
 * belongs to two bars, for an agreement they have already made.
 */

/** True when this user has accepted the version currently published. */
export async function hasAcceptedCurrentTerms(userId: string): Promise<boolean> {
  const supabase = createAdminClient();

  // admin-scope-ok: terms_acceptances is keyed by user, not by organisation —
  // there is no organization_id to filter on, and the user id is the scope.
  const { data, error } = await supabase
    .from('terms_acceptances')
    .select('id')
    .eq('user_id', userId)
    .eq('terms_version', TERMS_VERSION)
    .maybeSingle();

  if (error) {
    // Fail OPEN, matching lib/rate-limit.ts. A transient database error must not
    // lock every user out of the app behind a consent wall they cannot clear —
    // the gate is a compliance record, not an authorisation check.
    console.error('[terms] acceptance lookup failed:', error.message);
    return true;
  }

  return Boolean(data);
}

/**
 * Records an acceptance of the current version.
 *
 * Idempotent: re-accepting the same version keeps the ORIGINAL timestamp rather
 * than refreshing it, because the date that matters is the day they first
 * agreed. `ignoreDuplicates` is what preserves it.
 */
export async function recordTermsAcceptance(
  organizationId?: string | null,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  await recordTermsAcceptanceForUser(user.id, organizationId);
}

/**
 * Records an acceptance for a user id directly.
 *
 * Exists for the demo route, which creates a user with the admin API and has no
 * session to read at the point the org is made. Everywhere a session exists,
 * call `recordTermsAcceptance` instead — passing a user id that did not come
 * from an authenticated session is exactly how a consent record stops being
 * worth anything.
 */
export async function recordTermsAcceptanceForUser(
  userId: string,
  organizationId?: string | null,
): Promise<void> {
  const headerList = await headers();
  const admin = createAdminClient();

  // admin-scope-ok: terms_acceptances is keyed by user id, not by organisation.
  // organization_id is stored as context only.
  const { error } = await admin.from('terms_acceptances').upsert(
    {
      user_id: userId,
      terms_version: TERMS_VERSION,
      organization_id: organizationId ?? null,
      // Taken from the request server-side; never accepted from the client,
      // which is the point of storing it as evidence at all.
      ip_address: clientIp(headerList),
      user_agent: headerList.get('user-agent')?.slice(0, 500) ?? null,
    },
    { onConflict: 'user_id,terms_version', ignoreDuplicates: true },
  );

  if (error) throw new Error(`Could not record your acceptance: ${error.message}`);
}
