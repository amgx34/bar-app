'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentEmployee } from '@/lib/employee-portal/session';
import { buildStub, type PayStub } from '@/lib/employee-portal/stub';
import type { SnapshotEntry, ShiftNight } from '@/lib/payroll/run-diff';
import { computePayrollForOrg } from '@/app/(app)/app/payroll/actions';

export type ApprovedPeriod = {
  periodStart: string;
  periodEnd:   string;
  approvedAt:  string | null;
  stub:        PayStub;
};

/**
 * Everything the portal shows, scoped to the logged-in employee.
 *
 * Both queries filter on the org AND the employee id from the session, never on
 * anything that came in with the request — so a hand-edited URL cannot address
 * another person's pay. The snapshot is the whole run's payroll, so buildStub
 * narrows it to one person before it can reach a page.
 *
 * Approved runs only. Money an owner has not signed off does not appear here at
 * all, and nothing on this path recomputes: a figure derived now is not the
 * figure that was approved, and showing it as though it were is the failure
 * this whole design is arranged around.
 */
export async function getMyPeriods(): Promise<{
  approved: ApprovedPeriod[];
  inProgressHours: ShiftNight[];
  inProgress: { earnedSoFar: number; advancesReceived: number; stillToCome: number } | null;
}> {
  const me = await getCurrentEmployee();
  const supabase = createAdminClient();

  const { data: runs } = await supabase
    .from('payroll_runs')
    .select('period_start, period_end, reviewed_at, snapshot')
    .eq('organization_id', me.orgId)
    .eq('status', 'approved')
    .order('period_end', { ascending: false })
    .limit(12);

  const approved: ApprovedPeriod[] = [];
  for (const run of runs ?? []) {
    const stub = buildStub((run.snapshot ?? []) as SnapshotEntry[], me.employeeId);
    // A period this person did not work produces no card at all.
    if (!stub) continue;
    approved.push({
      periodStart: run.period_start as string,
      periodEnd:   run.period_end as string,
      approvedAt:  (run.reviewed_at as string | null) ?? null,
      stub,
    });
  }

  // Hours since the newest approved period — the nights nobody has signed off.
  // Money is deliberately absent for these: no figure has been approved, and
  // computing one here would be exactly the recompute this design forbids.
  const since = approved[0]?.periodEnd ?? '1970-01-01';
  const { data: shifts } = await supabase
    .from('employee_shifts')
    .select('shift_date, regular_hours, overtime_hours, is_opener')
    .eq('organization_id', me.orgId)
    .eq('employee_id', me.employeeId)
    .gt('shift_date', since)
    .order('shift_date', { ascending: true });

  const inProgressHours = (shifts ?? []).map((s) => ({
    date:     s.shift_date as string,
    hours:    (Number(s.regular_hours) || 0) + (Number(s.overtime_hours) || 0),
    isOpener: Boolean(s.is_opener),
  }));

  /*
    Advances are FACT: a payout row is money that actually moved, and
    amount_paid is frozen at mark time. Showing it is not a recompute.

    `earnedSoFar` is the one recompute this portal performs. It is phrased as
    elapsed fact — what these already-worked days are worth — never as what the
    period will pay. Mid-week that number would move, and a figure that moves is
    the confidently-wrong number this codebase refuses everywhere else.
  */
  const periodStart = inProgressHours[0]?.date ?? null;
  const periodEnd = inProgressHours[inProgressHours.length - 1]?.date ?? null;

  let inProgress: {
    earnedSoFar: number; advancesReceived: number; stillToCome: number;
  } | null = null;

  if (periodStart && periodEnd) {
    const { data: payoutRows } = await supabase
      .from('payroll_payouts')
      .select('amount_paid')
      .eq('organization_id', me.orgId)
      .eq('employee_id', me.employeeId)
      .gte('period_start', periodStart)
      .lte('period_end', periodEnd);

    const advancesReceived = (payoutRows ?? [])
      .reduce((sum, r) => sum + (Number(r.amount_paid) || 0), 0);

    // computePayrollForOrg, NOT computePayroll: the latter resolves its org
    // through getCurrentOrg, which redirects anybody without a membership —
    // and an employee has none by design. The org id here came from the
    // employee's own session, never from the request. The admin client is
    // passed explicitly because this session holds no membership row, so the
    // default RLS-scoped client would return zero rows for every query inside
    // computePayrollForOrg and silently report $0 earned.
    const entries = await computePayrollForOrg(me.orgId, periodStart, periodEnd, supabase);
    const earnedSoFar =
      entries.find((e) => e.employeeId === me.employeeId)?.totalCompensation ?? 0;

    inProgress = {
      earnedSoFar,
      advancesReceived,
      // Clamped: an overpayment is not a debt this screen should assert.
      stillToCome: Math.max(0, earnedSoFar - advancesReceived),
    };
  }

  return { approved, inProgressHours, inProgress };
}
