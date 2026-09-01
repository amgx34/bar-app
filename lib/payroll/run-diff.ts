/**
 * Comparing a frozen pay run against a fresh recompute.
 *
 * Payroll is computed live from employee_shifts + z_report_days +
 * payroll_adjustments, so the figures an approver sees are only the figures the
 * submitter saw if nothing changed in between. Something usually does: a
 * corrected shift, a late Z report, a tip adjustment.
 *
 * Approving stale numbers silently is the exact failure this workflow exists to
 * prevent, so the approval screen diffs first and makes the owner look at what
 * moved.
 */

export type SnapshotEntry = {
  employeeId:        string;
  employeeName:      string;
  totalHours:        number;
  totalCompensation: number;
};

export type EntryChange = {
  employeeId:   string;
  employeeName: string;
  kind:         'added' | 'removed' | 'changed';
  hoursBefore:  number | null;
  hoursAfter:   number | null;
  payBefore:    number | null;
  payAfter:     number | null;
};

export type RunDiff = {
  isStale:      boolean;
  changes:      EntryChange[];
  payBefore:    number;
  payAfter:     number;
  payDelta:     number;
};

/** Money compares to the cent; floats from two separate computations rarely equal exactly. */
const CENT = 0.005;

function differs(a: number, b: number): boolean {
  return Math.abs(a - b) >= CENT;
}

export function diffPayrollRun(
  snapshot: readonly SnapshotEntry[],
  current: readonly SnapshotEntry[],
): RunDiff {
  const before = new Map(snapshot.map((e) => [e.employeeId, e]));
  const after  = new Map(current.map((e) => [e.employeeId, e]));
  const changes: EntryChange[] = [];

  for (const [id, was] of before) {
    const now = after.get(id);
    if (!now) {
      changes.push({
        employeeId: id, employeeName: was.employeeName, kind: 'removed',
        hoursBefore: was.totalHours, hoursAfter: null,
        payBefore: was.totalCompensation, payAfter: null,
      });
      continue;
    }
    if (differs(was.totalHours, now.totalHours) ||
        differs(was.totalCompensation, now.totalCompensation)) {
      changes.push({
        employeeId: id, employeeName: now.employeeName, kind: 'changed',
        hoursBefore: was.totalHours, hoursAfter: now.totalHours,
        payBefore: was.totalCompensation, payAfter: now.totalCompensation,
      });
    }
  }

  // An employee who appears only in the recompute — a shift entered after
  // submission. Easy to miss on screen, and the one most likely to be underpaid.
  for (const [id, now] of after) {
    if (before.has(id)) continue;
    changes.push({
      employeeId: id, employeeName: now.employeeName, kind: 'added',
      hoursBefore: null, hoursAfter: now.totalHours,
      payBefore: null, payAfter: now.totalCompensation,
    });
  }

  const payBefore = snapshot.reduce((s, e) => s + e.totalCompensation, 0);
  const payAfter  = current.reduce((s, e) => s + e.totalCompensation, 0);

  return {
    isStale: changes.length > 0,
    changes,
    payBefore,
    payAfter,
    payDelta: payAfter - payBefore,
  };
}
