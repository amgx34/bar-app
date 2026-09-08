# Partial payouts — design

**Date:** 2026-09-08
**Status:** approved for planning

An owner can pay somebody for a chosen set of days part-way through a period,
rather than waiting for the whole period to close. The driving case is staff who
want cash for work already done before payday arrives.

## The decision that shapes everything

**An advance is a debit against the period, not a settlement of days.**

Paying Dana $240 for Mon–Wed records that $240 left the building. It does not
mark those days finished. At payday she is owed *whatever the approved period
turns out to be worth*, minus everything already handed over.

The alternative — days are settled at the price they were worth that day — was
rejected. If Friday and Saturday push Dana past forty hours, her Monday hours
become overtime retroactively. Settling them at Tuesday's price pays her less
than she is legally owed, and no amount of UI makes that acceptable.

This choice collapses most of the difficulty. Selected days become an **input to
a calculator that proposes an amount**, never a stored claim about what is
finished. Nothing is ever re-priced, because nothing was priced in the first
place — only paid.

## Decisions

| Question | Decision |
|---|---|
| Model | Advance is a debit against the period total. Days are an input, not state. |
| Storage | `payroll_payouts` becomes a payment ledger: many rows per employee per period. |
| "Paid" | Derived: `sum(amount_paid) >= totalCompensation`. Still no status column. |
| Cap | An advance cannot exceed what the selected days are currently worth. |
| Overtime | Chronological within the workweek — hours after the 40th are the premium ones. |
| Employee portal | Shows advances received and a clearly-labelled outstanding **estimate**. |

## Architecture

### 1. The ledger

`payroll_payouts` today holds one row per employee per period, enforced by
`ux_payroll_payout_employee_period`, and the migration's own comment says
"UNPAID IS THE ABSENCE OF A ROW". That is what changes.

```sql
-- Many payments per person per period.
DROP INDEX IF EXISTS ux_payroll_payout_employee_period;

-- Which days the amount was computed from. NULL means the whole period, which
-- is exactly what every existing row means and what a plain "mark paid" still
-- means — so the backfill is no backfill at all.
ALTER TABLE payroll_payouts ADD COLUMN IF NOT EXISTS covers_days DATE[];

-- Replaces what the unique index was really buying. See below.
ALTER TABLE payroll_payouts ADD COLUMN IF NOT EXISTS idempotency_key UUID;
CREATE UNIQUE INDEX IF NOT EXISTS ux_payroll_payout_idempotency
  ON payroll_payouts (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
```

`covers_days` is an array rather than a start/end pair because the days need not
be contiguous. An owner settling somebody for the two nights they actually
worked this week is the normal case, not the exception.

**The unique index was load-bearing and must be replaced, not just dropped.**
Its stated job was making "a double-tap on a slow phone an idempotent no-op
rather than a second row that would read as having paid somebody twice". A
ledger cannot use the old key — two payments to one person in one period is now
legal and expected. So the client generates a UUID when the dialog opens and
sends it with the write; the same tap twice carries the same key and collides.
Dropping the index without this silently reintroduces the exact bug the original
design called out.

**No status column, still.** "Fully paid" stays derived — from a sum now instead
of from existence. That keeps the original property: there is nothing stored
that can go stale against a run that was recomputed underneath it.

### 2. Valuing a set of days

New pure module `lib/payroll/day-value.ts`. Given one employee's shifts, their
rates, and the tips attributed to each day, it returns what a selected set of
days is currently worth.

```ts
export type DayValue = {
  date: string;
  hours: number;
  /** Hours at base rate, after the workweek's 40 have been allocated. */
  regularHours: number;
  overtimeHours: number;
  wage: number;
  tips: number;
  total: number;
};

export function valueDays(input: {
  shifts: readonly { date: string; hours: number }[];
  tipsByDate: ReadonlyMap<string, number>;
  hourlyRate: number;
  overtime: { enabled: boolean; multiplier: number };
  selected: readonly string[];
}): { days: DayValue[]; total: number };
```

**The overtime rule, stated once and tested.** Overtime is a weekly threshold, so
no single day is inherently overtime. This allocates chronologically within each
workweek: hours are filled at base rate until the week reaches forty, and every
hour after that is premium. A Wednesday is therefore only "overtime" if Monday
and Tuesday already used the week up.

Mid-period, only the shifts recorded so far exist, so an advance is priced on
what the week looks like *today*. That is an estimate and the design does not
pretend otherwise — the advance-as-debit model is precisely what makes it safe
for the estimate to be wrong.

The workweek boundary is `weekStartOf` from `lib/payroll/overtime.ts`, reused
rather than reimplemented. Two functions disagreeing about when a week starts
would put the premium on different days in the payout dialog and the pay run.

### 3. Per-day tips

`computePayroll` already distributes tips day by day, then accumulates them
straight into `employeeTipAmounts` and discards the daily figures. It gains a
second accumulator alongside:

```ts
const tipsByEmployeeByDate = new Map<string, Map<string, number>>();
```

Every place that writes `employeeTipAmounts` writes this too — the barback
split, the pool split, the opener bonus, individual and sales-pct modes. The
period total must stay exactly `sum(tipsByEmployeeByDate.get(id).values())`, and
a test pins that: if the two ever disagree, the dialog is proposing an advance
from a different tip calculation than the run itself uses.

Tip transfers between employees are applied **after** the per-day split and are
not attributable to a night. They land on the period total only, so a day's
value excludes them. Said plainly in the dialog rather than silently: an advance
is computed from the nights, and a transfer is a period-level correction.

### 4. The cap

An advance is refused when it exceeds the selected days' current value, minus
whatever has already been advanced for this period. The check is server-side in
the action — a client-side cap is a hint, not a rule.

The arithmetic lives in a pure function rather than inline in the action, so it
can be exercised without a database:

```ts
/** What may still be advanced. Never negative: an overpayment allows no more. */
export function remainingAdvanceCapacity(
  selectedDaysValue: number,
  alreadyPaidThisPeriod: number,
): number;
```

Note the ceiling is the **selected days'** value against **all** payments so far
for the period, not against payments for those days. Days are not settled, so
there is no per-day balance to draw against — there is one pot per period, and
this asks whether the pot has room.

Rationale: an over-advance creates a negative payday, and the app has no
mechanism to claw money back. Refusing is the honest failure. The error names
the ceiling so the owner can act ("Dana has earned $310 for those days and has
already had $240").

### 5. Reading the ledger

`summarizePayouts` changes shape. Today it takes `ReadonlyMap<string, Payout>`
and counts existence; it becomes:

```ts
export function summarizePayouts(
  entries: readonly PayableEntry[],
  payoutsByEmployee: ReadonlyMap<string, readonly Payout[]>,
): PayoutSummary;
```

`paidCount` counts people whose payments cover their total. `outstanding` sums
`max(0, totalCompensation - paidSoFar)` for everyone — not the whole figure for
anyone unpaid, which is what it does today and would now overstate the remaining
cash by every advance already handed out.

A new field, `advancedTotal`, carries the sum of payments to people not yet
fully covered, so the screen can say "$1,240 out, $860 still to go" rather than
implying nothing has moved.

Overpayment is clamped at zero rather than reported as negative outstanding. It
is possible (a run recomputed downward after a payment) and it is not the
summary's job to editorialise about it.

### 6. The manager UI

`payout-dialog.tsx` today is deliberately one field — a method — because the
thing being recorded is a fact the person already knows. That stays true for the
common case, so the dialog opens exactly as it does now, pre-filled with the
full outstanding amount, one tap from done.

Paying for some days is a disclosure inside it, not a separate flow: "Pay for
selected days instead". Opening it lists the nights worked in the period with
hours and value, each tickable, and the amount updates as they are ticked. The
method field is unchanged.

`payout-controls.tsx` and `payroll-table.tsx` change from a paid/unpaid badge to
one that can also read partially paid, showing what has been handed over against
what is owed. A row with payments listed shows them: date, amount, method — the
history the single-row model could not hold.

### 7. The employee portal

The portal's rule is that it renders the frozen snapshot and never a recompute.
This adds the one deliberate exception, and it is bounded:

- **Advances are shown as fact.** A payout row is money that actually moved, and
  `amount_paid` is frozen at mark time. Showing it is not a recompute.
- **The remainder is shown as an estimate,** explicitly labelled, in muted type,
  never with the visual weight of an approved period. It is a live figure and
  says so: "estimated — your manager has not approved this period yet".

  The estimate is `computePayroll`'s current period total for that employee,
  minus everything already paid to them for it. That is the only recompute the
  portal performs, it is confined to the in-progress period, and it never
  appears on an approved period's card — those still render `buildStub` output
  exclusively.

This is a real loosening of the invariant, taken knowingly. The failure the rule
exists to prevent is presenting an unapproved number *as though it were
approved*; the mitigation is that the estimate can never be mistaken for one.
`buildStub` and the approved-period cards are untouched.

## Error handling

| Case | Behaviour |
|---|---|
| Advance exceeds the days' value | Refused server-side, naming the ceiling and what was already advanced. |
| Same tap twice | Idempotency key collides; the second write is a no-op, not a second payment. |
| No days selected | Confirm button disabled; there is no amount to record. |
| A selected day has no shift | Worth nothing, ticked but priced at zero, and shown as zero rather than hidden. |
| Employee already fully paid | Dialog opens with zero outstanding and says so; the cap refuses a further advance. |
| Run recomputed below what was paid | Outstanding clamps to zero. The overpayment is visible in the payments list, not hidden. |
| Employee from another bar | Existing `assertEmployeeInOrg` check, unchanged. |

## Testing

Pure, with vitest, matching the `lib/payroll/` convention:

- `day-value.ts` — the overtime allocation: a week under forty is all base; the
  hours after the fortieth are premium; a day is only premium when the earlier
  days used the week up; a non-contiguous selection values only what was ticked;
  a day with no shift is worth zero, not absent.
- `payouts.ts` — the new summary: a partial payment leaves the balance
  outstanding, not the whole figure; somebody fully covered by two payments is
  paid; overpayment clamps to zero; `advancedTotal` excludes the fully paid.
- `computePayroll` — the invariant that per-day tips sum to the period tip total,
  across the barback split, the pool split and the opener bonus.

The cap is enforced in the action, so it gets a test at the pure seam: a
function `remainingAdvanceCapacity(daysValue, alreadyPaid)` the action calls,
rather than arithmetic inline in a server action nothing can exercise.

## Out of scope

- Clawing back an overpayment. The app records that it happened and stops there.
- Advances against a period that has not started, or future days.
- Employees requesting an advance. This is a manager action; the portal shows
  what happened, it does not initiate anything.
- Changing the approval workflow. An advance is not an approval and does not
  submit, freeze or gate a run.

## Build order

1. Migration + `summarizePayouts` reshaping + its tests. Nothing user-visible;
   the existing full-payout flow keeps working through it.
2. `day-value.ts` and the per-day tip map in `computePayroll`, with the
   sum-invariant test.
3. The action: idempotency key, cap, `covers_days`.
4. The dialog's day picker and the partially-paid badges.
5. The portal's advance line and estimate.

1 and 2 are independent. 4 needs both. 5 needs only 1.
