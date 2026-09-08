'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOrg, getAuthUser } from '@/lib/org';
import { canManagePayroll } from '@/lib/permissions';

/**
 * Letting staff in, and putting them back out.
 *
 * The manager IS the verification step — the join code only gets somebody into
 * this queue, and nothing they typed has been checked against anything. Every
 * action here is gated on canManagePayroll, the same people who already correct
 * hours and move tips.
 */

export type PendingClaim = {
  id:           string;
  claimedName:  string;
  employeeId:   string | null;
  employeeName: string | null;
  requestedAt:  string;
};

export async function listPendingClaims(): Promise<PendingClaim[]> {
  const { org, role } = await getCurrentOrg();
  // Not an error — a screen this role cannot act on simply has no queue on it.
  if (!canManagePayroll(role)) return [];

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('employee_accounts')
    .select('id, claimed_name, employee_id, requested_at, employees(name)')
    .eq('organization_id', org.id)
    .eq('status', 'pending')
    .order('requested_at', { ascending: false });

  return (data ?? []).map((r) => {
    const emp = Array.isArray(r.employees) ? r.employees[0] : r.employees;
    return {
      id:           r.id as string,
      claimedName:  r.claimed_name as string,
      employeeId:   (r.employee_id as string | null) ?? null,
      employeeName: (emp as { name?: string } | null)?.name ?? null,
      requestedAt:  r.requested_at as string,
    };
  });
}

/**
 * Approves a claim, naming the employee it belongs to.
 *
 * `employeeId` is passed explicitly rather than read off the row, because an
 * ambiguous claim (two Dave Ramoses) has none stored and the manager is the one
 * resolving it. The employee is re-checked against this org before the write:
 * an id arriving from a form is untrusted input, and approving one from another
 * bar would build a session pointing across the tenancy boundary.
 */
export async function approveClaim(claimId: string, employeeId: string): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!canManagePayroll(role)) throw new Error('Not permitted');
  const user = await getAuthUser();

  const supabase = createAdminClient();

  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('organization_id', org.id)
    .eq('id', employeeId)
    .maybeSingle();

  if (!employee) throw new Error('That employee is not on this bar’s roster');

  await supabase
    .from('employee_accounts')
    .update({
      employee_id: employeeId,
      status:      'active',
      decided_by:  user?.id ?? null,
      decided_at:  new Date().toISOString(),
    })
    .eq('organization_id', org.id)
    .eq('id', claimId)
    // Only a pending claim can be approved. Without this, a revoked account
    // could be silently reactivated by replaying an old form submission.
    .eq('status', 'pending');

  revalidatePath('/app/payroll/employees');
}

/**
 * Declines a claim, or revokes an account that was already active.
 *
 * Recorded as 'revoked' rather than deleted, so the person cannot simply sign
 * up again into the same queue — the unique index on (user_id, organization_id)
 * still holds. A manager who declines an impostor should not watch them
 * reappear.
 */
export async function rejectClaim(claimId: string): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!canManagePayroll(role)) throw new Error('Not permitted');
  const user = await getAuthUser();

  const supabase = createAdminClient();
  await supabase
    .from('employee_accounts')
    .update({
      status:     'revoked',
      decided_by: user?.id ?? null,
      decided_at: new Date().toISOString(),
    })
    .eq('organization_id', org.id)
    .eq('id', claimId);

  revalidatePath('/app/payroll/employees');
}

/** Same write as a rejection; a separate name because the intent differs. */
export async function revokeAccount(claimId: string): Promise<void> {
  return rejectClaim(claimId);
}
