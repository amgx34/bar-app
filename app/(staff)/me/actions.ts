'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentEmployee } from '@/lib/employee-portal/session';
import { buildStub, type PayStub } from '@/lib/employee-portal/stub';
import type { SnapshotEntry, ShiftNight } from '@/lib/payroll/run-diff';

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

  return { approved, inProgressHours };
}
