'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, clientIp, RATE_LIMITS } from '@/lib/rate-limit';
import { matchEmployeeName } from '@/lib/employee-portal/claim';
import { dispatch } from '@/lib/notifications/deliver';

/**
 * Staff sign-up.
 *
 * ONE RESPONSE FOR EVERY OUTCOME. A matched name, an unmatched name and an
 * ambiguous one all return the same sentence. The form asks the person to type
 * their own name rather than listing the roster, and a response that differed
 * on a hit would make this endpoint a name oracle for anybody holding the join
 * code — undoing exactly what not listing the roster bought.
 *
 * The join code is not a credential. It gets a claim into a queue that a
 * manager must approve, and nothing else. Nothing this function writes can be
 * read by the person who signed up until that approval happens.
 */

const SENT = 'Thanks — your request has been sent to your manager for approval.';
const BAD_CODE = 'That code was not recognised.';

export async function claimEmployeeAccount(
  email: string,
  password: string,
  joinCode: string,
  typedName: string,
): Promise<{ ok: boolean; message: string }> {
  const ip = clientIp(await headers());
  const limit = await checkRateLimit(RATE_LIMITS.login, `claim:${ip}`);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many attempts. Please try again later.' };
  }

  const admin = createAdminClient();

  // admin-scope-ok: this resolves WHICH org a join code belongs to, so it is
  // the one query here that cannot be filtered by organization_id. The code is
  // matched exactly and a miss returns before anything else happens.
  const { data: org } = await admin
    .from('organizations')
    .select('id')
    .eq('staff_join_code', joinCode.trim())
    .maybeSingle();

  // A NULL staff_join_code means staff sign-up is off for that bar, and NULL
  // never matches an equality test, so a disabled bar falls out here with the
  // same message as a wrong code.
  if (!org) return { ok: false, message: BAD_CODE };

  const { data: roster } = await admin
    .from('employees')
    .select('id, name')
    .eq('organization_id', org.id);

  const match = matchEmployeeName(typedName, (roster ?? []).map(
    (e) => ({ id: e.id as string, name: e.name as string }),
  ));

  // The auth user is created regardless of whether the name matched, so the
  // response cannot be told apart by timing or by side effect. An account with
  // no approved claim can reach nothing — see lib/employee-portal/session.ts.
  const supabase = await createClient();
  const { data: signUp, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error || !signUp.user) {
    // Logged server-side, never returned: Supabase's text is exactly where
    // account enumeration leaks ("user already registered").
    console.warn('[portal] staff sign-up failed:', error?.message);
    return { ok: true, message: SENT };
  }

  // A miss records nothing at all — see the comment at the top of this file.
  if (match.kind !== 'none') {
    await admin.from('employee_accounts').upsert(
      {
        organization_id: org.id,
        // Null for an ambiguous name. The CHECK constraint stops an unresolved
        // claim ever becoming a login; a manager picks which person it is.
        employee_id:     match.kind === 'one' ? match.employeeId : null,
        user_id:         signUp.user.id,
        status:          'pending',
        claimed_name:    typedName.trim(),
      },
      { onConflict: 'user_id,organization_id', ignoreDuplicates: true },
    );

    await dispatch(org.id, {
      eventType: 'staff.claim_pending',
      title:     'Someone wants a staff login',
      body:      `${typedName.trim()} signed up with the bar's join code and is waiting to be approved.`,
      link:      '/app/employees',
      payload:   { claimedName: typedName.trim() },
      // Keyed on the user, not the date: one person asking once is one alert,
      // and a repeated sign-up is the same ask rather than a new one.
      dedupeKey: `staff.claim_pending:${signUp.user.id}`,
    });
  }

  return { ok: true, message: SENT };
}
