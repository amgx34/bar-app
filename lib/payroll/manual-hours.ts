/**
 * Which incoming POS shifts may be written, and which belong to a person.
 *
 * Pure — no database. Extracted from the 2Touch ingest route so the rule can be
 * tested without a request context, because the failure it prevents is invisible
 * at runtime: an unguarded upsert reverts a manager's correction within five
 * minutes and leaves the payroll_adjustments row behind, so the audit log and
 * the pay run quietly disagree and neither looks wrong on its own.
 *
 * The same rule the Z-report path applies to `cash_tips_source`.
 */

/** Key shape used by both the incoming map and the protected set. */
export function shiftKey(employeeId: string, shiftDate: string): string {
  return `${employeeId}|${shiftDate}`;
}

export type ProtectedShift = {
  employee_id: string;
  shift_date: string;
};

/**
 * Splits incoming shifts into those the POS may overwrite and those it may not.
 *
 * `incoming` is keyed by `shiftKey()`. Returns the writable values plus a count
 * of what was held back, so the ingest can report it rather than looking like it
 * silently did nothing.
 */
export function partitionShifts<T>(
  incoming: Map<string, T>,
  protectedRows: ProtectedShift[],
): { writable: T[]; protectedCount: number } {
  const locked = new Set(
    protectedRows.map((r) => shiftKey(r.employee_id, r.shift_date)),
  );

  const writable: T[] = [];
  for (const [key, value] of incoming) {
    if (!locked.has(key)) writable.push(value);
  }

  return { writable, protectedCount: incoming.size - writable.length };
}
