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

const revertSchema = z.object({
  employeeId: z.string().uuid(),
  shiftDate: isoDate,
  reason,
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
 *
 * Creates the shift when none exists. It used to throw "No shift recorded for
 * that employee on that date", which meant it could only ever edit rows the POS
 * had already produced — so somebody who never clocked in could not be paid at
 * all, and the failure looked like a bug rather than a missing row.
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

  // Absent is a legitimate starting point, not an error: somebody who forgot to
  // clock in has no row at all, and that is exactly when a correction is needed.
  const before = shift
    ? (Number(shift.regular_hours) || 0) + (Number(shift.overtime_hours) || 0)
    : 0;
  const after = input.regularHours + input.overtimeHours;

  // Upsert on the table's own uniqueness (organization_id, employee_id,
  // shift_date), so this both edits an existing shift and creates a missing one
  // without a read-then-branch that could race the agent's next sync.
  const { error: writeErr } = await supabase
    .from('employee_shifts')
    .upsert(
      {
        organization_id: org.id,
        employee_id: input.employeeId,
        shift_date: input.shiftDate,
        regular_hours: input.regularHours,
        overtime_hours: input.overtimeHours,
        // Claims the row for the operator. Without this the agent's next sync
        // — at most five minutes away — silently reverted the correction while
        // leaving the adjustment log below in place, so the figures and their
        // own explanation disagreed.
        hours_source: 'manual',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id,employee_id,shift_date' },
    );

  if (writeErr) throw new Error(`Could not save those hours: ${writeErr.message}`);

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

const removeSchema = z.object({
  employeeId: z.string().uuid(),
  shiftDate: isoDate,
  reason,
});

/**
 * Takes someone off a night without deleting the record of it.
 *
 * Hours go to zero and the row stays. A hard delete would look tidier and be
 * wrong twice over: the agent re-sends a two-day window every five minutes, so
 * the POS would simply recreate the row and undo the correction; and the fact
 * that a shift was recorded and then removed is exactly what somebody disputing
 * their pay needs to see.
 *
 * Zeroed rather than flagged because every consumer of employee_shifts already
 * sums hours — one that forgot to check an `excluded` column would quietly pay
 * the bad shift anyway.
 */
export async function removeFromShift(raw: unknown): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!canManagePayroll(role)) throw new Error('Not authorized');

  const input = removeSchema.parse(raw);
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

  if (!shift) throw new Error('That employee has no shift on that date');

  const before = (Number(shift.regular_hours) || 0) + (Number(shift.overtime_hours) || 0);
  if (before === 0) throw new Error('That shift is already zeroed');

  // admin-scope-ok: `shift` was fetched above with .eq('organization_id', org.id)
  // and the function throws when it is missing, so this id is always in-org.
  const { error: writeErr } = await supabase
    .from('employee_shifts')
    // hours_source too: zeroing a shift is exactly the case where the POS still
    // believes the person worked, so it is the most likely of all to be undone.
    .update({
      regular_hours: 0,
      overtime_hours: 0,
      hours_source: 'manual',
      updated_at: new Date().toISOString(),
    })
    .eq('id', shift.id);

  if (writeErr) throw new Error(`Could not remove that shift: ${writeErr.message}`);

  const { error: logErr } = await supabase.from('payroll_adjustments').insert({
    organization_id: org.id,
    shift_date: input.shiftDate,
    kind: 'hours',
    employee_id: input.employeeId,
    hours_before: before,
    hours_after: 0,
    reason: input.reason,
    created_by: user?.id ?? null,
  });

  if (logErr) throw new Error(`Shift was zeroed but the audit record failed: ${logErr.message}`);

  revalidatePath('/app/payroll');
}

export type RosterEntry = {
  employeeId: string;
  name: string;
  role: string | null;
  hours: number;
  /** True when a shift row exists for the date, even at zero hours. */
  onShift: boolean;
};

/**
 * Everyone on the team, with whatever they are recorded for on one date.
 *
 * Returns the whole team rather than only those already on the night, because
 * the case this exists for is somebody who never clocked in — they are, by
 * definition, not in the shift list yet.
 */
export async function getShiftRoster(shiftDate: string): Promise<RosterEntry[]> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();

  const [{ data: employees }, { data: shifts }] = await Promise.all([
    supabase
      .from('employees')
      .select('id, name, role')
      .eq('organization_id', org.id)
      .order('name'),
    supabase
      .from('employee_shifts')
      .select('employee_id, regular_hours, overtime_hours')
      .eq('organization_id', org.id)
      .eq('shift_date', shiftDate),
  ]);

  const byEmployee = new Map(
    (shifts ?? []).map((s) => [
      s.employee_id as string,
      (Number(s.regular_hours) || 0) + (Number(s.overtime_hours) || 0),
    ]),
  );

  return (employees ?? []).map((e) => ({
    employeeId: e.id,
    name: e.name,
    role: e.role,
    hours: byEmployee.get(e.id) ?? 0,
    onShift: byEmployee.has(e.id),
  }));
}

/**
 * Hands a shift back to the POS.
 *
 * Correcting hours marks the row `hours_source = 'manual'`, which stops the
 * 2Touch agent overwriting it. That lock is deliberate but permanent, and it is
 * wrong once the POS itself has been fixed: the operator would be stuck with a
 * figure they no longer want, and re-syncing would appear to do nothing.
 *
 * Logged like any other adjustment. Releasing the lock is a decision about what
 * somebody gets paid — the next sync may move the figure — so it belongs in the
 * same audit trail as the correction that created it, not in a silent toggle.
 *
 * Idempotent: reverting a row the POS already owns changes nothing and is not an
 * error. The caller cannot see `hours_source` from the payroll table, so asking
 * is a reasonable thing to do.
 */
export async function revertShiftToPos(raw: unknown): Promise<{ wasLocked: boolean }> {
  const { org, role } = await getCurrentOrg();
  if (!canManagePayroll(role)) throw new Error('Not authorized');

  const input = revertSchema.parse(raw);
  const user = await getAuthUser();
  const supabase = createAdminClient();

  await assertEmployeesInOrg(supabase, org.id, [input.employeeId]);

  const { data: shift } = await supabase
    .from('employee_shifts')
    .select('id, regular_hours, overtime_hours, hours_source')
    .eq('organization_id', org.id)
    .eq('employee_id', input.employeeId)
    .eq('shift_date', input.shiftDate)
    .maybeSingle();

  if (!shift) throw new Error('No shift recorded for that employee on that date');
  if (shift.hours_source !== 'manual') return { wasLocked: false };

  const current =
    (Number(shift.regular_hours) || 0) + (Number(shift.overtime_hours) || 0);

  // The log entry is written BEFORE the unlock, and records the figure as both
  // before and after, because reverting does not itself change the hours — it
  // changes who is allowed to. The next sync is what may move them, and this row
  // is what explains why they moved on their own.
  const { error: logErr } = await supabase.from('payroll_adjustments').insert({
    organization_id: org.id,
    shift_date: input.shiftDate,
    kind: 'hours',
    employee_id: input.employeeId,
    hours_before: current,
    hours_after: current,
    reason: `Released to POS sync: ${input.reason}`,
    created_by: user?.id ?? null,
  });

  if (logErr) throw new Error(`Could not record that change: ${logErr.message}`);

  const { error } = await supabase
    .from('employee_shifts')
    .update({ hours_source: 'pos', updated_at: new Date().toISOString() })
    .eq('organization_id', org.id)
    .eq('employee_id', input.employeeId)
    .eq('shift_date', input.shiftDate);

  if (error) throw new Error(`Could not release that shift: ${error.message}`);

  revalidatePath('/app/payroll');
  return { wasLocked: true };
}
