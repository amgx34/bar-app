'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOrg, getAuthUser } from '@/lib/org';
import { canSubmitPayroll, canApprovePayroll } from '@/lib/permissions';
import {
  diffPayrollRun,
  type RunDiff, type SnapshotEntry, type ShiftNight, type TipNight,
} from '@/lib/payroll/run-diff';
import { canSeeOpenRun, type OpenRun } from '@/lib/payroll/open-run';
import { dispatch } from '@/lib/notifications/deliver';
import { computePayroll, type PayrollEntry } from './actions';

/**
 * Pay-run approval.
 *
 * A run is a SNAPSHOT, not a status flag — see the migration for why. Everything
 * here treats `payroll_runs.snapshot` as the thing that was approved, and the
 * live recompute as a thing that must be reconciled against it before anyone
 * signs off.
 */

export type PayrollRunStatus = 'pending_approval' | 'approved' | 'changes_requested';

export type PayrollRun = {
  id:              string;
  period_start:    string;
  period_end:      string;
  status:          PayrollRunStatus;
  snapshot:        SnapshotEntry[];
  submitted_by:    string;
  submitted_at:    string;
  reviewed_by:     string | null;
  reviewed_at:     string | null;
  review_note:     string | null;
  override_reason: string | null;
};

/**
 * The four fields staleness is decided on.
 *
 * Used where a snapshot is only ever COMPARED. Freezing one for storage goes
 * through freezeRun below, which also carries the detail the employee portal
 * renders — see the SnapshotEntry comment in lib/payroll/run-diff.ts.
 */
function toSnapshot(entries: Array<{
  employeeId: string; employeeName: string; totalHours: number; totalCompensation: number;
}>): SnapshotEntry[] {
  return entries.map((e) => ({
    employeeId:        e.employeeId,
    employeeName:      e.employeeName,
    totalHours:        e.totalHours,
    totalCompensation: e.totalCompensation,
  }));
}

/**
 * Freezes a run for storage: the totals, the full breakdown, the nights behind
 * the hours, and the bar's tip pool on each of them.
 *
 * The employee portal renders this and never recomputes, so whatever is not
 * frozen here is not something an employee can ever be shown for that period.
 * Fetched rather than derived from `entries` because computePayroll returns
 * period totals — the per-night rows live on employee_shifts.
 *
 * Every write of `payroll_runs.snapshot` goes through this. A path that stored
 * `toSnapshot(...)` instead would silently approve a period whose stub has no
 * detail, and nothing would fail until an employee opened it weeks later.
 */
async function freezeRun(
  orgId: string,
  periodStart: string,
  periodEnd: string,
  entries: PayrollEntry[],
): Promise<SnapshotEntry[]> {
  const supabase = createAdminClient();

  const [{ data: shiftRows }, { data: tipDays }] = await Promise.all([
    supabase
      .from('employee_shifts')
      .select('employee_id, shift_date, regular_hours, overtime_hours, is_opener')
      .eq('organization_id', orgId)
      .gte('shift_date', periodStart)
      .lte('shift_date', periodEnd),
    supabase
      .from('z_report_days')
      .select('report_date, cash_tips, cc_tips')
      .eq('organization_id', orgId)
      .gte('report_date', periodStart)
      .lte('report_date', periodEnd),
  ]);

  const shiftsByEmployee = new Map<string, ShiftNight[]>();
  for (const r of shiftRows ?? []) {
    const list = shiftsByEmployee.get(r.employee_id as string) ?? [];
    list.push({
      date:     r.shift_date as string,
      hours:    (Number(r.regular_hours) || 0) + (Number(r.overtime_hours) || 0),
      isOpener: Boolean(r.is_opener),
    });
    shiftsByEmployee.set(r.employee_id as string, list);
  }
  for (const list of shiftsByEmployee.values()) {
    list.sort((a, b) => a.date.localeCompare(b.date));
  }

  // A NULL tip column is nothing here rather than a reason to drop the night —
  // the same reading as lib/pos/tip-rate.ts.
  const poolByDate = new Map<string, number>(
    (tipDays ?? []).map((d) => [
      d.report_date as string,
      (Number(d.cash_tips) || 0) + (Number(d.cc_tips) || 0),
    ]),
  );

  return entries.map((e) => {
    const shifts = shiftsByEmployee.get(e.employeeId) ?? [];
    return {
      employeeId:        e.employeeId,
      employeeName:      e.employeeName,
      totalHours:        e.totalHours,
      totalCompensation: e.totalCompensation,
      breakdown: {
        role:                e.role,
        regularHours:        e.regularHours,
        overtimeHours:       e.overtimeHours,
        hourlyRate:          e.hourlyRate,
        regularPay:          e.regularPay,
        overtimePay:         e.overtimePay,
        tipAmount:           e.tipAmount,
        tipsPerHour:         e.tipsPerHour,
        effectiveHourlyRate: e.effectiveHourlyRate,
        payType:             e.payType,
      },
      shifts,
      // Only the nights this person actually worked. The pool on a night they
      // were not in the building is not context, it is the bar's takings.
      tipContext: shifts
        .filter((s) => poolByDate.has(s.date))
        .map((s) => ({ date: s.date, poolTotal: poolByDate.get(s.date) as number } as TipNight)),
    };
  });
}

export async function getPayrollRun(
  periodStart: string,
  periodEnd: string,
): Promise<PayrollRun | null> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('payroll_runs')
    .select('*')
    .eq('organization_id', org.id)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    .maybeSingle();

  return (data as PayrollRun | null) ?? null;
}

/**
 * Freeze the period as it stands and ask an owner to sign off.
 *
 * Re-submitting after a send-back updates the same row: "the run for this
 * period" must have exactly one answer, and a stack of superseded rows would
 * make the NACHA gate ambiguous.
 */
export async function submitPayrollForApproval(
  periodStart: string,
  periodEnd: string,
): Promise<{ ok: boolean; error?: string }> {
  const { org, role } = await getCurrentOrg();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  if (!canSubmitPayroll(role)) {
    return { ok: false, error: 'Only owners and managers can submit payroll' };
  }

  const existing = await getPayrollRun(periodStart, periodEnd);
  if (existing?.status === 'approved') {
    return { ok: false, error: 'This period has already been approved' };
  }

  const entries = await computePayroll(periodStart, periodEnd);
  if (entries.length === 0) {
    return { ok: false, error: 'Nothing to submit — this period has no payroll entries' };
  }

  const snapshot = await freezeRun(org.id, periodStart, periodEnd, entries);
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('payroll_runs')
    .upsert({
      organization_id: org.id,
      period_start:    periodStart,
      period_end:      periodEnd,
      status:          'pending_approval',
      snapshot,
      submitted_by:    user.id,
      submitted_at:    new Date().toISOString(),
      // A resubmission is a fresh ask: last round's decision must not linger.
      reviewed_by:     null,
      reviewed_at:     null,
      review_note:     null,
    }, { onConflict: 'organization_id,period_start,period_end' });

  if (error) return { ok: false, error: error.message };

  const total = snapshot.reduce((s, e) => s + e.totalCompensation, 0);
  await dispatch(org.id, {
    eventType: 'payroll.approval_needed',
    title:     'Payroll needs approval',
    body:      `${periodStart} to ${periodEnd} — ${snapshot.length} employees, ${total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}.`,
    link:      `/app/payroll/review?startDate=${periodStart}&endDate=${periodEnd}`,
    payload:   { periodStart, periodEnd, total },
    // Keyed on the submission instant so a resubmission after a send-back
    // notifies again rather than being swallowed as a duplicate.
    dedupeKey: `payroll.approval_needed:${periodStart}:${periodEnd}:${Date.now()}`,
  });

  revalidatePath('/app/payroll/review');
  return { ok: true };
}

/**
 * The newest run still waiting on somebody, for the banner in the Payroll shell.
 *
 * Keyed on STATUS, not on a period — unlike getPayrollRun above, which every
 * other caller uses because it already knows which fortnight it is looking at.
 * The banner does not: its whole job is to say that a period needs attention to
 * someone who is not currently thinking about one. That is what
 * ix_payroll_run_pending (organization_id, status, submitted_at DESC) was
 * created for in the migration, and this is its first reader.
 *
 * Counted as well as fetched, because two periods can be open at once — the
 * unique index is per period — and a banner that silently showed only the
 * newest would be a second way for a pay run to go unnoticed.
 */
export async function getOpenPayrollRun(): Promise<OpenRun | null> {
  const { org, role } = await getCurrentOrg();
  if (!canSeeOpenRun(role)) return null;

  const supabase = createAdminClient();

  const { data, count } = await supabase
    .from('payroll_runs')
    .select('period_start, period_end, status, review_note, snapshot', { count: 'exact' })
    .eq('organization_id', org.id)
    .in('status', ['pending_approval', 'changes_requested'])
    .order('submitted_at', { ascending: false })
    .limit(1);

  const run = data?.[0];
  if (!run) return null;

  // Straight off the snapshot, never recomputed. The snapshot IS what was
  // submitted, and a banner showing a freshly-derived total would disagree with
  // the review screen it links to — over exactly the gap that screen exists to
  // make somebody look at.
  const snapshot = (run.snapshot ?? []) as SnapshotEntry[];

  return {
    periodStart: run.period_start as string,
    periodEnd:   run.period_end as string,
    status:      run.status as OpenRun['status'],
    reviewNote:  (run.review_note as string | null) ?? null,
    employees:   snapshot.length,
    total:       snapshot.reduce((sum, e) => sum + (Number(e.totalCompensation) || 0), 0),
    alsoWaiting: Math.max(0, (count ?? 1) - 1),
  };
}

/**
 * What changed since the submitter froze these figures.
 *
 * Called by the review screen before an owner is allowed to approve, so nobody
 * signs off numbers that have since moved underneath them.
 */
export async function getPayrollRunDiff(
  periodStart: string,
  periodEnd: string,
): Promise<RunDiff | null> {
  const run = await getPayrollRun(periodStart, periodEnd);
  if (!run) return null;

  const current = await computePayroll(periodStart, periodEnd);
  return diffPayrollRun(run.snapshot ?? [], toSnapshot(current));
}

/**
 * Approve a run.
 *
 * `acceptChanges` is the answer to a stale diff: without it, an approval on a
 * run whose figures have moved is refused. With it, the snapshot is REPLACED by
 * the current computation, so what gets approved is what the owner was actually
 * shown — never the older frozen copy.
 */
export async function approvePayrollRun(
  periodStart: string,
  periodEnd: string,
  options: { acceptChanges?: boolean; note?: string } = {},
): Promise<{ ok: boolean; error?: string; stale?: RunDiff }> {
  const { org, role } = await getCurrentOrg();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  if (!canApprovePayroll(role)) {
    return { ok: false, error: 'Only the account owner can approve payroll' };
  }

  const run = await getPayrollRun(periodStart, periodEnd);
  if (!run) return { ok: false, error: 'No submitted run for this period' };
  if (run.status === 'approved') return { ok: true };

  // Frozen, not merely mapped: when the diff is stale this same value REPLACES
  // the stored snapshot, and a replacement without the detail would leave an
  // approved period the portal can only show totals for.
  const current = await freezeRun(
    org.id, periodStart, periodEnd, await computePayroll(periodStart, periodEnd),
  );
  const diff = diffPayrollRun(run.snapshot ?? [], current);

  if (diff.isStale && !options.acceptChanges) {
    return { ok: false, error: 'The figures have changed since submission', stale: diff };
  }

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('payroll_runs')
    .update({
      status:      'approved',
      // Approving accepted changes approves what was on screen, which is the
      // recomputed set — storing the superseded snapshot would record an
      // approval of numbers nobody agreed to.
      snapshot:    diff.isStale ? current : run.snapshot,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_note: options.note ?? null,
    })
    .eq('id', run.id)
    .eq('organization_id', org.id);

  if (error) return { ok: false, error: error.message };

  await dispatch(org.id, {
    eventType: 'payroll.approved',
    title:     'Payroll approved',
    body:      `${periodStart} to ${periodEnd} has been approved.`,
    link:      `/app/payroll/review?startDate=${periodStart}&endDate=${periodEnd}`,
    payload:   { periodStart, periodEnd },
    dedupeKey: `payroll.approved:${run.id}:${Date.now()}`,
  });

  revalidatePath('/app/payroll/review');
  return { ok: true };
}

/** Send a run back to the submitter. A note is required — "no" without a reason is not actionable. */
export async function requestPayrollChanges(
  periodStart: string,
  periodEnd: string,
  note: string,
): Promise<{ ok: boolean; error?: string }> {
  const { org, role } = await getCurrentOrg();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  if (!canApprovePayroll(role)) {
    return { ok: false, error: 'Only the account owner can review payroll' };
  }
  if (!note.trim()) {
    return { ok: false, error: 'Say what needs changing so the submitter can act on it' };
  }

  const run = await getPayrollRun(periodStart, periodEnd);
  if (!run) return { ok: false, error: 'No submitted run for this period' };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('payroll_runs')
    .update({
      status:      'changes_requested',
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_note: note.trim(),
    })
    .eq('id', run.id)
    .eq('organization_id', org.id);

  if (error) return { ok: false, error: error.message };

  // Straight back to whoever submitted it — a request that vanishes into
  // silence teaches people to stop using the workflow.
  await dispatch(org.id, {
    eventType: 'payroll.changes_requested',
    title:     'Payroll sent back',
    body:      `${periodStart} to ${periodEnd}: ${note.trim()}`,
    link:      `/app/payroll/review?startDate=${periodStart}&endDate=${periodEnd}`,
    payload:   { periodStart, periodEnd, note: note.trim() },
    dedupeKey: `payroll.changes_requested:${run.id}:${Date.now()}`,
  });

  revalidatePath('/app/payroll/review');
  return { ok: true };
}

/**
 * Record an owner's decision to export ACH for an unapproved period.
 *
 * The gate exists so money does not move on unreviewed numbers, but it must
 * never be the reason payroll fails to run at 6pm on a Friday. So it is an
 * override, not a wall — and it is written down.
 */
export async function overrideApprovalGate(
  periodStart: string,
  periodEnd: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const { org, role } = await getCurrentOrg();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  if (!canApprovePayroll(role)) {
    return { ok: false, error: 'Only the account owner can override the approval gate' };
  }
  if (!reason.trim()) return { ok: false, error: 'A reason is required' };

  const supabase = createAdminClient();
  const { error } = await supabase
    .from('payroll_runs')
    .upsert({
      organization_id: org.id,
      period_start:    periodStart,
      period_end:      periodEnd,
      status:          'approved',
      snapshot:        await freezeRun(
        org.id, periodStart, periodEnd, await computePayroll(periodStart, periodEnd),
      ),
      submitted_by:    user.id,
      submitted_at:    new Date().toISOString(),
      reviewed_by:     user.id,
      reviewed_at:     new Date().toISOString(),
      override_reason: reason.trim(),
    }, { onConflict: 'organization_id,period_start,period_end' });

  if (error) return { ok: false, error: error.message };

  revalidatePath('/app/payroll/review');
  return { ok: true };
}
