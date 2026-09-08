/**
 * Deciding what a stored employee account entitles somebody to.
 *
 * Pure — no database, no clock, no `server-only`, so it is directly testable.
 * The I/O that fetches the row lives in ./session.ts, the same split as
 * lib/notifications/detect.ts and deliver.ts.
 *
 * This is the portal's entire security model in one function: everything the
 * portal reads is scoped by the session it returns, and by nothing that came
 * from the request.
 */

export type EmployeeSession = {
  orgId:        string;
  employeeId:   string;
  employeeName: string;
};

export type AccountRow = {
  organization_id: string;
  employee_id:     string | null;
  status:          string;
  employees:       { name: string } | { name: string }[] | null;
};

export type AccountState =
  | { kind: 'active'; session: EmployeeSession }
  | { kind: 'pending' }
  | { kind: 'none' };

/**
 * Fails closed: only the literal string 'active' produces a session. A status
 * this code has never heard of is no account, not a login by default.
 *
 * 'revoked' collapses into 'none' on purpose — a revoked employee is told
 * nothing about why and sees exactly what a stranger sees.
 */
export function resolveAccountState(row: AccountRow | null): AccountState {
  if (!row) return { kind: 'none' };
  if (row.status === 'pending') return { kind: 'pending' };
  if (row.status !== 'active') return { kind: 'none' };

  // The CHECK constraint forbids an active row with no employee. Re-checked
  // here because a session carrying a null id would scope queries to nothing —
  // or, with one wrong `.eq`, to everything.
  if (!row.employee_id) return { kind: 'none' };

  const emp = Array.isArray(row.employees) ? row.employees[0] : row.employees;

  return {
    kind: 'active',
    session: {
      orgId:        row.organization_id,
      employeeId:   row.employee_id,
      employeeName: emp?.name ?? '',
    },
  };
}
