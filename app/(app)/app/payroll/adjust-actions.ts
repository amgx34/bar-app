'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser, getCurrentOrg } from '@/lib/org';
import { canManagePayroll } from '@/lib/permissions';

/**
 * Manual corrections to a pay run.
 *
 * Every write here changes what a person is paid, so all three actions:
 *   - check the caller may manage payroll,
 *   - verify the employees belong to the caller's bar,
 *   - and leave a row in payroll_adjustments naming the author and the reason.
 *
 * A reason is required, not optional. The value of this log is entirely in
 * being able to answer "why is my cheque different" three weeks later, and an
 * unexplained adjustment cannot answer it.
 */

const reason = z.string().trim().min(3, 'Give a short reason').max(300);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const hoursSchema = z.object({
  employeeId: z.string().uuid(),
  shiftDate: isoDate,
  // A double shift is the ceiling. Anything above it is a typo, and a typo here
  // is a pay error.
  regularHours: z.number().min(0).max(24),
  overtimeHours: z.number().min(0).max(24),
  reason,
});

const transferSchema = z.object({
  fromEmployeeId: z.string().uuid(),
  toEmployeeId: z.string().uuid(),
  shiftDate: isoDate,
  amount: z.number().positive('Enter an amount greater than zero').max(100000),
  reason,
});

const openerSchema = z.object({
  employeeId: z.string().uuid(),
  shiftDate: isoDate,
});

/** Throws unless every id belongs to the caller's organisation. */
async function assertEmployeesInOrg(
  supabase: ReturnType<typeof createAdminClient>,
  orgId: string,
  ids: string[],
): Promise<void> {
  const unique = [...new Set(ids)];
  const { data } = await supabase
    .from('employees')
    .select('id')
    .eq('organization_id', orgId)
    .in('id', unique);

  if ((data ?? []).length !== unique.length) {
    throw new Error('That employee is not on your team');
  }
}

/**
 * Corrects the hours recorded against one employee for one date.
 *
 * The shift row is updated in place and the previous figure is copied into the
 * log first, so the original stays recoverable. Repeated corrections each get
 * their own row rather than overwriting the last.
 */
export async function adjustShiftHours(raw: unknown): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!canManagePayroll(role)) throw new Error('Not authorized');

  const input = hoursSchema.parse(raw);
  const user = await getAuthUser();
  const supabase = createAdminClient();

  await assertEmployeesInOrg(supabase, org.id, [input.employeeId]);

  const { data: shift } = await supabase
    .from('employee_shifts')
    .select('id, regular_hours, overtime_hours')
    .eq('organization_id', org.id)
    .eq('employee_id', input.employeeId)
    .eq('shift_date', input.shiftDate)
    .maybeSingle();

  if (!shift) throw new Error('No shift recorded for that employee on that date');

  const before = (Number(shift.regular_hours) || 0) + (Number(shift.overtime_hours) || 0);
  const after = input.regularHours + input.overtimeHours;

  // admin-scope-ok: `shift` was fetched above with .eq('organization_id', org.id)
  // and the function throws when it is missing, so this id is always in-org.
  const { error: updateErr } = await supabase
    .from('employee_shifts')
    .update({
      regular_hours: input.regularHours,
      overtime_hours: input.overtimeHours,
      updated_at: new Date().toISOString(),
    })
    .eq('id', shift.id);

  if (updateErr) throw new Error(`Could not update those hours: ${updateErr.message}`);

  const { error: logErr } = await supabase.from('payroll_adjustments').insert({
    organization_id: org.id,
    shift_date: input.shiftDate,
    kind: 'hours',
    employee_id: input.employeeId,
    hours_before: before,
    hours_after: after,
    reason: input.reason,
    created_by: user?.id ?? null,
  });

  // Loud, not best-effort: an hours change with no audit row is the state this
  // whole table exists to prevent, and the operator must know it did not record.
  if (logErr) throw new Error(`Hours were changed but the audit record failed: ${logErr.message}`);

  revalidatePath('/app/payroll');
}

/**
 * Moves tips from one employee to another for a given night.
 *
 * Recorded rather than applied destructively: the split is recomputed from the
 * Z report on every page load, so a transfer has to be a durable fact layered
 * on top of it. See applyTipTransfers in lib/payroll/adjustments.ts — the total
 * is conserved, so the night still reconciles against the takings.
 */
export async function transferTips(raw: unknown): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!canManagePayroll(role)) throw new Error('Not authorized');

  const input = transferSchema.parse(raw);
  if (input.fromEmployeeId === input.toEmployeeId) {
    throw new Error('Choose two different people');
  }

  const user = await getAuthUser();
  const supabase = createAdminClient();

  await assertEmployeesInOrg(supabase, org.id, [input.fromEmployeeId, input.toEmployeeId]);

  const { error } = await supabase.from('payroll_adjustments').insert({
    organization_id: org.id,
    shift_date: input.shiftDate,
    kind: 'tip_transfer',
    employee_id: input.fromEmployeeId,
    counterparty_employee_id: input.toEmployeeId,
    amount: Math.round(input.amount * 100) / 100,
    reason: input.reason,
    created_by: user?.id ?? null,
  });

  if (error) throw new Error(`Could not record that transfer: ${error.message}`);

  revalidatePath('/app/payroll');
  revalidatePath('/app/tips');
}

/**
 * Marks who opened on a given night.
 *
 * Exactly one opener per night: the bonus is a single share, and two openers
 * would pay it twice out of a pool that only funded it once. Clearing the flag
 * across the date first is what enforces that.
 */
export async function setOpener(raw: unknown): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!canManagePayroll(role)) throw new Error('Not authorized');

  const input = openerSchema.parse(raw);
  const supabase = createAdminClient();

  await assertEmployeesInOrg(supabase, org.id, [input.employeeId]);

  const { error: clearErr } = await supabase
    .from('employee_shifts')
    .update({ is_opener: false })
    .eq('organization_id', org.id)
    .eq('shift_date', input.shiftDate);

  if (clearErr) throw new Error(`Could not update the opener: ${clearErr.message}`);

  const { error } = await supabase
    .from('employee_shifts')
    .update({ is_opener: true })
    .eq('organization_id', org.id)
    .eq('employee_id', input.employeeId)
    .eq('shift_date', input.shiftDate);

  if (error) throw new Error(`Could not set the opener: ${error.message}`);

  revalidatePath('/app/payroll');
}

export type AdjustmentRow = {
  id: string;
  shift_date: string;
  kind: 'hours' | 'tip_transfer';
  employee_name: string;
  counterparty_name: string | null;
  hours_before: number | null;
  hours_after: number | null;
  amount: number | null;
  reason: string;
  created_at: string;
};

/** The log for a period, newest first — what the operator reviews before paying. */
export async function listAdjustments(
  startDate: string,
  endDate: string,
): Promise<AdjustmentRow[]> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('payroll_adjustments')
    .select(
      'id, shift_date, kind, hours_before, hours_after, amount, reason, created_at, employee_id, counterparty_employee_id',
    )
    .eq('organization_id', org.id)
    .gte('shift_date', startDate)
    .lte('shift_date', endDate)
    .order('created_at', { ascending: false });

  const rows = data ?? [];
  if (rows.length === 0) return [];

  // One lookup for both sides of every row rather than an embedded join, which
  // cannot express two foreign keys to the same table cleanly.
  const ids = [
    ...new Set(rows.flatMap((r) => [r.employee_id, r.counterparty_employee_id].filter(Boolean))),
  ] as string[];

  const { data: employees } = await supabase
    .from('employees')
    .select('id, name')
    .eq('organization_id', org.id)
    .in('id', ids);

  const nameById = new Map((employees ?? []).map((e) => [e.id, e.name]));

  return rows.map((r) => ({
    id: r.id,
    shift_date: r.shift_date,
    kind: r.kind,
    employee_name: nameById.get(r.employee_id) ?? 'Unknown',
    counterparty_name: r.counterparty_employee_id
      ? (nameById.get(r.counterparty_employee_id) ?? 'Unknown')
      : null,
    hours_before: r.hours_before === null ? null : Number(r.hours_before),
    hours_after: r.hours_after === null ? null : Number(r.hours_after),
    amount: r.amount === null ? null : Number(r.amount),
    reason: r.reason,
    created_at: r.created_at,
  }));
}
