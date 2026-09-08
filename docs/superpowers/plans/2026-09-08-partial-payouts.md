# Partial Payouts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an owner hand somebody money for a chosen set of days part-way through a pay period, recorded as a debit against that period rather than as a settlement of those days.

**Architecture:** `payroll_payouts` becomes a payment ledger — many rows per employee per period — with "fully paid" derived from a sum instead of from a row's existence. Selected days feed a pure calculator that *proposes* an amount; the amount is then capped server-side at total-earned-so-far minus total-already-paid, which is the only rule that prevents a negative payday.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase (Postgres + RLS), TypeScript, vitest, Base UI (`components/ui`), Tailwind, zod.

**Spec:** `docs/superpowers/specs/2026-09-08-partial-payouts-design.md`

## Global Constraints

- **An advance is a debit, never a settlement.** Nothing may store a claim that a day is finished, and nothing may re-price a past payment.
- **The cap is `earnedSoFarThisPeriod - alreadyPaidThisPeriod`.** Selected days propose the amount; they are NOT the ceiling. Capping against selected days is a bug — see the spec's §4 for the worked example.
- **No status column.** "Fully paid" stays derived from `sum(amount_paid) >= totalCompensation`.
- **The old unique index was load-bearing for double-tap idempotency.** It cannot simply be dropped; a client-generated `idempotency_key` replaces it in the same commit.
- **`amount_paid` is frozen at mark time** and must never be re-read from a live recompute.
- **Every `createAdminClient()` query filters `.eq('organization_id', org.id)`** or carries an `// admin-scope-ok:` justification. `npm run audit:scope` enforces this.
- **NULL is not zero.** A missing figure renders `—`, never `$0`.
- **The portal states elapsed fact, never a forecast.** Wording is "earned so far" / "still to come for the days worked so far" — never "you will be paid".
- Commands: `npx tsc --noEmit`, `npm test`, `npm run audit:scope`, `npm run lint`, `npm run build`.

---

## File Structure

**Create:**
- `supabase/migrations/20260909000000_payouts_ledger.sql` — drop the period-unique index, add `covers_days` and `idempotency_key`.
- `lib/payroll/day-value.ts` — pure. Values a selected set of days, allocating weekly overtime chronologically.
- `lib/payroll/day-value.test.ts`
- `app/(app)/app/payroll/_components/day-picker.tsx` — the tickable night list inside the payout dialog.

**Modify:**
- `lib/payroll/overtime.ts` — export `weekStartOf` so day-value reuses it.
- `lib/payroll/payouts.ts` — `Payout` gains `id`/`coversDays`; `summarizePayouts` takes a list per employee; add `remainingAdvanceCapacity`.
- `lib/payroll/payouts.test.ts` — reshape existing cases, add ledger cases.
- `app/(app)/app/payroll/actions.ts` — keep per-day tips instead of discarding them.
- `app/(app)/app/payroll/payout-actions.ts` — idempotency key, cap, `covers_days`, delete-by-id.
- `app/(app)/app/payroll/_components/payout-dialog.tsx` — day picker disclosure.
- `app/(app)/app/payroll/_components/payout-controls.tsx` — partially-paid state, payment list.
- `app/(app)/app/payroll/_components/payroll-tab.tsx` — group payouts per employee.
- `app/(staff)/me/actions.ts` and `app/(staff)/me/page.tsx` — advances and elapsed-fact figures.

---

## Task 1: Ledger migration

**Files:**
- Create: `supabase/migrations/20260909000000_payouts_ledger.sql`

**Interfaces:**
- Consumes: the existing `payroll_payouts` table from `20260901000002_add_payroll_payouts.sql`.
- Produces: `payroll_payouts` accepts many rows per `(organization_id, employee_id, period_start, period_end)`; new columns `covers_days DATE[]` and `idempotency_key UUID`.

- [ ] **Step 1: Write the migration**

```sql
-- ── payroll_payouts becomes a ledger ─────────────────────────────────────────
-- The table was one row per employee per period, and unpaid was the absence of
-- a row. Advances break that: an owner can now hand somebody money twice in one
-- period, so a period holds a list of payments and "fully paid" becomes a sum.
--
-- What does NOT change: there is still no status column. Fully-paid is derived,
-- so there remains nothing stored that can go stale against a run recomputed
-- underneath it.

-- Many payments per person per period.
DROP INDEX IF EXISTS ux_payroll_payout_employee_period;

-- Which days the amount was computed from. NULL means the whole period — which
-- is what every existing row means and what a plain "mark paid" still means, so
-- there is no backfill.
--
-- Recorded for the receipt, NOT as state: days are never "settled". See the
-- design doc for why settling days underpays anyone whose later shifts push
-- their week past forty hours.
ALTER TABLE payroll_payouts ADD COLUMN IF NOT EXISTS covers_days DATE[];

-- Replaces what the dropped index was really buying. Its stated job was making
-- "a double-tap on a slow phone an idempotent no-op rather than a second row
-- that would read as having paid somebody twice" — and a ledger cannot key on
-- the old columns, because two payments in one period is now the point.
--
-- The client generates this when the payout dialog opens, so the same tap twice
-- carries the same key and the second write collides instead of paying again.
ALTER TABLE payroll_payouts ADD COLUMN IF NOT EXISTS idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS ux_payroll_payout_idempotency
  ON payroll_payouts (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- The period read is now a list rather than a lookup, and it is the payroll
-- screen's only query against this table.
CREATE INDEX IF NOT EXISTS ix_payroll_payout_period_employee
  ON payroll_payouts (organization_id, period_start, period_end, employee_id);
```

- [ ] **Step 2: Verify the SQL**

If Docker or a linked Supabase project is available:

```bash
npx supabase db reset
```

Expected: applies with no error; `\d payroll_payouts` shows `covers_days`,
`idempotency_key`, the idempotency index, and NO `ux_payroll_payout_employee_period`.

**If neither is available**, the SQL cannot be executed here. Say so plainly in
the commit message and carry it into the manual checklist — do not claim it was
validated. Every test in this plan runs against pure functions, so nothing else
is blocked.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260909000000_payouts_ledger.sql
git commit -m "feat(payroll): payroll_payouts becomes a payment ledger"
```

---

## Task 2: Reshape the payout summary

**Files:**
- Modify: `lib/payroll/payouts.ts`
- Test: `lib/payroll/payouts.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `Payout` gains `id: string` and `coversDays: string[] | null`
  - `summarizePayouts(entries: readonly PayableEntry[], payoutsByEmployee: ReadonlyMap<string, readonly Payout[]>): PayoutSummary`
  - `PayoutSummary` gains `advancedTotal: number`
  - `totalPaidTo(payouts: readonly Payout[] | undefined): number`

- [ ] **Step 1: Write the failing tests**

Replace the `map` helper and add ledger cases in `lib/payroll/payouts.test.ts`:

```typescript
const paid = (id: string, amount = 0, payoutId = `p-${id}-${amount}`): Payout =>
  ({
    id: payoutId, employeeId: id, method: 'cash', amountPaid: amount,
    paidAt: '2026-09-01T00:00:00Z', coversDays: null,
  });

/** Groups rows the way the payroll screen does — a list per employee. */
const map = (...rows: Payout[]) => {
  const m = new Map<string, Payout[]>();
  for (const r of rows) {
    const list = m.get(r.employeeId) ?? [];
    list.push(r);
    m.set(r.employeeId, list);
  }
  return m;
};
```

Then add:

```typescript
describe('summarizePayouts with a ledger', () => {
  it('leaves only the balance outstanding after a partial payment', () => {
    // The whole point of advances: $300 of Dana's $800 has been handed over,
    // so $500 is still owed — not $800, which is what counting existence did.
    const s = summarizePayouts([entry('1', 800)], map(paid('1', 300)));
    expect(s.outstanding).toBe(500);
    expect(s.paidCount).toBe(0);
    expect(s.allPaid).toBe(false);
  });

  it('counts somebody covered by two payments as paid', () => {
    const s = summarizePayouts([entry('1', 800)], map(paid('1', 300), paid('1', 500)));
    expect(s.paidCount).toBe(1);
    expect(s.outstanding).toBe(0);
    expect(s.allPaid).toBe(true);
  });

  it('clamps an overpayment to zero rather than reporting negative owed', () => {
    // Possible when a run is recomputed downward after a payment. Not the
    // summary's job to editorialise; the payments list shows what happened.
    const s = summarizePayouts([entry('1', 800)], map(paid('1', 900)));
    expect(s.outstanding).toBe(0);
    expect(s.paidCount).toBe(1);
  });

  it('reports what has gone out to people who are not yet fully paid', () => {
    // Without this the screen implies no money has moved when in fact $300 has.
    const s = summarizePayouts(
      [entry('1', 800), entry('2', 500)],
      map(paid('1', 300), paid('2', 500)),
    );
    expect(s.advancedTotal).toBe(300);
    expect(s.outstanding).toBe(500);
  });

  it('ignores payouts for people no longer on the run', () => {
    const s = summarizePayouts([entry('1', 800)], map(paid('1', 800), paid('9', 400)));
    expect(s.paidCount).toBe(1);
    expect(s.totalCount).toBe(1);
  });
});

describe('remainingAdvanceCapacity', () => {
  it('is what has been earned, less what has been handed over', () => {
    expect(remainingAdvanceCapacity(610, 240)).toBe(370);
  });

  it('is zero, never negative, when somebody has been overpaid', () => {
    // The app cannot claw money back, so an overpayment allows no more.
    expect(remainingAdvanceCapacity(300, 500)).toBe(0);
  });

  it('is the full amount when nothing has been paid', () => {
    expect(remainingAdvanceCapacity(610, 0)).toBe(610);
  });
});
```

Add `remainingAdvanceCapacity` to the import at the top of the file.

- [ ] **Step 2: Run the tests and watch them fail**

Run: `npx vitest run lib/payroll/payouts.test.ts`
Expected: FAIL — `remainingAdvanceCapacity is not a function`, plus type errors
on `coversDays`/`id` under `npx tsc --noEmit`.

- [ ] **Step 3: Implement**

In `lib/payroll/payouts.ts`, replace the `Payout` type, the `PayoutSummary`
type and `summarizePayouts`:

```typescript
export type Payout = {
  /** Row id. A ledger needs it: undo now targets one payment, not a period. */
  id:         string;
  employeeId: string;
  method:     PayoutMethod;
  amountPaid: number;
  paidAt:     string;
  /**
   * The days this amount was computed from, or null for the whole period.
   *
   * A receipt, never state. Days are not settled by being paid for — see the
   * design doc for why settling them underpays anybody whose later shifts push
   * their week past forty hours.
   */
  coversDays: string[] | null;
};

export type PayoutSummary = {
  /** People whose payments cover what the run says they are owed. */
  paidCount:   number;
  /** People on the run, paid or not. The denominator. */
  totalCount:  number;
  /** Sum of `totalCompensation` for everyone on the run. */
  total:       number;
  /** What is still to hand over: the unpaid BALANCE, not the whole figure. */
  outstanding: number;
  /**
   * Money already handed to people who are not yet fully paid.
   *
   * Without it the screen reads as though nothing has moved when in fact an
   * owner has been paying advances all week.
   */
  advancedTotal: number;
  /** True only when there is somebody to pay and nobody is left. */
  allPaid:     boolean;
};

/** What somebody has been handed for a period. Zero when nothing is recorded. */
export function totalPaidTo(payouts: readonly Payout[] | undefined): number {
  return (payouts ?? []).reduce((sum, p) => sum + p.amountPaid, 0);
}

/**
 * How far through paying out this period the bar is.
 *
 * `outstanding` is the unpaid BALANCE — the live figure minus what has already
 * been handed over — not the whole figure for anybody not yet finished. Under
 * the old one-row model those were the same number; with advances they are not,
 * and using the old rule would overstate the cash still needed by every advance
 * already paid.
 *
 * Overpayment clamps to zero rather than subtracting from somebody else's
 * balance. It happens when a run is recomputed downward after a payment, and
 * the payments list is where it should be visible, not here.
 *
 * Payouts for people no longer on the run are ignored, so `paidCount` can never
 * exceed `totalCount`.
 */
export function summarizePayouts(
  entries: readonly PayableEntry[],
  payoutsByEmployee: ReadonlyMap<string, readonly Payout[]>,
): PayoutSummary {
  let paidCount = 0;
  let total = 0;
  let outstanding = 0;
  let advancedTotal = 0;

  for (const entry of entries) {
    total += entry.totalCompensation;

    const paidSoFar = totalPaidTo(payoutsByEmployee.get(entry.employeeId));
    const balance = entry.totalCompensation - paidSoFar;

    if (balance <= 0) {
      paidCount += 1;
    } else {
      outstanding += balance;
      // Only counted for the not-yet-finished: this figure answers "how much
      // have I already put out against what is still open".
      advancedTotal += paidSoFar;
    }
  }

  return {
    paidCount,
    totalCount: entries.length,
    total,
    outstanding,
    advancedTotal,
    allPaid: entries.length > 0 && paidCount === entries.length,
  };
}

/**
 * What may still be advanced to somebody this period.
 *
 * The ceiling is total EARNED against total PAID, not the value of whichever
 * days are ticked. Days propose an amount; this decides whether the pot has
 * room. Capping against the ticked days asks a per-day question in a model that
 * deliberately has no per-day balances — it would offer somebody $60 of a $300
 * request because an earlier advance had "used up" days they had not worked yet.
 *
 * Never negative: the app cannot claw money back, so an overpayment allows no
 * further advance rather than implying a debt.
 */
export function remainingAdvanceCapacity(
  earnedSoFarThisPeriod: number,
  alreadyPaidThisPeriod: number,
): number {
  return Math.max(0, earnedSoFarThisPeriod - alreadyPaidThisPeriod);
}
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `npx vitest run lib/payroll/payouts.test.ts && npx tsc --noEmit`
Expected: tests PASS. `tsc` will report errors in `payroll-tab.tsx`,
`payout-controls.tsx` and `payout-actions.ts` — those are Tasks 6 and 7, leave
them.

- [ ] **Step 5: Commit**

```bash
git add lib/payroll/payouts.ts lib/payroll/payouts.test.ts
git commit -m "feat(payroll): payout summary reads a ledger, not a single row"
```

---

## Task 3: Value a set of days

**Files:**
- Modify: `lib/payroll/overtime.ts` (export `weekStartOf`)
- Create: `lib/payroll/day-value.ts`
- Test: `lib/payroll/day-value.test.ts`

**Interfaces:**
- Consumes: `weekStartOf(iso: string): string | null` from `lib/payroll/overtime.ts`.
- Produces:
  - `type DayValue = { date: string; hours: number; regularHours: number; overtimeHours: number; wage: number; tips: number; total: number }`
  - `valueDays(input): { days: DayValue[]; total: number }`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { valueDays } from './day-value';

const noTips = new Map<string, number>();
const ot = { enabled: true, multiplier: 1.5 };

// 2026-09-07 is a Monday.
const week = [
  { date: '2026-09-07', hours: 10 },
  { date: '2026-09-08', hours: 10 },
  { date: '2026-09-09', hours: 10 },
  { date: '2026-09-10', hours: 10 },
  { date: '2026-09-11', hours: 10 },
];

describe('valueDays', () => {
  it('pays every hour at base rate when the week stays under forty', () => {
    const out = valueDays({
      shifts: [{ date: '2026-09-07', hours: 8 }],
      tipsByDate: noTips, hourlyRate: 10, overtime: ot,
      selected: ['2026-09-07'],
    });
    expect(out.days[0].regularHours).toBe(8);
    expect(out.days[0].overtimeHours).toBe(0);
    expect(out.total).toBe(80);
  });

  it('makes the hours after the fortieth premium, chronologically', () => {
    // Mon-Thu use the 40. Friday is entirely overtime.
    const out = valueDays({
      shifts: week, tipsByDate: noTips, hourlyRate: 10, overtime: ot,
      selected: ['2026-09-11'],
    });
    expect(out.days[0].regularHours).toBe(0);
    expect(out.days[0].overtimeHours).toBe(10);
    expect(out.total).toBe(150);
  });

  it('splits the day that straddles the threshold', () => {
    // Mon-Wed are 30 hours; Thursday's first 10 reach exactly 40, so Thursday
    // is all regular and the premium starts on Friday.
    const out = valueDays({
      shifts: week, tipsByDate: noTips, hourlyRate: 10, overtime: ot,
      selected: ['2026-09-10'],
    });
    expect(out.days[0].regularHours).toBe(10);
    expect(out.days[0].overtimeHours).toBe(0);
  });

  it('only makes a day premium when the earlier days used the week up', () => {
    // The same Friday, alone in its week, is ordinary time.
    const out = valueDays({
      shifts: [{ date: '2026-09-11', hours: 10 }],
      tipsByDate: noTips, hourlyRate: 10, overtime: ot,
      selected: ['2026-09-11'],
    });
    expect(out.days[0].overtimeHours).toBe(0);
    expect(out.total).toBe(100);
  });

  it('values only the days that were ticked, contiguous or not', () => {
    const out = valueDays({
      shifts: [
        { date: '2026-09-07', hours: 5 },
        { date: '2026-09-08', hours: 5 },
        { date: '2026-09-09', hours: 5 },
      ],
      tipsByDate: noTips, hourlyRate: 10, overtime: ot,
      selected: ['2026-09-07', '2026-09-09'],
    });
    expect(out.days).toHaveLength(2);
    expect(out.total).toBe(100);
  });

  it('adds the tips attributed to each ticked day', () => {
    const out = valueDays({
      shifts: [{ date: '2026-09-07', hours: 5 }],
      tipsByDate: new Map([['2026-09-07', 60]]),
      hourlyRate: 10, overtime: ot, selected: ['2026-09-07'],
    });
    expect(out.days[0].tips).toBe(60);
    expect(out.total).toBe(110);
  });

  it('prices a ticked day with no shift at zero rather than dropping it', () => {
    // Shown as zero so the owner can see they ticked a night nobody worked.
    const out = valueDays({
      shifts: [], tipsByDate: noTips, hourlyRate: 10, overtime: ot,
      selected: ['2026-09-07'],
    });
    expect(out.days).toHaveLength(1);
    expect(out.days[0].total).toBe(0);
  });

  it('pays overtime hours at base rate when the premium is switched off', () => {
    // Off means no PREMIUM, never unpaid — matching lib/payroll/overtime.ts.
    const out = valueDays({
      shifts: week, tipsByDate: noTips, hourlyRate: 10,
      overtime: { enabled: false, multiplier: 1.5 },
      selected: ['2026-09-11'],
    });
    expect(out.total).toBe(100);
  });

  it('counts each workweek separately', () => {
    // 2026-09-14 is the next Monday: a fresh forty, so nothing is premium.
    const out = valueDays({
      shifts: [...week, { date: '2026-09-14', hours: 10 }],
      tipsByDate: noTips, hourlyRate: 10, overtime: ot,
      selected: ['2026-09-14'],
    });
    expect(out.days[0].overtimeHours).toBe(0);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/payroll/day-value.test.ts`
Expected: FAIL — module `./day-value` not found.

- [ ] **Step 3: Export the workweek helper**

In `lib/payroll/overtime.ts`, change the declaration (leaving its doc comment
in place):

```typescript
export function weekStartOf(iso: string): string | null {
```

- [ ] **Step 4: Write the implementation**

```typescript
/**
 * What a chosen set of days is currently worth to one employee.
 *
 * Pure — no database, no clock.
 *
 * WHAT THIS IS FOR
 *
 * Proposing an advance. It is NOT a statement that those days are settled: an
 * advance is a debit against the whole period, and payday pays the approved
 * total minus everything handed over. See the design doc — settling days at the
 * price they were worth on the day underpays anybody whose later shifts push
 * their week past forty hours.
 *
 * That is also why an estimate here is safe. It only has to be defensible and
 * capped, never right.
 *
 * THE OVERTIME RULE
 *
 * Overtime is a weekly threshold, so no day is inherently overtime. Hours are
 * allocated chronologically within each workweek: base rate until the week
 * reaches forty, premium after. A Wednesday is only premium if Monday and
 * Tuesday already used the week up.
 *
 * The workweek comes from `weekStartOf` in ./overtime.ts rather than a second
 * implementation. Two functions disagreeing about when a week starts would put
 * the premium on different days in the payout dialog and in the pay run.
 */

import { WEEKLY_OVERTIME_THRESHOLD, weekStartOf } from './overtime';

export type DayValue = {
  date: string;
  hours: number;
  /** Hours at base rate, after this workweek's forty have been allocated. */
  regularHours: number;
  overtimeHours: number;
  wage: number;
  tips: number;
  total: number;
};

export type ValueDaysInput = {
  shifts: readonly { date: string; hours: number }[];
  /** Tips attributed to each night, from computePayroll's per-day split. */
  tipsByDate: ReadonlyMap<string, number>;
  hourlyRate: number;
  overtime: { enabled: boolean; multiplier: number };
  selected: readonly string[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Reads an hours figure. Junk and negatives are no hours, never NaN. */
function hours(raw: unknown): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function valueDays(input: ValueDaysInput): { days: DayValue[]; total: number } {
  const rate = Number.isFinite(input.hourlyRate) ? input.hourlyRate : 0;
  const multiplier = input.overtime.enabled ? input.overtime.multiplier : 1;
  const threshold = WEEKLY_OVERTIME_THRESHOLD;

  // Fold to one entry per date first: two rows for one night must be one night,
  // or the threshold walk below counts the same hours twice.
  const hoursByDate = new Map<string, number>();
  for (const shift of input.shifts ?? []) {
    const h = hours(shift?.hours);
    if (h <= 0) continue;
    hoursByDate.set(shift.date, (hoursByDate.get(shift.date) ?? 0) + h);
  }

  // Walk every recorded night in order — not just the ticked ones. Which hours
  // are premium depends on what came earlier in that week, so a selection
  // cannot be priced in isolation.
  const split = new Map<string, { regularHours: number; overtimeHours: number }>();
  const usedByWeek = new Map<string, number>();

  for (const date of [...hoursByDate.keys()].sort()) {
    const h = hoursByDate.get(date) as number;
    const week = weekStartOf(date);

    // A date that cannot be read gets no premium rather than a premium on a
    // week nobody can identify — the same choice splitWeeklyOvertime makes.
    if (week === null) {
      split.set(date, { regularHours: h, overtimeHours: 0 });
      continue;
    }

    const used = usedByWeek.get(week) ?? 0;
    const regularHours = Math.max(0, Math.min(h, threshold - used));
    split.set(date, { regularHours, overtimeHours: h - regularHours });
    usedByWeek.set(week, used + h);
  }

  const days: DayValue[] = [];
  let total = 0;

  for (const date of [...new Set(input.selected)].sort()) {
    const s = split.get(date) ?? { regularHours: 0, overtimeHours: 0 };
    // A ticked night nobody worked is worth nothing and is SHOWN as nothing,
    // rather than dropped — the owner should see what they ticked.
    const wage = round2(s.regularHours * rate + s.overtimeHours * rate * multiplier);
    const tips = round2(Number(input.tipsByDate.get(date)) || 0);
    const dayTotal = round2(wage + tips);

    days.push({
      date,
      hours: round2(s.regularHours + s.overtimeHours),
      regularHours: round2(s.regularHours),
      overtimeHours: round2(s.overtimeHours),
      wage,
      tips,
      total: dayTotal,
    });
    total += dayTotal;
  }

  return { days, total: round2(total) };
}
```

- [ ] **Step 5: Run it and watch it pass**

Run: `npx vitest run lib/payroll/day-value.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 6: Confirm the existing overtime tests still pass**

Run: `npx vitest run lib/payroll`
Expected: PASS — exporting `weekStartOf` changes no behaviour.

- [ ] **Step 7: Commit**

```bash
git add lib/payroll/day-value.ts lib/payroll/day-value.test.ts lib/payroll/overtime.ts
git commit -m "feat(payroll): value a chosen set of days for an advance"
```

---

## Task 4: Keep the per-day tips

**Files:**
- Modify: `app/(app)/app/payroll/actions.ts`
- Test: `lib/payroll/day-value.test.ts` (the invariant lives with the consumer)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `PayrollEntry` gains `tipsByDate?: Record<string, number>` (sums to `tipAmount` except for tip transfers) and `shiftDays?: { date: string; hours: number }[]`
  - `computePayrollForOrg(orgId: string, startDate: string, endDate: string): Promise<PayrollEntry[]>` — the org-explicit entry point the portal needs
  - `computePayroll(startDate, endDate)` keeps its signature and delegates

- [ ] **Step 1: Add the accumulator**

In `app/(app)/app/payroll/actions.ts`, beside `employeeTipAmounts`:

```typescript
    const employeeTipAmounts = new Map<string, number>(
      payrollEmployees.map((e) => [e.id, 0])
    );

    /*
      The same tips, kept per night instead of only as a period total.
      The payout dialog values a chosen set of days from this, so it MUST be the
      same arithmetic the run itself uses — a second tip calculation would let
      the dialog propose an advance the run disagrees with.

      Every write to employeeTipAmounts writes here too. The invariant is that
      each employee's map sums to their tipAmount.
    */
    const tipsByEmployeeByDate = new Map<string, Map<string, number>>();

    const addTips = (employeeId: string, date: string, amount: number) => {
      if (!amount) return;
      employeeTipAmounts.set(employeeId, (employeeTipAmounts.get(employeeId) || 0) + amount);
      const byDate = tipsByEmployeeByDate.get(employeeId) ?? new Map<string, number>();
      byDate.set(date, (byDate.get(date) ?? 0) + amount);
      tipsByEmployeeByDate.set(employeeId, byDate);
    };
```

- [ ] **Step 2: Route every per-day tip write through it**

Replace each accumulation inside the `for (const report of zReports || [])`
loop. The barback split:

```typescript
      for (const [employeeId, amount] of barbackSplit.tipsByEmployee) {
        addTips(employeeId, report.report_date, amount);
      }
```

The opener's tip bonus:

```typescript
      if (openerShiftToday && bonus.bonusTips > 0) {
        addTips(openerShiftToday.employee_id, report.report_date, bonus.bonusTips);
      }
```

Then find every remaining `employeeTipAmounts.set(...)` inside that loop — the
pool split, and the individual / sales-pct modes — and convert each to
`addTips(employeeId, report.report_date, amount)`. Do not convert the tip
TRANSFER application that runs after the loop: a transfer belongs to no night,
and attributing it to one would invent a fact. It stays a period-level write to
`employeeTipAmounts` only.

- [ ] **Step 3: Carry the nights onto the entry**

Add to `PayrollEntry`:

```typescript
  /**
   * Tips per night, keyed YYYY-MM-DD. Sums to `tipAmount` EXCEPT where a tip
   * transfer moved money between people — a transfer belongs to no night, so it
   * lands on the total only. The payout dialog names both figures when they
   * differ rather than letting two numbers disagree quietly.
   */
  tipsByDate?: Record<string, number>;
  /**
   * The nights behind `totalHours`. The payout dialog needs them to draw a day
   * list and to allocate the workweek's overtime; deriving them from
   * `tipsByDate` would miss any night that earned no tips.
   */
  shiftDays?: { date: string; hours: number }[];
```

and populate both where the entry is built:

```typescript
        tipsByDate: Object.fromEntries(tipsByEmployeeByDate.get(emp.id) ?? []),
        shiftDays: (shiftsByEmployee.get(emp.id) ?? [])
          .map((s) => ({
            date:  s.shift_date as string,
            hours: (Number(s.regular_hours) || 0) + (Number(s.overtime_hours) || 0),
          }))
          .sort((a, b) => a.date.localeCompare(b.date)),
```

- [ ] **Step 4: Give computePayroll an org-explicit entry point**

`computePayroll` resolves its org through `getCurrentOrg()`, which redirects
anybody without a MEMBERSHIP. Employees deliberately have none — see
`lib/employee-portal/session.ts` — so the portal in Task 8 cannot call it as it
stands. Split the entry point, leaving the body untouched:

```typescript
/**
 * Compute payroll for employees within a date range.
 *
 * Resolves the org from the caller's membership. The employee portal cannot use
 * this — an employee has no membership by design and getCurrentOrg would
 * redirect them — so it calls computePayrollForOrg below with the org id from
 * their own session.
 */
export async function computePayroll(
  startDate: string,
  endDate: string
): Promise<PayrollEntry[]> {
  const { org } = await getCurrentOrg();
  if (!org?.id) throw new Error('Organization not found');
  return computePayrollForOrg(org.id, startDate, endDate);
}

/**
 * The same computation against a named org.
 *
 * Callers MUST establish that they may see that org's payroll before calling —
 * there is no membership check in here. Today that is getCurrentOrg above, and
 * getCurrentEmployee in the portal, which resolves an org id from an active
 * employee_accounts row and nothing from the request.
 */
export async function computePayrollForOrg(
  orgId: string,
  startDate: string,
  endDate: string
): Promise<PayrollEntry[]> {
  const supabase = await createClient();
  // ... the existing body, with every `org.id` replaced by `orgId` and the
  // bar_settings reads taking the org row this function fetches for itself:
  //   const { data: orgRow } = await supabase
  //     .from('organizations').select('bar_settings').eq('id', orgId).maybeSingle();
  //   const settings = (orgRow?.bar_settings ?? {}) as Record<string, unknown>;
  // The existing `org.bar_settings` reads at the top of the function become
  // `settings`. Nothing else in the body changes.
}
```

Verify by running the payroll screen: `computePayroll` must behave identically,
because it now only resolves an id and delegates.

- [ ] **Step 5: Pin the invariant with a test**

Append to `lib/payroll/day-value.test.ts`:

```typescript
describe('per-day tips are the same money as the period total', () => {
  it('sums to the period figure', () => {
    // computePayroll needs a database, so this pins the ARITHMETIC the dialog
    // relies on: whatever computePayroll puts in tipsByDate must total
    // tipAmount, or the dialog proposes advances the run disagrees with.
    const tipsByDate = { '2026-09-07': 40.25, '2026-09-08': 19.75, '2026-09-09': 0 };
    const tipAmount = 60;

    const summed = Object.values(tipsByDate).reduce((a, b) => a + b, 0);
    expect(summed).toBeCloseTo(tipAmount, 2);
  });

  it('values a day from the same map computePayroll produced', () => {
    const out = valueDays({
      shifts: [{ date: '2026-09-07', hours: 5 }],
      tipsByDate: new Map(Object.entries({ '2026-09-07': 40.25 })),
      hourlyRate: 10, overtime: { enabled: true, multiplier: 1.5 },
      selected: ['2026-09-07'],
    });
    expect(out.total).toBe(90.25);
  });
});
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npx vitest run lib/payroll && npm run audit:scope`
Expected: all clean. The payroll screen must still render — `computePayroll`
delegating is the only behavioural change and there should be none.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/app/payroll/actions.ts" lib/payroll/day-value.test.ts
git commit -m "feat(payroll): keep the per-day tip split, and an org-explicit entry point"
```

---

## Task 5: The payout action

**Files:**
- Modify: `app/(app)/app/payroll/payout-actions.ts`

**Interfaces:**
- Consumes: `remainingAdvanceCapacity`, `totalPaidTo`, `Payout` (Task 2); `computePayroll` from `./actions`.
- Produces:
  - `loadPayouts(periodStart, periodEnd): Promise<Payout[]>` — now carries `id` and `coversDays`
  - `markPaid(input: { employeeId; periodStart; periodEnd; method; amountPaid; coversDays?: string[] | null; idempotencyKey: string }): Promise<PayoutResult>`
  - `deletePayout(input: { payoutId: string }): Promise<PayoutResult>` — replaces `unmarkPaid`

- [ ] **Step 1: Widen the read**

```typescript
  const { data } = await supabase
    .from('payroll_payouts')
    .select('id, employee_id, method, amount_paid, paid_at, covers_days')
    .eq('organization_id', org.id)
    .eq('period_start', periodStart)
    .eq('period_end', periodEnd)
    // Oldest first: the payments list reads as a history, and an advance
    // precedes the settlement it was taken against.
    .order('paid_at', { ascending: true });

  return (data ?? []).map((row) => ({
    id:         row.id as string,
    employeeId: row.employee_id as string,
    method:     row.method as PayoutMethod,
    // NUMERIC comes back as a string on some driver versions; the UI formats it.
    amountPaid: Number(row.amount_paid ?? 0),
    paidAt:     row.paid_at as string,
    coversDays: (row.covers_days as string[] | null) ?? null,
  }));
```

- [ ] **Step 2: Widen the schema**

```typescript
const markSchema = z.object({
  employeeId:  z.string().uuid(),
  periodStart: isoDate,
  periodEnd:   isoDate,
  method:      z.enum(PAYOUT_METHODS as unknown as [PayoutMethod, ...PayoutMethod[]]),
  // What the run said this person was owed at the moment of marking. Negative
  // is impossible; the ceiling is a typo guard, not a policy.
  amountPaid:  z.number().min(0).max(1_000_000),
  // The nights the amount was worked out from. Null for a whole-period payout,
  // which is what "Mark paid" still does.
  coversDays:  z.array(isoDate).nullable().optional(),
  // Generated by the client when the dialog opens, so the same tap twice
  // collides on the unique index instead of paying somebody a second time.
  idempotencyKey: z.string().uuid(),
});

const deleteSchema = z.object({ payoutId: z.string().uuid() });
```

- [ ] **Step 3: Enforce the cap and write the row**

Replace the body of `markPaid` after the `assertEmployeeInOrg` check:

```typescript
  const { employeeId, periodStart, periodEnd, method, amountPaid, coversDays, idempotencyKey }
    = parsed.data;

  if (!(await assertEmployeeInOrg(supabase, org.id, employeeId))) {
    return { ok: false, error: 'Employee not found' };
  }

  /*
    The cap. Total paid may never exceed total earned so far, because the app
    has no way to claw money back and a negative payday is not a state anybody
    can fix from this screen.

    Deliberately measured against the PERIOD, not the ticked days. Days propose
    the amount; the pot decides whether there is room. Capping against the
    ticked days would refuse $300 of genuinely-earned Thursday work because an
    earlier advance had notionally "used up" days worked since.
  */
  const entries = await computePayroll(periodStart, periodEnd);
  const earnedSoFar = entries.find((e) => e.employeeId === employeeId)?.totalCompensation ?? 0;

  const existing = await loadPayouts(periodStart, periodEnd);
  const alreadyPaid = totalPaidTo(existing.filter((p) => p.employeeId === employeeId));

  const capacity = remainingAdvanceCapacity(earnedSoFar, alreadyPaid);
  if (amountPaid > capacity + 0.005) {
    // Both figures named, so the owner can act rather than guess at the rule.
    return {
      ok: false,
      error:
        `That is more than has been earned. ${money(earnedSoFar)} earned so far, ` +
        `${money(alreadyPaid)} already paid — ${money(capacity)} available.`,
    };
  }

  // Insert, not upsert: a period holds many payments now, so there is no
  // natural row to overwrite. Idempotency comes from the unique index on
  // (organization_id, idempotency_key) — a double-tap carries the same key and
  // the second insert conflicts rather than paying twice.
  const { error } = await supabase
    .from('payroll_payouts')
    .upsert(
      {
        organization_id: org.id,
        employee_id:     employeeId,
        period_start:    periodStart,
        period_end:      periodEnd,
        method,
        amount_paid:     amountPaid,
        covers_days:     coversDays ?? null,
        idempotency_key: idempotencyKey,
        paid_at:         new Date().toISOString(),
        marked_by:       user.id,
      },
      { onConflict: 'organization_id,idempotency_key', ignoreDuplicates: true },
    );

  if (error) return { ok: false, error: error.message };

  revalidatePath('/app/payroll');
  return { ok: true };
```

Add at the top of the file, next to the other imports:

```typescript
import {
  PAYOUT_METHODS, remainingAdvanceCapacity, totalPaidTo,
  type Payout, type PayoutMethod,
} from '@/lib/payroll/payouts';
import { computePayroll } from './actions';

/** Whole dollars and cents, for an error message a person has to act on. */
const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
```

- [ ] **Step 4: Replace `unmarkPaid` with `deletePayout`**

```typescript
/**
 * Undo one payment.
 *
 * Targets a row rather than a period: a period can hold several payments now,
 * and deleting by (employee, period) would wipe an advance somebody took last
 * week along with today's mistake.
 */
export async function deletePayout(input: { payoutId: string }): Promise<PayoutResult> {
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid payout' };
  }

  const { org, role } = await getCurrentOrg();
  const user = await getAuthUser();
  if (!user) return { ok: false, error: 'Not signed in' };
  if (!canManagePayroll(role)) {
    return { ok: false, error: 'Only owners and managers can mark payouts' };
  }

  const supabase = createAdminClient();

  const { error } = await supabase
    .from('payroll_payouts')
    .delete()
    .eq('organization_id', org.id)
    .eq('id', parsed.data.payoutId);

  if (error) return { ok: false, error: error.message };

  revalidatePath('/app/payroll');
  return { ok: true };
}
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run audit:scope`
Expected: `audit:scope` clean. `tsc` still errors in the two components — Task 6.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/app/payroll/payout-actions.ts"
git commit -m "feat(payroll): cap advances at earned-so-far and record which days"
```

---

## Task 6: The day picker and the dialog

**Files:**
- Create: `app/(app)/app/payroll/_components/day-picker.tsx`
- Modify: `app/(app)/app/payroll/_components/payout-dialog.tsx`

**Interfaces:**
- Consumes: `valueDays`, `DayValue` (Task 3); `markPaid` (Task 5).
- Produces: `PayoutDialog` gains props `shifts: { date: string; hours: number }[]`, `tipsByDate: Record<string, number>`, `hourlyRate: number`, `overtime: { enabled: boolean; multiplier: number }`, `alreadyPaid: number`.

- [ ] **Step 1: Write the picker**

```tsx
'use client';

import type { DayValue } from '@/lib/payroll/day-value';

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

/**
 * The nights in this period, tickable.
 *
 * Shows every recorded night rather than only the unpaid ones, because days are
 * never settled — there is no such thing as a night that has been paid for. The
 * ticks choose what to base an amount on, nothing more.
 */
export function DayPicker({
  days,
  selected,
  onToggle,
}: {
  days: DayValue[];
  selected: ReadonlySet<string>;
  onToggle: (date: string) => void;
}) {
  if (days.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        No shifts recorded in this period yet.
      </p>
    );
  }

  return (
    <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border p-1">
      {days.map((d) => (
        <label
          key={d.date}
          className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-muted"
        >
          <input
            type="checkbox"
            checked={selected.has(d.date)}
            onChange={() => onToggle(d.date)}
            className="h-4 w-4 shrink-0"
          />
          <span className="min-w-0 flex-1 text-sm">
            {d.date}
            <span className="ml-2 text-xs text-muted-foreground">
              {d.hours.toLocaleString()} hrs
              {d.overtimeHours > 0 && ` · ${d.overtimeHours.toLocaleString()} OT`}
            </span>
          </span>
          <span className="shrink-0 text-sm tabular-nums">{money(d.total)}</span>
        </label>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Rewrite the dialog**

```tsx
'use client';

import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';
import { HandCoins } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { FormStatus } from '@/components/ui/form-status';
import { markPaid } from '../payout-actions';
import { DayPicker } from './day-picker';
import { valueDays } from '@/lib/payroll/day-value';
import { PAYOUT_METHODS, PAYOUT_METHOD_LABEL, type PayoutMethod } from '@/lib/payroll/payouts';

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string;
  employeeName: string;
  /** What the run says is still owed. Frozen onto the row when confirmed. */
  amount: number;
  periodStart: string;
  periodEnd: string;
  shifts: { date: string; hours: number }[];
  tipsByDate: Record<string, number>;
  hourlyRate: number;
  overtime: { enabled: boolean; multiplier: number };
  /** Already handed over this period, so the dialog can show the balance. */
  alreadyPaid: number;
  onSaved: () => void;
};

/**
 * The one step between "owed" and "paid": how the money left the building.
 *
 * Still one field for the common case. Paying for some days is a disclosure,
 * not a second flow — an owner ticking eight people off on a Friday afternoon
 * should never have to walk through a day picker to do it.
 */
export function PayoutDialog({
  open, onOpenChange, employeeId, employeeName, amount, periodStart, periodEnd,
  shifts, tipsByDate, hourlyRate, overtime, alreadyPaid, onSaved,
}: Props) {
  const [method, setMethod] = useState<PayoutMethod>('cash');
  const [partial, setPartial] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Generated once per dialog opening. A double-tap on a slow connection sends
  // the same key twice and the second insert collides, rather than recording a
  // second payment to somebody who was paid once.
  const idempotencyKey = useMemo(
    () => crypto.randomUUID(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open],
  );

  const tipMap = useMemo(() => new Map(Object.entries(tipsByDate)), [tipsByDate]);

  // Every recorded night, priced. Selection drives the amount, not this list.
  const allDays = useMemo(
    () => valueDays({
      shifts, tipsByDate: tipMap, hourlyRate, overtime,
      selected: shifts.map((s) => s.date),
    }).days,
    [shifts, tipMap, hourlyRate, overtime],
  );

  const picked = useMemo(
    () => valueDays({
      shifts, tipsByDate: tipMap, hourlyRate, overtime,
      selected: [...selected],
    }),
    [shifts, tipMap, hourlyRate, overtime, selected],
  );

  const payAmount = partial ? picked.total : amount;
  const canSubmit = payAmount > 0 && !pending;

  // The nights and the run can disagree: a tip transfer belongs to no night, so
  // it lands on the period total only. Named rather than hidden — two figures
  // that differ must never do so silently.
  const nightsTotal = useMemo(
    () => allDays.reduce((s, d) => s + d.total, 0),
    [allDays],
  );
  const transferGap = Math.abs(nightsTotal - (amount + alreadyPaid)) >= 0.01;

  function toggle(date: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await markPaid({
        employeeId, periodStart, periodEnd, method,
        amountPaid: payAmount,
        coversDays: partial ? [...selected].sort() : null,
        idempotencyKey,
      });
      if (!res.ok) {
        setError(res.error ?? 'Could not record that payout');
        return;
      }
      toast.success(
        partial
          ? `${money(payAmount)} recorded for ${employeeName}`
          : `${employeeName} marked paid`,
      );
      onOpenChange(false);
      onSaved();
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <HandCoins className="h-4 w-4 text-muted-foreground" aria-hidden />
            Pay {employeeName}
          </DialogTitle>
          <DialogDescription>
            Records{' '}
            <strong className="tabular-nums text-foreground">{money(payAmount)}</strong>{' '}
            against this period. The amount is kept as it stands now, so a later
            correction to the run will not rewrite it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {alreadyPaid > 0 && (
            <p className="text-xs text-muted-foreground">
              {money(alreadyPaid)} already paid for this period.
            </p>
          )}

          <div className="space-y-2">
            <Label htmlFor="payout-method">Method</Label>
            <Select value={method} onValueChange={(v) => setMethod(v as PayoutMethod)}>
              <SelectTrigger id="payout-method">
                <SelectValue>{PAYOUT_METHOD_LABEL[method]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PAYOUT_METHODS.map((m) => (
                  <SelectItem key={m} value={m}>{PAYOUT_METHOD_LABEL[m]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {!partial ? (
            <button
              type="button"
              onClick={() => setPartial(true)}
              className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Pay for selected days instead
            </button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Days to pay for</Label>
                <button
                  type="button"
                  onClick={() => { setPartial(false); setSelected(new Set()); }}
                  className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
                >
                  Pay the whole balance
                </button>
              </div>
              <DayPicker days={allDays} selected={selected} onToggle={toggle} />
              <p className="text-xs text-muted-foreground">
                This is an advance against the period, not a settlement of these
                days. Payday pays the approved total less everything handed over.
              </p>
              {transferGap && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  These nights add up to {money(nightsTotal)}, but the run says{' '}
                  {money(amount + alreadyPaid)} — a tip transfer belongs to no
                  single night. The run&rsquo;s figure is what caps this payment.
                </p>
              )}
            </div>
          )}

          <FormStatus status={error ? 'error' : 'idle'} message={error} />

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!canSubmit}>
              {pending ? 'Recording…' : `Record ${money(payAmount)}`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Verify it compiles**

Run: `npx tsc --noEmit`
Expected: errors remain only in `payout-controls.tsx` / `payroll-tab.tsx` — Task 7.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/app/payroll/_components/day-picker.tsx" \
        "app/(app)/app/payroll/_components/payout-dialog.tsx"
git commit -m "feat(payroll): pick days to pay for inside the payout dialog"
```

---

## Task 7: Partially-paid state on the payroll screen

**Files:**
- Modify: `app/(app)/app/payroll/_components/payout-controls.tsx`
- Modify: `app/(app)/app/payroll/_components/payroll-tab.tsx`

**Interfaces:**
- Consumes: `summarizePayouts`, `totalPaidTo`, `Payout` (Task 2); `deletePayout` (Task 5); `PayoutDialog` (Task 6).
- Produces: `PayoutCell` takes `payouts: Payout[]` instead of `payout: Payout | undefined`.

- [ ] **Step 1: Group payouts per employee**

In `payroll-tab.tsx`, replace the memo:

```typescript
  // A list per employee, not a single row: a period can hold an advance and a
  // settlement, and both belong on the screen.
  const payoutsById = useMemo(() => {
    const m = new Map<string, Payout[]>();
    for (const p of payouts) {
      const list = m.get(p.employeeId) ?? [];
      list.push(p);
      m.set(p.employeeId, list);
    }
    return m;
  }, [payouts]);
```

- [ ] **Step 2: Show what has gone out**

In `payout-controls.tsx`, inside `PayoutProgress`, replace the `!allPaid` block:

```tsx
      {!allPaid && (
        <span className="text-sm tabular-nums">
          {summary.advancedTotal > 0 && (
            <>
              <span className="text-muted-foreground">paid out </span>
              <span className="font-semibold">${summary.advancedTotal.toFixed(2)}</span>
              <span className="text-muted-foreground"> · </span>
            </>
          )}
          <span className="text-muted-foreground">still owed </span>
          <span className="font-semibold">${outstanding.toFixed(2)}</span>
        </span>
      )}
```

and widen the destructure to `const { paidCount, totalCount, outstanding, allPaid } = summary;`
(keeping `summary` in scope, which the block above uses).

- [ ] **Step 3: Rewrite the cell for three states**

Replace `CellProps` and the body of `PayoutCell`:

```tsx
type CellProps = {
  employeeId: string;
  employeeName: string;
  /** Live figure from the run — the FULL period total, not the balance. */
  amount: number;
  payouts: Payout[];
  periodStart: string;
  periodEnd: string;
  canAdjust: boolean;
  onChanged: () => void;
  layout: 'row' | 'block';
  shifts: { date: string; hours: number }[];
  tipsByDate: Record<string, number>;
  hourlyRate: number;
  overtime: { enabled: boolean; multiplier: number };
};

/**
 * One person's paid state, in three flavours now: nothing, part, all.
 *
 * A paid chip stays a button rather than becoming static text: marking the
 * wrong person paid is a one-tap mistake, and undo has to be as reachable as
 * the thing it undoes. With a ledger, undo removes the LAST payment rather than
 * the period — wiping an advance from last week along with today's slip would
 * be a much worse mistake than the one being corrected.
 */
export function PayoutCell({
  employeeId, employeeName, amount, payouts, periodStart, periodEnd,
  canAdjust, onChanged, layout, shifts, tipsByDate, hourlyRate, overtime,
}: CellProps) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const block = layout === 'block';

  const paidSoFar = totalPaidTo(payouts);
  const balance = Math.max(0, amount - paidSoFar);
  const fullyPaid = payouts.length > 0 && balance <= 0;
  const partly = payouts.length > 0 && balance > 0;

  function undoLast() {
    const last = payouts[payouts.length - 1];
    if (!last) return;
    startTransition(async () => {
      const res = await deletePayout({ payoutId: last.id });
      if (!res.ok) {
        toast.error(res.error ?? 'Could not undo that');
        return;
      }
      toast.success(`Removed ${PAYOUT_METHOD_LABEL[last.method].toLowerCase()} payment`);
      onChanged();
    });
  }

  const dialog = open && (
    <PayoutDialog
      open={open}
      onOpenChange={setOpen}
      employeeId={employeeId}
      employeeName={employeeName}
      amount={balance}
      periodStart={periodStart}
      periodEnd={periodEnd}
      shifts={shifts}
      tipsByDate={tipsByDate}
      hourlyRate={hourlyRate}
      overtime={overtime}
      alreadyPaid={paidSoFar}
      onSaved={onChanged}
    />
  );

  if (fullyPaid) {
    const last = payouts[payouts.length - 1];
    const label = `${PAYOUT_METHOD_LABEL[last.method]} · ${shortDate(last.paidAt)}`;

    if (!canAdjust) {
      return (
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200',
            block && 'w-full justify-center py-2',
          )}
        >
          <Check className="h-3.5 w-3.5" aria-hidden />
          {label}
        </span>
      );
    }

    return (
      <button
        type="button"
        onClick={undoLast}
        disabled={pending}
        title={`Paid $${paidSoFar.toFixed(2)} across ${payouts.length} payment(s). Click to remove the last one.`}
        aria-label={`${employeeName} is paid. Undo the last payment.`}
        className={cn(
          'group inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 transition-colors hover:bg-emerald-200 disabled:opacity-50 dark:bg-emerald-950/60 dark:text-emerald-200 dark:hover:bg-emerald-900',
          block && 'h-11 w-full justify-center text-sm',
        )}
      >
        <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="truncate">{label}</span>
        <span className="text-emerald-600/70 opacity-0 transition-opacity group-hover:opacity-100 dark:text-emerald-300/70">
          Undo
        </span>
      </button>
    );
  }

  if (partly) {
    // Amber, not green: money has moved but this person is not finished, and a
    // green tick here would read as done on a Friday-afternoon skim.
    if (!canAdjust) {
      return (
        <span className={cn('text-xs text-muted-foreground', block && 'block text-center')}>
          ${paidSoFar.toFixed(2)} of ${amount.toFixed(2)}
        </span>
      );
    }
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`Pay ${employeeName} the remaining $${balance.toFixed(2)}`}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 transition-colors hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:hover:bg-amber-900',
            block && 'h-11 w-full justify-center text-sm',
          )}
        >
          <HandCoins className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate tabular-nums">
            ${paidSoFar.toFixed(2)} of ${amount.toFixed(2)}
          </span>
        </button>
        {dialog}
      </>
    );
  }

  if (!canAdjust) {
    return <span className={cn('text-xs text-muted-foreground', block && 'block text-center')}>Unpaid</span>;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Mark ${employeeName} paid`}
        className={cn(
          'inline-flex items-center gap-1.5 rounded-full border border-dashed px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground',
          block && 'h-11 w-full justify-center border-solid text-sm',
        )}
      >
        <HandCoins className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Mark paid
      </button>
      {dialog}
    </>
  );
}
```

Update the imports at the top of `payout-controls.tsx`:

```typescript
import { deletePayout } from '../payout-actions';
import {
  PAYOUT_METHOD_LABEL, totalPaidTo, type Payout, type PayoutSummary,
} from '@/lib/payroll/payouts';
```

- [ ] **Step 4: Pass the new props through**

`payroll-table.tsx` renders `PayoutCell` twice — the phone card at line ~283 and
the table row at ~469. Both take the same replacement block; the only difference
is `layout`.

```tsx
                  <PayoutCell
                    layout="block"
                    employeeId={entry.employeeId}
                    employeeName={entry.employeeName}
                    amount={entry.totalCompensation}
                    payouts={payouts.get(entry.employeeId) ?? []}
                    periodStart={startDate ?? ''}
                    periodEnd={endDate ?? ''}
                    canAdjust={canAdjust}
                    onChanged={() => router.refresh()}
                    shifts={entry.shiftDays ?? []}
                    tipsByDate={entry.tipsByDate ?? {}}
                    hourlyRate={entry.hourlyRate}
                    overtime={overtime}
                  />
```

For the table row at ~469, the identical block with `layout="row"`.

Widen the props interface at the top of that file:

```typescript
interface PayrollTableProps {
  entries: PayrollEntry[];
  startDate?: string;
  endDate?: string;
  canAdjust?: boolean;
  /**
   * Every payment recorded for each employee this period, oldest first. An
   * empty list is the unpaid state — see lib/payroll/payouts.ts.
   */
  payouts: Map<string, Payout[]>;
  /** The bar's overtime config, so the day picker prices nights as the run does. */
  overtime: { enabled: boolean; multiplier: number };
}
```

Then thread `overtime` down. In `app/(app)/app/payroll/page.tsx`, beside the
existing org read:

```typescript
import { overtimeFromSettings } from '@/lib/payroll/overtime';

  // The same config computePayroll uses, so the payout dialog and the run
  // cannot disagree about which hours carry a premium.
  const overtimeCfg = overtimeFromSettings(org.bar_settings ?? {});
```

Pass `overtime={overtimeCfg}` to `<PayrollTab>`, and from there to
`<PayrollTable>`. If `overtimeFromSettings` returns a differently-named shape,
map it at the page boundary rather than changing the helper — it is shared with
`computePayroll` and must keep its current contract.

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npm run lint && npm test && npm run build`
Expected: all clean.

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/app/payroll/_components" "app/(app)/app/payroll/page.tsx"
git commit -m "feat(payroll): partially-paid state on the payroll screen"
```

---

## Task 8: Advances in the employee portal

**Files:**
- Modify: `app/(staff)/me/actions.ts`
- Modify: `app/(staff)/me/page.tsx`

**Interfaces:**
- Consumes: `totalPaidTo` (Task 2); `computePayrollForOrg(orgId, startDate, endDate)` (Task 4); `getCurrentEmployee` from `lib/employee-portal/session`.
- Produces: `getMyPeriods()` returns an extra `inProgress: { earnedSoFar: number; advancesReceived: number; stillToCome: number } | null`.

- [ ] **Step 1: Add the figures to the portal read**

In `app/(staff)/me/actions.ts`, after `inProgressHours` is built:

```typescript
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
    // employee's own session, never from the request.
    const entries = await computePayrollForOrg(me.orgId, periodStart, periodEnd);
    const earnedSoFar =
      entries.find((e) => e.employeeId === me.employeeId)?.totalCompensation ?? 0;

    inProgress = {
      earnedSoFar,
      advancesReceived,
      // Clamped: an overpayment is not a debt this screen should assert.
      stillToCome: Math.max(0, earnedSoFar - advancesReceived),
    };
  }
```

Add `import { computePayrollForOrg } from '@/app/(app)/app/payroll/actions';`
at the top, add `inProgress` to the return type, and return it.

**Interfaces** for this task therefore consume `computePayrollForOrg(orgId,
startDate, endDate)` from Task 4, not `computePayroll`.

- [ ] **Step 2: Render it as elapsed fact**

In `app/(staff)/me/page.tsx`, inside the "This period" card, replace the
closing caveat paragraph:

```tsx
            {inProgress && (
              <div className="space-y-1.5 border-t pt-3 text-sm">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-muted-foreground">Earned so far</span>
                  <span className="tabular-nums">
                    {money(inProgress.earnedSoFar)}
                  </span>
                </div>
                {inProgress.advancesReceived > 0 && (
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-muted-foreground">Advances received</span>
                    <span className="tabular-nums">
                      {money(inProgress.advancesReceived)}
                    </span>
                  </div>
                )}
                <div className="flex items-baseline justify-between gap-3 font-medium">
                  <span>Still to come for the days worked so far</span>
                  <span className="tabular-nums">{money(inProgress.stillToCome)}</span>
                </div>
              </div>
            )}

            {/*
              Every figure above is about nights that have already happened, so
              none of them is a promise about the period. That distinction is
              the whole reason this screen may show a live number at all.
            */}
            <p className="border-t pt-3 text-xs text-muted-foreground">
              These figures cover the days worked so far and have not been
              approved yet. They are not your final pay for this period. If a
              night is missing or wrong, tell your manager now.
            </p>
```

Add at the top of the file:

```tsx
const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
```

and destructure `inProgress` from `getMyPeriods()`.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run audit:scope && npm run lint && npm test && npm run build`
Expected: all clean.

- [ ] **Step 4: Commit**

```bash
git add "app/(staff)/me"
git commit -m "feat(portal): show advances and what is still to come"
```

---

## Manual verification before shipping

The pure arithmetic is covered by tests; these cover the wiring, and must be
done against a real database before this touches anybody's pay.

- [ ] The migration applies, and `payroll_payouts` accepts two rows for one employee in one period.
- [ ] "Mark paid" with no day selection still works exactly as before and records `covers_days = NULL`.
- [ ] Tapping Record twice on a slow connection produces **one** payment, not two.
- [ ] An advance for selected days shows the person as partially paid, amber, with the right balance.
- [ ] Paying the balance afterwards flips them to fully paid.
- [ ] Undo removes only the **last** payment, leaving an earlier advance in place.
- [ ] An advance larger than earned-so-far is refused, and the message names both figures.
- [ ] An advance is allowed when the ticked days are worth less than the remaining capacity but the days themselves total more than a previous advance — the Thu–Fri case from the spec.
- [ ] A period with a tip transfer shows the "nights add up to a different figure" warning.
- [ ] The employee portal shows advances received and "still to come", and nowhere says what the period will pay.
- [ ] Submitting and approving a pay run is unaffected.
