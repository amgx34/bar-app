'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser, getCurrentOrg } from '@/lib/org';
import { canManagePayroll } from '@/lib/permissions';
import { PAYOUT_METHODS, type Payout, type PayoutMethod } from '@/lib/payroll/payouts';

/**
 * Marking who has actually been paid for a period.
 *
 * Unpaid is the absence of a row, so there are only two writes: insert one, or
 * delete it. See the migration for why there is no status column.
 *
 * Both writes check the caller may manage payroll and that the employee belongs
 * to the caller's bar — `employee_id` arrives from the client, and without that
 * check a crafted id would attach a payout to another bar's staff.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const markSchema = z.object({
  employeeId:  z.string().uuid(),
  periodStart: isoDate,
  periodEnd:   isoDate,
  method:      z.enum(PAYOUT_METHODS as unknown as [PayoutMethod, ...PayoutMethod[]]),
  // What the run said this person was owed at the moment of marking. Negative
  // is impossible; the ceiling is a typo guard, not a policy.
  amountPaid:  z.number().min(0).max(1_000_000),
});

const unmarkSchema = z.object({
  employeeId:  z.string().uuid(),
  periodStart: isoDate,
  periodEnd:   isoDate,
});

export type PayoutResult = { ok: boolean; error?: string };

/** Every payout recorded for the period on screen, keyed by employee. */
export async function loadPayouts(
  periodStart: string,
  periodEnd: string,
): Promise<Payout[]> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('payroll_payouts')
    .select('employee_id, method, amount_paid, paid_at')
    .eq('organization_id', org.id)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd);

  return (data ?? []).map((row) => ({
    employeeId: row.employee_id as string,
    method:     row.method as PayoutMethod,
    // NUMERIC comes back as a string on some driver versions; the UI formats it.
    amountPaid: Number(row.amount_paid ?? 0),
    paidAt:     row.paid_at as string,
  }));
}

/** Confirms the employee is at the caller's bar before anything is written. */
async function assertEmployeeInOrg(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  employeeId: string,
): Promise<boolean> {
  const { data } = await supabase
    .from('employees')
    .select('id')
    .eq('id', employeeId)
    .eq('organization_id', orgId)
    .maybeSingle();
  return Boolean(data);
}

export async function markPaid(input: {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  method: PayoutMethod;
  amountPaid: number;
}): Promise<PayoutResult> {
  const parsed = markSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid payout' };
  }

  const { org, role } = await getCurrentOrg();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  if (!canManagePayroll(role)) {
    return { ok: false, error: 'Only owners and managers can mark payouts' };
  }

  const supabase = createAdminClient();
  const { employeeId, periodStart, periodEnd, method, amountPaid } = parsed.data;

  if (!(await assertEmployeeInOrg(supabase, org.id, employeeId))) {
    return { ok: false, error: 'Employee not found' };
  }

  // Upsert on the unique index rather than insert: a double-tap on a slow phone
  // must not surface as a duplicate-key error to somebody who did nothing wrong.
  const { error } = await supabase
    .from('payroll_payouts')
    .upsert(
      {
        organization_id: org.id,
        employee_id:     employeeId,
        period_start:    periodStart,
        period_end:      periodEnd,
        method,
        amount_paid:     amountPaid,
        paid_at:         new Date().toISOString(),
        marked_by:       user.id,
      },
      { onConflict: 'organization_id,employee_id,period_start,period_end' },
    );

  if (error) return { ok: false, error: error.message };

  revalidatePath('/app/payroll');
  return { ok: true };
}

/** Undo. Deletes the row, which is what "not paid yet" is. */
export async function unmarkPaid(input: {
  employeeId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<PayoutResult> {
  const parsed = unmarkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid payout' };
  }

  const { org, role } = await getCurrentOrg();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  if (!canManagePayroll(role)) {
    return { ok: false, error: 'Only owners and managers can mark payouts' };
  }

  const supabase = createAdminClient();
  const { employeeId, periodStart, periodEnd } = parsed.data;

  const { error } = await supabase
    .from('payroll_payouts')
    .delete()
    .eq('organization_id', org.id)
    .eq('employee_id', employeeId)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/app/payroll');
  return { ok: true };
}
