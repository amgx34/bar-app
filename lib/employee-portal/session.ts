import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/org';
import {
  resolveAccountState,
  type AccountRow, type AccountState, type EmployeeSession,
} from './session-state';

/**
 * Fetching the logged-in employee's account.
 *
 * The decision about what that account entitles them to is in ./session-state,
 * pure and tested. This file is only the I/O around it — `server-only` because
 * it holds the service-role client, which is exactly the import that must never
 * end up in a client bundle.
 *
 * Deliberately NOT getCurrentOrg(): that resolves a MEMBERSHIP, and an employee
 * must never have one. ensure_full_schema.sql grants org members FOR ALL on
 * employee_shifts and direct_deposit_accounts, so a membership row for a
 * bartender is read and write access to every colleague's hours and bank
 * details. See supabase/migrations/20260908000000_add_employee_accounts.sql.
 */

export type { EmployeeSession, AccountState };

/** Memoized per request, matching getCurrentOrg — layout and page both call it. */
export const getEmployeeAccountState = cache(async (): Promise<AccountState> => {
  const user = await getAuthUser();
  // No redirect here: getCurrentOrg calls this to decide where to send a user
  // with no membership, and a redirect thrown from inside that decision would
  // pre-empt it. Redirecting is getCurrentEmployee's job.
  if (!user) return { kind: 'none' };

  const supabase = createAdminClient();

  // admin-scope-ok: keyed on the authenticated user's own id, which is the
  // narrowest possible scope. This query exists to DISCOVER which org the
  // employee belongs to, so it cannot itself be filtered by one.
  const { data } = await supabase
    .from('employee_accounts')
    .select('organization_id, employee_id, status, employees(name)')
    .eq('user_id', user.id)
    .maybeSingle();

  return resolveAccountState(data as AccountRow | null);
});

/** The session, or a redirect. Use this in every portal page and action. */
export async function getCurrentEmployee(): Promise<EmployeeSession> {
  const state = await getEmployeeAccountState();
  if (state.kind === 'active') return state.session;
  if (state.kind === 'pending') redirect('/me/pending');
  redirect('/login');
}
