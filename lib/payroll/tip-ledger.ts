/**
 * The per-employee, per-night tip accumulator computePayroll builds while it
 * walks Z reports.
 *
 * Pure — no database, no clock. Extracted so the accumulation itself (not just
 * the arithmetic it produces) is unit-testable without a Supabase connection.
 * `computePayrollForOrg` owns the totals map (`employeeTipAmounts`) and calls
 * `addTip` for every per-night write; a tip TRANSFER, which belongs to no
 * night, is applied to the totals map directly and never goes through here.
 */

export type TipLedger = Map<string, Map<string, number>>;

/**
 * Adds one night's tip amount for one employee to their per-date map.
 *
 * Mutates and returns `byEmployee` so callers can chain it, but the mutation
 * is the point: every write must land in the same structure the invariant
 * (`tipTotals(byEmployee) === employeeTipAmounts`) is checked against.
 * A zero or falsy amount is skipped rather than recorded as a $0 night —
 * "no tip" and "a tip of nothing" read the same to a caller either way, and
 * skipping keeps the map from growing an entry for every night a person
 * merely held a shift.
 */
export function addTip(
  byEmployee: TipLedger,
  employeeId: string,
  date: string,
  amount: number
): TipLedger {
  if (!amount) return byEmployee;
  const byDate = byEmployee.get(employeeId) ?? new Map<string, number>();
  byDate.set(date, (byDate.get(date) ?? 0) + amount);
  byEmployee.set(employeeId, byDate);
  return byEmployee;
}

/**
 * Sums every employee's per-date map back to a period total, keyed by
 * employee id — the shape the invariant test compares against
 * `employeeTipAmounts`.
 */
export function tipTotals(byEmployee: TipLedger): Map<string, number> {
  const totals = new Map<string, number>();
  for (const [employeeId, byDate] of byEmployee) {
    let sum = 0;
    for (const amount of byDate.values()) sum += amount;
    totals.set(employeeId, sum);
  }
  return totals;
}
