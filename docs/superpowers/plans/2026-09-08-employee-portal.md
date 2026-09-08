# Employee Portal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a bar employee log in and see their own hours and approved pay, without ever gaining access to another employee's figures or the manager app.

**Architecture:** Employees authenticate through Supabase Auth but get a row in a new `employee_accounts` link table instead of a `memberships` row, so none of the 41 existing membership-keyed RLS policies apply to them. A dedicated `getCurrentEmployee()` resolver returns `{orgId, employeeId}` and every portal query scopes on both. The portal renders `payroll_runs.snapshot` only — never a live recompute — which means the snapshot must first be widened to carry the full pay breakdown.

**Tech Stack:** Next.js 16 (App Router, server components, server actions), Supabase (Postgres + Auth + RLS), TypeScript, vitest, Base UI (`components/ui`), Tailwind.

**Spec:** `docs/superpowers/specs/2026-09-08-employee-portal-design.md`

## Global Constraints

- **Employees never get a `memberships` row.** `ensure_full_schema.sql` creates `FOR ALL` policies over `employees`, `employee_shifts`, `direct_deposit_accounts` and 12 other tables keyed on `memberships`. A membership row grants read *and write* on all of them.
- **Every `createAdminClient()` query must filter `.eq('organization_id', ...)`** or carry an `// admin-scope-ok:` comment explaining why. `npm run audit:scope` fails the build otherwise.
- **Portal queries scope on BOTH `organization_id` and `employee_id`** taken from the session — never from a request parameter.
- **The portal reads `payroll_runs.snapshot` and never calls `computePayroll()`.** A recomputed figure is not the figure that was approved.
- **`diffPayrollRun` must keep comparing only** `employeeId, employeeName, totalHours, totalCompensation`. Approval staleness semantics do not change in this work.
- **NULL is not zero.** Follow the existing convention: a missing figure renders as `—`, never `$0`.
- Commands: `npx tsc --noEmit`, `npm test`, `npm run audit:scope`, `npm run lint`.
- Money in the UI uses the existing `money()` helpers; do not add a fourth formatter.

---

## File Structure

**Create:**
- `supabase/migrations/20260908000000_add_employee_accounts.sql` — the link table, join code column, indexes, RLS.
- `lib/employee-portal/claim.ts` — pure name normalisation and matching.
- `lib/employee-portal/claim.test.ts`
- `lib/employee-portal/stub.ts` — pure projection of a `SnapshotEntry` into a pay stub, including legacy four-field entries.
- `lib/employee-portal/stub.test.ts`
- `lib/employee-portal/session.ts` — `getCurrentEmployee()`, server-only.
- `lib/employee-portal/session.test.ts`
- `app/(staff)/layout.tsx` — route-group layout, `robots: noindex`.
- `app/(staff)/me/page.tsx` — the portal.
- `app/(staff)/me/actions.ts` — portal reads.
- `app/(staff)/me/_components/period-card.tsx`
- `app/(staff)/me/_components/pending-screen.tsx`
- `app/(auth)/join/page.tsx` — staff sign-up.
- `app/(auth)/join/join-form.tsx`
- `app/(auth)/join/actions.ts` — the claim server action.
- `app/(app)/app/employees/_components/pending-claims.tsx` — manager approval queue.
- `app/(app)/app/employees/claim-actions.ts` — approve / reject / revoke.

**Modify:**
- `lib/payroll/run-diff.ts` — widen `SnapshotEntry` with optional fields.
- `app/(app)/app/payroll/approval-actions.ts:36-45` — `toSnapshot` writes the full entry.
- `lib/notifications/types.ts` — add `staff.claim_pending`.
- `lib/org.ts:133-157` — send an employee-only user to `/me` instead of `/setup`.
- `proxy.ts:26-37` — gate `/me` as well as `/app`.
- `app/(app)/app/employees/page.tsx` — render the pending-claims queue.
- `app/(app)/app/settings/_components/team-tab.tsx` — join code controls.

---

## Task 1: `employee_accounts` migration

**Files:**
- Create: `supabase/migrations/20260908000000_add_employee_accounts.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: table `employee_accounts` with columns `id, organization_id, employee_id (nullable), user_id, status, claimed_name, requested_at, decided_by, decided_at`; column `organizations.staff_join_code TEXT`.

- [ ] **Step 1: Write the migration**

```sql
-- ── Employee portal accounts ─────────────────────────────────────────────────
-- An employee is NOT an org member. ensure_full_schema.sql creates FOR ALL
-- policies over employees, employee_shifts and direct_deposit_accounts keyed on
-- the memberships table, so a membership row for a bartender would hand them
-- every colleague's bank details and the ability to edit their own hours.
-- This table links an auth user to one employees row and nothing else.

CREATE TABLE IF NOT EXISTS employee_accounts (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Nullable on purpose: a claim whose typed name matched two employees is
  -- recorded unresolved for a manager to settle. The CHECK below is what stops
  -- an unresolved claim from ever becoming a login.
  employee_id     UUID        REFERENCES employees(id) ON DELETE CASCADE,
  user_id         UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- A real status column, unlike payroll_payouts where absence means unpaid.
  -- A rejected claim must be distinguishable from one never made, or a manager
  -- who declines an impostor watches them reappear in the queue forever.
  status          TEXT        NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'active', 'revoked')),

  -- What the person typed, not the employee's name. When a manager reviews a
  -- claim the useful question is whether this person typed something that
  -- plausibly identifies them, and the typed string is the evidence.
  claimed_name    TEXT        NOT NULL,

  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_by      UUID        REFERENCES auth.users(id),
  decided_at      TIMESTAMPTZ,

  CONSTRAINT active_accounts_name_an_employee
    CHECK (status <> 'active' OR employee_id IS NOT NULL)
);

-- One live account per employee record: two people cannot both be Dana.
-- Postgres treats NULLs as distinct here, so several unresolved claims coexist.
CREATE UNIQUE INDEX IF NOT EXISTS ux_employee_account_employee
  ON employee_accounts (organization_id, employee_id)
  WHERE status <> 'revoked';

-- One claim per person per bar, so a double-tapped sign-up on a slow phone is
-- an idempotent no-op rather than a second pending row.
CREATE UNIQUE INDEX IF NOT EXISTS ux_employee_account_user
  ON employee_accounts (user_id, organization_id);

-- The manager queue's only read.
CREATE INDEX IF NOT EXISTS ix_employee_account_pending
  ON employee_accounts (organization_id, status, requested_at DESC);

ALTER TABLE employee_accounts ENABLE ROW LEVEL SECURITY;

-- An employee may see their own row and nothing else — this is what powers the
-- "waiting for approval" screen. Every other access is server-side through the
-- service-role client, scoped by hand.
CREATE POLICY "employees read their own account"
  ON employee_accounts FOR SELECT
  USING (user_id = auth.uid());

-- ── Staff join code ──────────────────────────────────────────────────────────
-- NULL means staff sign-up is OFF for that bar, which is what every existing
-- org gets. Turning it on is a deliberate act in Settings.
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS staff_join_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_org_staff_join_code
  ON organizations (staff_join_code)
  WHERE staff_join_code IS NOT NULL;
```

- [ ] **Step 2: Verify the SQL parses**

Run: `npx supabase db lint --file supabase/migrations/20260908000000_add_employee_accounts.sql`
Expected: no errors. If the Supabase CLI is unavailable in this environment, skip and rely on Task 2's tests, noting it in the commit message.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260908000000_add_employee_accounts.sql
git commit -m "feat(portal): employee_accounts link table and staff join code"
```

---

## Task 2: Name matching for claims

**Files:**
- Create: `lib/employee-portal/claim.ts`
- Test: `lib/employee-portal/claim.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `normaliseName(raw: string): string`
  - `type ClaimCandidate = { id: string; name: string }`
  - `type ClaimMatch = { kind: 'one'; employeeId: string } | { kind: 'none' } | { kind: 'ambiguous' }`
  - `matchEmployeeName(typed: string, roster: readonly ClaimCandidate[]): ClaimMatch`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { normaliseName, matchEmployeeName } from './claim';

const roster = [
  { id: 'a', name: 'Dana Whitfield' },
  { id: 'b', name: 'Dave Ramos' },
  { id: 'c', name: 'Dave Ramos' },
];

describe('normaliseName', () => {
  it('ignores case, surrounding space and doubled spaces', () => {
    expect(normaliseName('  Dana   WHITFIELD ')).toBe('dana whitfield');
  });
});

describe('matchEmployeeName', () => {
  it('matches one employee by normalised name', () => {
    expect(matchEmployeeName('  dana whitfield ', roster))
      .toEqual({ kind: 'one', employeeId: 'a' });
  });

  it('reports no match rather than guessing at a partial one', () => {
    // "Dana" is not Dana Whitfield. A prefix match here would let someone
    // claim a colleague by typing a common first name.
    expect(matchEmployeeName('Dana', roster)).toEqual({ kind: 'none' });
  });

  it('reports ambiguity when two employees share a name', () => {
    expect(matchEmployeeName('Dave Ramos', roster)).toEqual({ kind: 'ambiguous' });
  });

  it('treats an empty typed name as no match', () => {
    expect(matchEmployeeName('   ', roster)).toEqual({ kind: 'none' });
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `npx vitest run lib/employee-portal/claim.test.ts`
Expected: FAIL — "Failed to load ... claim" (the module does not exist yet).

- [ ] **Step 3: Write the implementation**

```typescript
/**
 * Matching a typed name against the roster.
 *
 * Pure — no database, no clock.
 *
 * EXACT, NOT FUZZY. The sign-up form asks the person to type their own name
 * rather than showing a roster, because a join code ends up written on a
 * whiteboard and a list would turn it into a staff directory. That only holds
 * if matching is strict: a prefix or fuzzy match would let someone claim a
 * colleague by typing a common first name, which is the same leak by a slower
 * route.
 *
 * Ambiguity is its own answer, never a coin flip. Two Dave Ramoses is a real
 * situation in a bar, and picking one would hand a person another person's pay.
 */

export type ClaimCandidate = { id: string; name: string };

export type ClaimMatch =
  | { kind: 'one'; employeeId: string }
  | { kind: 'none' }
  | { kind: 'ambiguous' };

/** Case, surrounding space and doubled spaces cannot distinguish two people. */
export function normaliseName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function matchEmployeeName(
  typed: string,
  roster: readonly ClaimCandidate[],
): ClaimMatch {
  const target = normaliseName(typed ?? '');
  if (target.length === 0) return { kind: 'none' };

  const hits = roster.filter((e) => normaliseName(e.name) === target);

  if (hits.length === 0) return { kind: 'none' };
  if (hits.length > 1)  return { kind: 'ambiguous' };
  return { kind: 'one', employeeId: hits[0].id };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `npx vitest run lib/employee-portal/claim.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/employee-portal/claim.ts lib/employee-portal/claim.test.ts
git commit -m "feat(portal): exact name matching for employee claims"
```

---

## Task 3: Widen the payroll snapshot

**Files:**
- Modify: `lib/payroll/run-diff.ts` (the `SnapshotEntry` type)
- Modify: `app/(app)/app/payroll/approval-actions.ts:36-45` (`toSnapshot`)
- Test: `lib/payroll/run-diff.test.ts` (add one case)

**Interfaces:**
- Consumes: `PayrollEntry` from `app/(app)/app/payroll/actions.ts` — fields `employeeId, employeeName, role, totalHours, regularHours, overtimeHours, hourlyRate, regularPay, overtimePay, tipAmount, tipsPerHour, effectiveHourlyRate, totalCompensation, payType`.
- Produces: `SnapshotEntry` gains optional `breakdown` and `shifts`; `toSnapshot(entries: PayrollEntry[], shiftsByEmployee: Map<string, ShiftNight[]>): SnapshotEntry[]`.

- [ ] **Step 1: Write the failing test**

Add to `lib/payroll/run-diff.test.ts`:

```typescript
it('is not stale when only the new breakdown fields are present', () => {
  // Widening the snapshot for the employee portal must not change what
  // "stale" means. A run carrying a breakdown still diffs on the same four
  // fields, or every existing approved run would suddenly read as changed.
  const before = [{
    employeeId: 'a', employeeName: 'Dana', totalHours: 10, totalCompensation: 200,
  }];
  const after = [{
    employeeId: 'a', employeeName: 'Dana', totalHours: 10, totalCompensation: 200,
    breakdown: {
      role: 'bartender', regularHours: 10, overtimeHours: 0, hourlyRate: 12,
      regularPay: 120, overtimePay: 0, tipAmount: 80, tipsPerHour: 8,
      effectiveHourlyRate: 20, payType: 'pool' as const,
    },
    shifts: [{ date: '2026-09-01', hours: 10, isOpener: false }],
  }];

  expect(diffPayrollRun(before, after).isStale).toBe(false);
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/payroll/run-diff.test.ts`
Expected: FAIL — TypeScript rejects the object literal because `SnapshotEntry` has no `breakdown` property.

- [ ] **Step 3: Widen the type**

In `lib/payroll/run-diff.ts`, replace the `SnapshotEntry` type:

```typescript
/** One night behind a period's hours. Frozen so a later correction cannot rewrite a stub. */
export type ShiftNight = { date: string; hours: number; isOpener: boolean };

export type PayBreakdown = {
  role: string | null;
  regularHours: number;
  overtimeHours: number;
  hourlyRate: number;
  regularPay: number;
  overtimePay: number;
  tipAmount: number;
  tipsPerHour: number;
  effectiveHourlyRate: number;
  payType: string;
};

export type SnapshotEntry = {
  employeeId:        string;
  employeeName:      string;
  totalHours:        number;
  totalCompensation: number;

  /*
    Everything below is what the employee portal renders, frozen at submit so a
    pay stub shows figures somebody actually approved.

    All optional, and that is load-bearing: runs approved before the portal
    existed carry only the four fields above, and must keep parsing. The portal
    renders those as totals-only rather than reconstructing a breakdown by
    recomputing — a recomputed figure is not the figure that was signed off.

    diffPayrollRun ignores every one of these. Staleness means somebody's hours
    or pay moved; it must not start firing because a derived rate rounded
    differently.
  */
  breakdown?: PayBreakdown;
  shifts?:    ShiftNight[];
  tipContext?: TipNight[];
};
```

Also add, above `SnapshotEntry`:

```typescript
/**
 * The bar's whole tip pool on a night this person worked.
 *
 * Deliberately the pool TOTAL and not a per-night share. computePayroll works
 * in period totals — a night-by-night share does not exist anywhere in the app
 * and inventing one by dividing would produce a figure that disagrees with the
 * tip total on the same screen. The employee's own share for the period is
 * already `breakdown.tipAmount`; this is the context around it.
 */
export type TipNight = { date: string; poolTotal: number };
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run lib/payroll/run-diff.test.ts`
Expected: PASS — all existing cases plus the new one.

- [ ] **Step 5: Make `toSnapshot` write the wider entry**

In `app/(app)/app/payroll/approval-actions.ts`, replace `toSnapshot` (lines 36-45):

```typescript
/**
 * Freezes a computed run.
 *
 * Carries the full breakdown and the nights behind it, not just the totals, so
 * the employee portal can render a stub from figures an owner approved. See the
 * SnapshotEntry comment in lib/payroll/run-diff.ts for why diffPayrollRun still
 * only looks at four of these fields.
 */
function toSnapshot(
  entries: PayrollEntry[],
  shiftsByEmployee: Map<string, ShiftNight[]> = new Map(),
  poolByDate: Map<string, number> = new Map(),
): SnapshotEntry[] {
  return entries.map((e) => ({
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
    shifts: shiftsByEmployee.get(e.employeeId) ?? [],
    // Only the nights this person actually worked. The pool on a night they
    // were not in the building is not context, it is just the bar's takings.
    tipContext: (shiftsByEmployee.get(e.employeeId) ?? [])
      .filter((s) => poolByDate.has(s.date))
      .map((s) => ({ date: s.date, poolTotal: poolByDate.get(s.date) as number })),
  }));
}
```

Add to the imports at the top of that file:

```typescript
import { diffPayrollRun, type RunDiff, type SnapshotEntry, type ShiftNight } from '@/lib/payroll/run-diff';
import { computePayroll, type PayrollEntry } from './actions';
```

- [ ] **Step 6: Load the shift nights where the snapshot is built**

In the same file, inside `submitPayrollRun` (near line 93, where `toSnapshot(entries)` is called), fetch the nights first:

```typescript
  // The nights behind each person's hours, frozen alongside the totals. Fetched
  // here rather than derived from the entries because computePayroll returns
  // period totals only — the per-night rows live on employee_shifts.
  const { data: shiftRows } = await supabase
    .from('employee_shifts')
    .select('employee_id, shift_date, regular_hours, overtime_hours, is_opener')
    .eq('organization_id', org.id)
    .gte('shift_date', periodStart)
    .lte('shift_date', periodEnd);

  const shiftsByEmployee = new Map<string, ShiftNight[]>();
  for (const r of shiftRows ?? []) {
    const hours = (Number(r.regular_hours) || 0) + (Number(r.overtime_hours) || 0);
    const list = shiftsByEmployee.get(r.employee_id as string) ?? [];
    list.push({
      date:     r.shift_date as string,
      hours,
      isOpener: Boolean(r.is_opener),
    });
    shiftsByEmployee.set(r.employee_id as string, list);
  }
  for (const list of shiftsByEmployee.values()) list.sort((a, b) => a.date.localeCompare(b.date));

  // The bar's tip pool per night, frozen with everything else so the portal
  // never has to reach for a live figure. A NULL tip column is nothing here
  // rather than a reason to drop the night — same reading as lib/pos/tip-rate.
  const { data: tipDays } = await supabase
    .from('z_report_days')
    .select('report_date, cash_tips, cc_tips')
    .eq('organization_id', org.id)
    .gte('report_date', periodStart)
    .lte('report_date', periodEnd);

  const poolByDate = new Map<string, number>(
    (tipDays ?? []).map((d) => [
      d.report_date as string,
      (Number(d.cash_tips) || 0) + (Number(d.cc_tips) || 0),
    ]),
  );

  const snapshot = toSnapshot(entries, shiftsByEmployee, poolByDate);
```

Apply the same change at the other two `toSnapshot(...)` call sites (lines ~172 and ~285); where a period's shift rows are not already in scope, pass no second argument and the entry gets `shifts: []`.

- [ ] **Step 7: Verify nothing regressed**

Run: `npx tsc --noEmit && npx vitest run lib/payroll && npm run audit:scope`
Expected: typecheck clean, all payroll tests pass, scope audit reports 0 unscoped.

- [ ] **Step 8: Commit**

```bash
git add lib/payroll/run-diff.ts lib/payroll/run-diff.test.ts "app/(app)/app/payroll/approval-actions.ts"
git commit -m "feat(payroll): freeze the full breakdown in a run snapshot"
```

---

## Task 4: Pay stub projection with legacy fallback

**Files:**
- Create: `lib/employee-portal/stub.ts`
- Test: `lib/employee-portal/stub.test.ts`

**Interfaces:**
- Consumes: `SnapshotEntry`, `PayBreakdown`, `ShiftNight` from `lib/payroll/run-diff.ts` (Task 3).
- Produces:
  - `type PayStub = { employeeId: string; employeeName: string; totalHours: number; totalPay: number; breakdown: PayBreakdown | null; shifts: ShiftNight[]; tipContext: TipNight[]; detailRecorded: boolean }`
  - `buildStub(snapshot: readonly SnapshotEntry[], employeeId: string): PayStub | null`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { buildStub } from './stub';
import type { SnapshotEntry } from '@/lib/payroll/run-diff';

const breakdown = {
  role: 'bartender', regularHours: 30, overtimeHours: 2, hourlyRate: 12,
  regularPay: 360, overtimePay: 36, tipAmount: 240, tipsPerHour: 7.5,
  effectiveHourlyRate: 19.5, payType: 'pool',
};

const full: SnapshotEntry = {
  employeeId: 'a', employeeName: 'Dana', totalHours: 32, totalCompensation: 636,
  breakdown, shifts: [{ date: '2026-09-01', hours: 8, isOpener: true }],
};

const legacy: SnapshotEntry = {
  employeeId: 'b', employeeName: 'Sam', totalHours: 20, totalCompensation: 400,
};

describe('buildStub', () => {
  it('returns only the named employee, never the whole run', () => {
    const stub = buildStub([full, legacy], 'a');
    expect(stub?.employeeName).toBe('Dana');
    expect(stub?.totalPay).toBe(636);
  });

  it('returns null for an employee not in the run', () => {
    // A period somebody did not work is not an empty stub, it is no stub.
    expect(buildStub([full], 'nobody')).toBeNull();
  });

  it('marks a legacy entry as having no recorded detail', () => {
    const stub = buildStub([legacy], 'b');
    expect(stub?.detailRecorded).toBe(false);
    expect(stub?.breakdown).toBeNull();
    expect(stub?.shifts).toEqual([]);
  });

  it('never invents a breakdown for a legacy entry', () => {
    // The totals must survive untouched; the detail must stay absent rather
    // than be reconstructed from figures nobody approved.
    const stub = buildStub([legacy], 'b');
    expect(stub?.totalHours).toBe(20);
    expect(stub?.totalPay).toBe(400);
  });

  it('reports recorded detail when the breakdown is present', () => {
    const stub = buildStub([full], 'a');
    expect(stub?.detailRecorded).toBe(true);
    expect(stub?.breakdown?.tipAmount).toBe(240);
    expect(stub?.shifts).toHaveLength(1);
  });

  it('carries the tip pool context through, and defaults it to empty', () => {
    const withPool = buildStub(
      [{ ...full, tipContext: [{ date: '2026-09-01', poolTotal: 1200 }] }],
      'a',
    );
    expect(withPool?.tipContext).toEqual([{ date: '2026-09-01', poolTotal: 1200 }]);
    // A legacy run has no pool figures, and must not report a zero pool.
    expect(buildStub([legacy], 'b')?.tipContext).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/employee-portal/stub.test.ts`
Expected: FAIL — module `./stub` not found.

- [ ] **Step 3: Write the implementation**

```typescript
/**
 * One employee's slice of an approved pay run.
 *
 * Pure — no database, no clock.
 *
 * WHY A PROJECTION AND NOT A QUERY
 *
 * The snapshot holds the whole run: every employee's pay is in that JSON blob.
 * The portal must show exactly one person's, so the narrowing happens in one
 * tested function rather than being re-derived at each call site. A page that
 * forgot to filter would render the payroll of the entire bar to a barback.
 *
 * LEGACY ENTRIES
 *
 * Runs approved before the portal existed carry only four fields. Those project
 * to totals with `detailRecorded: false`, and the UI says the detail was not
 * recorded for that period. Reconstructing a breakdown by recomputing would
 * produce numbers nobody signed off, presented as though they had been.
 */

import type { SnapshotEntry, PayBreakdown, ShiftNight, TipNight } from '@/lib/payroll/run-diff';

export type PayStub = {
  employeeId:   string;
  employeeName: string;
  totalHours:   number;
  totalPay:     number;
  /** Null for a run frozen before the breakdown was recorded. */
  breakdown:    PayBreakdown | null;
  shifts:       ShiftNight[];
  /** The bar's pool on each night worked. Empty for a legacy run. */
  tipContext:   TipNight[];
  /** False when this run predates the wider snapshot. Drives the UI's caveat. */
  detailRecorded: boolean;
};

export function buildStub(
  snapshot: readonly SnapshotEntry[],
  employeeId: string,
): PayStub | null {
  const entry = (snapshot ?? []).find((e) => e.employeeId === employeeId);
  // A period this person did not work is not an empty stub, it is no stub.
  if (!entry) return null;

  return {
    employeeId:     entry.employeeId,
    employeeName:   entry.employeeName,
    totalHours:     entry.totalHours,
    totalPay:       entry.totalCompensation,
    breakdown:      entry.breakdown ?? null,
    shifts:         entry.shifts ?? [],
    tipContext:     entry.tipContext ?? [],
    detailRecorded: entry.breakdown !== undefined,
  };
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run lib/employee-portal/stub.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add lib/employee-portal/stub.ts lib/employee-portal/stub.test.ts
git commit -m "feat(portal): project one employee's stub from a run snapshot"
```

---

## Task 5: `getCurrentEmployee()` session resolver

**Files:**
- Create: `lib/employee-portal/session.ts`
- Test: `lib/employee-portal/session.test.ts`

**Interfaces:**
- Consumes: `getAuthUser` from `lib/org.ts`; `createAdminClient` from `lib/supabase/admin.ts`.
- Produces:
  - `type EmployeeSession = { orgId: string; employeeId: string; employeeName: string }`
  - `type AccountState = { kind: 'active'; session: EmployeeSession } | { kind: 'pending' } | { kind: 'none' }`
  - `resolveAccountState(row: AccountRow | null): AccountState` — pure, exported for testing
  - `getCurrentEmployee(): Promise<EmployeeSession>` — redirects when not active

- [ ] **Step 1: Write the failing test**

The database call is not the interesting part; the state machine is. Test the pure resolver.

```typescript
import { describe, it, expect } from 'vitest';
import { resolveAccountState } from './session';

const row = (over: Partial<Parameters<typeof resolveAccountState>[0]> = {}) => ({
  organization_id: 'org1',
  employee_id: 'emp1',
  status: 'active',
  employees: { name: 'Dana' },
  ...over,
} as Parameters<typeof resolveAccountState>[0]);

describe('resolveAccountState', () => {
  it('resolves an active account to its own org and employee', () => {
    expect(resolveAccountState(row())).toEqual({
      kind: 'active',
      session: { orgId: 'org1', employeeId: 'emp1', employeeName: 'Dana' },
    });
  });

  it('gives a pending account no session', () => {
    // A claim nobody has approved must not read anybody's pay.
    expect(resolveAccountState(row({ status: 'pending' }))).toEqual({ kind: 'pending' });
  });

  it('treats a revoked account as no account at all', () => {
    // Deliberately not distinguished from 'none': a revoked employee is told
    // nothing about why, and gets the same screen as a stranger.
    expect(resolveAccountState(row({ status: 'revoked' }))).toEqual({ kind: 'none' });
  });

  it('gives no session when there is no row', () => {
    expect(resolveAccountState(null)).toEqual({ kind: 'none' });
  });

  it('gives no session when an active row somehow names no employee', () => {
    // The CHECK constraint forbids this. Belt and braces: a session with a
    // null employee id would scope every portal query to nothing, or worse.
    expect(resolveAccountState(row({ employee_id: null }))).toEqual({ kind: 'none' });
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `npx vitest run lib/employee-portal/session.test.ts`
Expected: FAIL — module `./session` not found.

- [ ] **Step 3: Write the implementation**

```typescript
import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAuthUser } from '@/lib/org';

/**
 * Who the logged-in employee is.
 *
 * This is the portal's entire security model. Every query the portal makes is
 * scoped by the org and employee id this returns, and by nothing from the
 * request — so a hand-edited URL cannot address another person's pay. One
 * function, so there is one thing to get right and one thing to test.
 *
 * Deliberately NOT getCurrentOrg(): that resolves a MEMBERSHIP, and an employee
 * must never have one. See the migration for what a membership row would grant.
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
 * The state machine, pure so it can be tested without a database.
 *
 * 'revoked' collapses into 'none' on purpose: a revoked employee is told
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

/** Memoized per request, matching getCurrentOrg — layout and page both call it. */
export const getEmployeeAccountState = cache(async (): Promise<AccountState> => {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const supabase = createAdminClient();

  // admin-scope-ok: keyed on the authenticated user's own id, which is the
  // narrowest possible scope — this query exists to DISCOVER which org the
  // employee belongs to, so it cannot be filtered by one.
  const { data } = await supabase
    .from('employee_accounts')
    .select('organization_id, employee_id, status, employees(name)')
    .eq('user_id', user.id)
    .maybeSingle();

  return resolveAccountState(data as AccountRow | null);
});

/** The session, or a redirect. Use this in every portal page and action. */
export async function getCurrentEmployee(): Promise<EmployeeSession> {
  const state = await getEmployeeAccountState();
  if (state.kind === 'active') return state.session;
  if (state.kind === 'pending') redirect('/me/pending');
  redirect('/login');
}
```

- [ ] **Step 4: Run it and watch it pass**

Run: `npx vitest run lib/employee-portal/session.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Verify the scope audit accepts the justification**

Run: `npm run audit:scope`
Expected: "OK — every service-role query is org-scoped or justified", with the justified count up by one.

- [ ] **Step 6: Commit**

```bash
git add lib/employee-portal/session.ts lib/employee-portal/session.test.ts
git commit -m "feat(portal): employee session resolver"
```

---

## Task 6: Route gating

**Files:**
- Modify: `proxy.ts:26-37`
- Modify: `lib/org.ts:133-157`

**Interfaces:**
- Consumes: `getEmployeeAccountState` from Task 5.
- Produces: `/me/*` requires auth; a user with only an employee account is sent to `/me` instead of `/setup`.

- [ ] **Step 1: Gate `/me` in the proxy**

In `proxy.ts`, replace the `isAppRoute` block:

```typescript
  // Boundary-aware: a bare startsWith('/app') also matches /apple-icon, and
  // would match /apply or /appointments if those ever existed — sending public
  // routes to the login page purely because of a shared prefix. The staff
  // portal needs the same treatment and the same care.
  const { pathname } = request.nextUrl;
  const isAppRoute = pathname === '/app' || pathname.startsWith('/app/');
  const isStaffRoute = pathname === '/me' || pathname.startsWith('/me/');

  if (!user && (isAppRoute || isStaffRoute)) {
```

- [ ] **Step 2: Send employee-only users to the portal**

In `lib/org.ts`, replace the redirect on line ~141:

```typescript
  if (!memberships || memberships.length === 0) {
    // Someone with an employee account but no membership is staff, not an
    // owner who has not finished setup. Sending them to /setup would drop a
    // bartender into the org-creation wizard.
    const state = await getEmployeeAccountState();
    if (state.kind !== 'none') redirect('/me');
    redirect('/setup');
  }
```

Add the import at the top of `lib/org.ts`:

```typescript
import { getEmployeeAccountState } from '@/lib/employee-portal/session';
```

**Note on the cycle:** `session.ts` imports `getAuthUser` from `org.ts` and `org.ts` now imports `getEmployeeAccountState` from `session.ts`. This is a legal ES module cycle because both are function references resolved at call time, not module-init values. If `npx tsc --noEmit` or the Next build complains, break it by moving `getAuthUser` into `lib/supabase/auth-user.ts` and re-exporting it from `org.ts` — do not resolve it by duplicating the auth call.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit && npm run build`
Expected: both clean. A build failure mentioning a circular import means apply the note above.

- [ ] **Step 4: Commit**

```bash
git add proxy.ts lib/org.ts
git commit -m "feat(portal): gate /me and route staff away from the setup wizard"
```

---

## Task 7: Join code settings and the claim action

**Files:**
- Create: `app/(auth)/join/actions.ts`
- Create: `app/(auth)/join/join-form.tsx`
- Create: `app/(auth)/join/page.tsx`
- Modify: `app/(app)/app/settings/_components/team-tab.tsx`
- Modify: `lib/notifications/types.ts`

**Interfaces:**
- Consumes: `matchEmployeeName` (Task 2), `dispatch` from `lib/notifications/deliver.ts`, `checkRateLimit`/`clientIp`/`RATE_LIMITS` from `lib/rate-limit.ts`.
- Produces: `claimEmployeeAccount(email, password, joinCode, typedName): Promise<{ ok: boolean; message: string }>`; event type `staff.claim_pending`.

- [ ] **Step 1: Register the notification event**

In `lib/notifications/types.ts`, add `'staff.claim_pending'` to `EVENT_TYPES` (after `'sales.anomaly'`), add its label:

```typescript
  'staff.claim_pending': {
    title:       'Staff account to approve',
    description: 'Someone has signed up with the bar’s join code and is waiting to be matched to their employee record.',
  },
```

and add it to `ROLE_DEFAULTS.owner` and `ROLE_DEFAULTS.manager` (not `accountant` — matching `canManagePayroll`, who approves these).

- [ ] **Step 2: Write the claim action**

```typescript
'use server';

import { headers } from 'next/headers';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { checkRateLimit, clientIp, RATE_LIMITS } from '@/lib/rate-limit';
import { matchEmployeeName } from '@/lib/employee-portal/claim';
import { dispatch } from '@/lib/notifications/deliver';

/**
 * Staff sign-up.
 *
 * ONE RESPONSE FOR EVERY OUTCOME. A matched name, an unmatched name and an
 * ambiguous one all return the same sentence. The form asks the person to type
 * their own name rather than listing the roster, and a response that differed
 * on a hit would make this endpoint a name oracle for anybody holding the join
 * code — undoing exactly what not listing the roster bought.
 *
 * The join code is not a credential. It gets a claim into a queue that a
 * manager must approve, and nothing else.
 */

const SENT = 'Thanks — your request has been sent to your manager for approval.';
const BAD_CODE = 'That code was not recognised.';

export async function claimEmployeeAccount(
  email: string,
  password: string,
  joinCode: string,
  typedName: string,
): Promise<{ ok: boolean; message: string }> {
  const ip = clientIp(await headers());
  const limit = await checkRateLimit(RATE_LIMITS.login, `claim:${ip}`);
  if (!limit.allowed) {
    return { ok: false, message: 'Too many attempts. Please try again later.' };
  }

  const admin = createAdminClient();

  // admin-scope-ok: this resolves WHICH org a join code belongs to, so it is
  // the one query that cannot be filtered by organization_id. The code is
  // matched exactly and a miss returns before anything else happens.
  const { data: org } = await admin
    .from('organizations')
    .select('id')
    .eq('staff_join_code', joinCode.trim())
    .maybeSingle();

  // A NULL staff_join_code means staff sign-up is off, and NULL never matches
  // an equality test, so a disabled bar falls out here with the same message.
  if (!org) return { ok: false, message: BAD_CODE };

  const { data: roster } = await admin
    .from('employees')
    .select('id, name')
    .eq('organization_id', org.id);

  const match = matchEmployeeName(typedName, (roster ?? []).map(
    (e) => ({ id: e.id as string, name: e.name as string }),
  ));

  // Create the auth user regardless of the match, so the response cannot be
  // timed or inferred. An account with no approved claim can reach nothing.
  const supabase = await createClient();
  const { data: signUp, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error || !signUp.user) {
    console.warn('[portal] sign-up failed:', error?.message);
    return { ok: true, message: SENT };
  }

  // A miss records nothing at all — see the class comment.
  if (match.kind !== 'none') {
    await admin.from('employee_accounts').upsert(
      {
        organization_id: org.id,
        employee_id:     match.kind === 'one' ? match.employeeId : null,
        user_id:         signUp.user.id,
        status:          'pending',
        claimed_name:    typedName.trim(),
      },
      { onConflict: 'user_id,organization_id', ignoreDuplicates: true },
    );

    await dispatch(org.id, {
      eventType: 'staff.claim_pending',
      title:     'Someone wants a staff login',
      body:      `${typedName.trim()} signed up with the bar’s join code and is waiting to be approved.`,
      link:      '/app/employees',
      payload:   { claimedName: typedName.trim() },
      dedupeKey: `staff.claim_pending:${signUp.user.id}`,
    });
  }

  return { ok: true, message: SENT };
}
```

- [ ] **Step 3: Write the form**

`app/(auth)/join/join-form.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { claimEmployeeAccount } from './actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { FormStatus } from '@/components/ui/form-status';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';

const FIELD =
  'bg-white/10 border-white/20 text-white placeholder:text-white/30 focus-visible:ring-white/30';

/**
 * Staff sign-up.
 *
 * The name is TYPED, never picked from a list. A roster here would turn the
 * join code — which ends up on a whiteboard — into a staff directory. The
 * server returns the same message whatever happens, so this form has no
 * success/failure branch to leak one either.
 */
export function JoinForm() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode]         = useState('');
  const [name, setName]         = useState('');
  const [loading, setLoading]   = useState(false);
  const [status, setStatus]     = useState<'idle' | 'error' | 'success'>('idle');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus('idle');
    setStatusMessage(null);

    const result = await claimEmployeeAccount(email, password, code, name);
    setLoading(false);

    if (!result.ok) {
      setStatus('error');
      setStatusMessage(result.message);
      toast.error(result.message);
      return;
    }

    // Replaces the form entirely. Leaving the fields up invites a second
    // submission, and the only thing that achieves is a duplicate no-op.
    setDone(true);
    setStatus('success');
    setStatusMessage(result.message);
    toast.success(result.message);
  }

  if (done) {
    return (
      <Card className="w-full max-w-sm bg-white/10 backdrop-blur-xl border-white/15 shadow-2xl">
        <CardHeader>
          <CardTitle className="text-white">Request sent</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-white/70">
            {statusMessage} You&rsquo;ll be able to log in once they approve it.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full max-w-sm bg-white/10 backdrop-blur-xl border-white/15 shadow-2xl">
      <CardHeader>
        <CardTitle className="text-white">Staff sign-up</CardTitle>
        <CardDescription className="text-white/60">
          See your hours and what you earned
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="join-code" className="text-white/80">Bar code</Label>
            <Input
              id="join-code" required autoComplete="off"
              value={code} onChange={(e) => setCode(e.target.value)}
              className={FIELD}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="join-name" className="text-white/80">
              Your name, as your manager writes it
            </Label>
            <Input
              id="join-name" required autoComplete="name"
              value={name} onChange={(e) => setName(e.target.value)}
              className={FIELD}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="join-email" className="text-white/80">Email</Label>
            <Input
              id="join-email" type="email" required autoComplete="email"
              value={email} onChange={(e) => setEmail(e.target.value)}
              className={FIELD}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="join-password" className="text-white/80">Password</Label>
            <PasswordInput
              id="join-password" required autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)}
              className={FIELD}
              toggleClassName="text-white/50 hover:text-white"
            />
          </div>

          <FormStatus status={status} message={statusMessage} />

          <Button
            type="submit"
            className="w-full bg-white text-gray-900 hover:bg-white/90"
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Sending…
              </>
            ) : 'Request access'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
```

`app/(auth)/join/page.tsx`:

```tsx
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { JoinForm } from './join-form';

export const metadata: Metadata = {
  title: 'Staff sign-up',
  robots: { index: false, follow: true },
};

export default function JoinPage() {
  return (
    <main className="relative min-h-dvh grid place-items-center p-6 overflow-hidden bg-sidebar text-sidebar-foreground">
      <div aria-hidden className="absolute inset-0 grid-texture text-sidebar-foreground opacity-40" />
      <div
        aria-hidden
        className="absolute -top-32 left-1/2 -translate-x-1/2 h-[26rem] w-[26rem] rounded-full opacity-20 blur-3xl"
        style={{ background: 'radial-gradient(circle, var(--primary), transparent 70%)' }}
      />
      <div className="relative z-10 w-full flex flex-col items-center gap-6">
        <h1 className="sr-only">Staff sign-up</h1>
        <p aria-hidden="true" className="font-heading text-sidebar-foreground/60 text-xs font-bold tracking-[0.3em] uppercase select-none">
          Rail
        </p>

        <JoinForm />

        <Link
          href="/login"
          className="flex items-center gap-1.5 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground transition-colors duration-200"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Already have a login?
        </Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Write the staff-access server action**

Create `app/(app)/app/settings/staff-access-actions.ts`:

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOrg } from '@/lib/org';
import { canManagePayroll } from '@/lib/permissions';

/**
 * The bar's staff join code.
 *
 * NULL means staff sign-up is off, which is what every existing bar gets. The
 * code is not a credential — it gets a claim into a queue a manager must
 * approve — but it is still rotatable, because a code written on a whiteboard
 * outlives the people who read it.
 *
 * Unambiguous alphabet: no O/0, no I/1/l. This gets read aloud across a bar.
 */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(len = 8): string {
  const bytes = new Uint32Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

/** Generates a fresh code, or replaces the existing one. Returns the new code. */
export async function rotateStaffJoinCode(): Promise<string> {
  const { org, role } = await getCurrentOrg();
  if (!canManagePayroll(role)) throw new Error('Not permitted');

  const supabase = createAdminClient();

  // The column carries a unique index, so a collision is a failed write rather
  // than two bars sharing a code. Retry a few times before giving up.
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    const { error } = await supabase
      .from('organizations')
      .update({ staff_join_code: code })
      .eq('id', org.id);

    if (!error) {
      revalidatePath('/app/settings');
      return code;
    }
  }

  throw new Error('Could not generate a unique code. Please try again.');
}

/**
 * Turns staff sign-up off.
 *
 * Existing accounts are untouched — this closes the door to new claims, it does
 * not evict the people already through it. Revoking an individual is a separate
 * action on the employees screen.
 */
export async function disableStaffJoinCode(): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!canManagePayroll(role)) throw new Error('Not permitted');

  const supabase = createAdminClient();
  await supabase
    .from('organizations')
    .update({ staff_join_code: null })
    .eq('id', org.id);

  revalidatePath('/app/settings');
}
```

- [ ] **Step 5: Add the Staff logins section to the Team tab**

In `app/(app)/app/settings/_components/team-tab.tsx`, add to the imports:

```typescript
import { KeyRound, Copy } from 'lucide-react';
import { rotateStaffJoinCode, disableStaffJoinCode } from '../staff-access-actions';
```

Add `staffJoinCode` to the component's props (`staffJoinCode: string | null`), pass it from the settings page's existing org read, and render this section above the member list:

```tsx
      {/*
        Staff logins are off until somebody turns them on: staffJoinCode is NULL
        for every bar that existed before this feature, and NULL never matches
        the equality test the claim action does, so a bar that has not opted in
        cannot be joined at all.
      */}
      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-muted-foreground" aria-hidden />
          <h3 className="text-sm font-semibold">Staff logins</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          Staff use this code to request access to their own hours and pay. It is
          not a password — every request still needs your approval on the
          Employees screen.
        </p>

        {joinCode ? (
          <div className="flex flex-wrap items-center gap-2">
            <code className="rounded-md border bg-muted px-3 py-2 font-mono text-lg tracking-[0.2em]">
              {joinCode}
            </code>
            <Button
              variant="outline" size="sm"
              onClick={() => {
                navigator.clipboard.writeText(joinCode);
                toast.success('Code copied');
              }}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden />
              Copy
            </Button>
            {canManage && (
              <>
                <Button variant="outline" size="sm" disabled={codeBusy} onClick={handleRotate}>
                  <Shuffle className="h-3.5 w-3.5" aria-hidden />
                  New code
                </Button>
                <Button variant="ghost" size="sm" disabled={codeBusy} onClick={handleDisable}>
                  Turn off
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">Staff sign-up is off.</span>
            {canManage && (
              <Button size="sm" disabled={codeBusy} onClick={handleRotate}>
                Turn on
              </Button>
            )}
          </div>
        )}
      </section>
```

and the state plus handlers alongside the component's existing ones:

```typescript
  const [joinCode, setJoinCode] = useState<string | null>(staffJoinCode);
  const [codeBusy, setCodeBusy] = useState(false);

  async function handleRotate() {
    setCodeBusy(true);
    try {
      const code = await rotateStaffJoinCode();
      setJoinCode(code);
      toast.success('Staff sign-up is on. Share the code with your team.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the code');
    } finally {
      setCodeBusy(false);
    }
  }

  async function handleDisable() {
    setCodeBusy(true);
    try {
      await disableStaffJoinCode();
      setJoinCode(null);
      // Said plainly: turning the code off is not the same as removing people.
      toast.success('Staff sign-up is off. Existing staff logins still work.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not turn it off');
    } finally {
      setCodeBusy(false);
    }
  }
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run audit:scope && npm test`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add "app/(auth)/join" "app/(app)/app/settings/_components/team-tab.tsx" \
        "app/(app)/app/settings/staff-access-actions.ts" \
        "app/(app)/app/settings/page.tsx" lib/notifications/types.ts
git commit -m "feat(portal): staff sign-up by join code with manager approval"
```

---

## Task 8: Manager approval queue

**Files:**
- Create: `app/(app)/app/employees/claim-actions.ts`
- Create: `app/(app)/app/employees/_components/pending-claims.tsx`
- Modify: `app/(app)/app/employees/page.tsx`

**Interfaces:**
- Consumes: `getCurrentOrg`, `canManagePayroll`.
- Produces: `listPendingClaims()`, `approveClaim(claimId, employeeId)`, `rejectClaim(claimId)`, `revokeAccount(claimId)`.

- [ ] **Step 1: Write the actions**

```typescript
'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentOrg, getAuthUser } from '@/lib/org';
import { canManagePayroll } from '@/lib/permissions';

export type PendingClaim = {
  id:           string;
  claimedName:  string;
  employeeId:   string | null;
  employeeName: string | null;
  requestedAt:  string;
};

export async function listPendingClaims(): Promise<PendingClaim[]> {
  const { org, role } = await getCurrentOrg();
  if (!canManagePayroll(role)) return [];

  const supabase = createAdminClient();
  const { data } = await supabase
    .from('employee_accounts')
    .select('id, claimed_name, employee_id, requested_at, employees(name)')
    .eq('organization_id', org.id)
    .eq('status', 'pending')
    .order('requested_at', { ascending: false });

  return (data ?? []).map((r) => {
    const emp = Array.isArray(r.employees) ? r.employees[0] : r.employees;
    return {
      id:           r.id as string,
      claimedName:  r.claimed_name as string,
      employeeId:   (r.employee_id as string | null) ?? null,
      employeeName: (emp as { name?: string } | null)?.name ?? null,
      requestedAt:  r.requested_at as string,
    };
  });
}

/**
 * Approves a claim, naming the employee it belongs to.
 *
 * `employeeId` is passed explicitly rather than read off the row, because an
 * ambiguous claim (two Dave Ramoses) has none stored and the manager is the one
 * resolving it. The employee is re-checked against this org before the write:
 * an id from a form is untrusted input, and approving one from another bar
 * would build a session pointing across the tenancy boundary.
 */
export async function approveClaim(claimId: string, employeeId: string): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!canManagePayroll(role)) throw new Error('Not permitted');
  const user = await getAuthUser();

  const supabase = createAdminClient();

  const { data: employee } = await supabase
    .from('employees')
    .select('id')
    .eq('organization_id', org.id)
    .eq('id', employeeId)
    .maybeSingle();

  if (!employee) throw new Error('That employee is not on this bar’s roster');

  await supabase
    .from('employee_accounts')
    .update({
      employee_id: employeeId,
      status:      'active',
      decided_by:  user?.id ?? null,
      decided_at:  new Date().toISOString(),
    })
    .eq('organization_id', org.id)
    .eq('id', claimId)
    .eq('status', 'pending');

  revalidatePath('/app/employees');
}

/**
 * Declines a claim. Recorded as 'revoked' rather than deleted, so the person
 * cannot simply sign up again into the same queue — the unique index on
 * (user_id, organization_id) still holds.
 */
export async function rejectClaim(claimId: string): Promise<void> {
  const { org, role } = await getCurrentOrg();
  if (!canManagePayroll(role)) throw new Error('Not permitted');
  const user = await getAuthUser();

  const supabase = createAdminClient();
  await supabase
    .from('employee_accounts')
    .update({ status: 'revoked', decided_by: user?.id ?? null, decided_at: new Date().toISOString() })
    .eq('organization_id', org.id)
    .eq('id', claimId);

  revalidatePath('/app/employees');
}

/** Same write as a rejection; separate name because the intent differs at the call site. */
export async function revokeAccount(claimId: string): Promise<void> {
  return rejectClaim(claimId);
}
```

- [ ] **Step 2: Write the queue component**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { UserCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger,
} from '@/components/ui/select';
import { approveClaim, rejectClaim, type PendingClaim } from '../claim-actions';
import type { Employee } from '../../payroll/actions';

/**
 * Staff waiting to be let in.
 *
 * The manager is the verification step — the join code only gets somebody into
 * this queue. So the screen shows what the person TYPED, not a tidied-up match:
 * the question being answered is "do I know this person", and the typed string
 * is the evidence for it.
 *
 * A claim whose name matched two employees arrives unresolved, and the manager
 * picks. Approving cannot proceed without that choice — an active account with
 * no employee is the one state that would build a session pointing at nobody.
 */
export function PendingClaims({
  claims,
  roster,
}: {
  claims: PendingClaim[];
  roster: Employee[];
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  // Only for the ambiguous ones; a resolved claim already knows its employee.
  const [picked, setPicked] = useState<Record<string, string>>({});

  // Nothing pending is not an empty state worth drawing. It is the normal case.
  if (claims.length === 0) return null;

  async function handleApprove(claim: PendingClaim) {
    const employeeId = claim.employeeId ?? picked[claim.id];
    if (!employeeId) {
      toast.error('Pick which employee this is first.');
      return;
    }
    setBusyId(claim.id);
    try {
      await approveClaim(claim.id, employeeId);
      toast.success(`${claim.claimedName} can now see their own hours and pay.`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not approve');
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(claim: PendingClaim) {
    setBusyId(claim.id);
    try {
      await rejectClaim(claim.id);
      toast.success('Request declined.');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not decline');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div>
        <h2 className="text-sm font-semibold">
          {claims.length === 1
            ? '1 person is waiting for a login'
            : `${claims.length} people are waiting for a login`}
        </h2>
        <p className="text-xs text-muted-foreground">
          They will only ever see their own hours and pay. Approve only people
          you recognise.
        </p>
      </div>

      <div className="space-y-2">
        {claims.map((claim) => (
          <div
            key={claim.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-3"
          >
            <div className="min-w-0">
              <p className="font-medium">{claim.claimedName}</p>
              <p className="text-xs text-muted-foreground">
                {/* Said plainly when we could not resolve it. */}
                {claim.employeeName
                  ? `Matches ${claim.employeeName}`
                  : 'Two people share this name — pick which one'}
                {' · '}
                {new Date(claim.requestedAt).toLocaleDateString()}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {!claim.employeeId && (
                <Select
                  value={picked[claim.id] ?? ''}
                  onValueChange={(v) =>
                    setPicked((p) => ({ ...p, [claim.id]: String(v) }))
                  }
                >
                  <SelectTrigger className="w-44 text-sm">
                    {roster.find((e) => e.id === picked[claim.id])?.name ?? 'Choose employee'}
                  </SelectTrigger>
                  <SelectContent>
                    {roster.map((e) => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Button
                size="sm"
                disabled={busyId === claim.id}
                onClick={() => handleApprove(claim)}
              >
                <UserCheck className="h-3.5 w-3.5" aria-hidden />
                Approve
              </Button>
              <Button
                size="sm" variant="ghost"
                disabled={busyId === claim.id}
                onClick={() => handleReject(claim)}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Decline
              </Button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Mount it on the employees page**

In `app/(app)/app/employees/page.tsx`, call `listPendingClaims()` alongside the existing roster fetch and render `<PendingClaims claims={claims} roster={roster} />` above the roster.

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit && npm run audit:scope && npm run lint`
Expected: clean; scope audit reports 0 unscoped.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/app/employees"
git commit -m "feat(portal): manager queue for approving staff logins"
```

---

## Task 9: The portal

**Files:**
- Create: `app/(staff)/layout.tsx`
- Create: `app/(staff)/me/page.tsx`
- Create: `app/(staff)/me/pending/page.tsx`
- Create: `app/(staff)/me/actions.ts`
- Create: `app/(staff)/me/_components/period-card.tsx`

**Interfaces:**
- Consumes: `getCurrentEmployee` (Task 5), `buildStub` (Task 4).
- Produces: `getMyPeriods(): Promise<{ approved: ApprovedPeriod[]; inProgressHours: ShiftNight[] }>`.

- [ ] **Step 1: Write the reads**

```typescript
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
 * anything from the request. The snapshot is the whole run's pay, so buildStub
 * narrows it to one person before it can reach a page.
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

  // Hours since the newest approved period — the nights that have not been
  // signed off. Money is deliberately absent: nobody has approved a figure for
  // these yet, and showing one would be the recompute this design forbids.
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
```

- [ ] **Step 2: Write the layout**

`app/(staff)/layout.tsx` — mirrors `app/(app)/layout.tsx`'s `robots: noindex` metadata, with a minimal header showing the employee's name and a sign-out link. No app navigation: this is not the manager shell and must not link into it.

- [ ] **Step 3: Write the pending screen**

`app/(staff)/me/pending/page.tsx` — calls `getEmployeeAccountState()`; when `kind === 'active'` redirects to `/me`, otherwise renders "Your manager needs to approve your account before you can see your hours." No figures, no roster, no bar name.

- [ ] **Step 4: Write the portal page**

`app/(staff)/me/page.tsx` — server component, `export const dynamic = 'force-dynamic'`, mobile-first (`mx-auto max-w-2xl space-y-4 p-4`):
- A heading with the employee's name.
- "This period" card: the `inProgressHours` nights and their sum, plus the line "these hours have not been approved yet, so there is no pay figure to show".
- One `<PeriodCard>` per approved period, most recent first.
- When `approved` is empty and there are no in-progress hours, an empty state: "Nothing recorded yet."

- [ ] **Step 5: Write the period card**

```tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ApprovedPeriod } from '../actions';

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

/**
 * One approved pay period.
 *
 * Everything here came out of payroll_runs.snapshot — figures an owner signed
 * off. Nothing on this card is recomputed, which is why a period frozen before
 * the breakdown existed shows totals and says so, rather than filling the gap
 * with today's arithmetic.
 */
export function PeriodCard({ period }: { period: ApprovedPeriod }) {
  const { stub } = period;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">
          {period.periodStart} – {period.periodEnd}
        </CardTitle>
        <div className="flex items-baseline gap-4 pt-1">
          <span className="text-3xl font-bold tabular-nums text-primary">
            {money(stub.totalPay)}
          </span>
          <span className="text-sm text-muted-foreground tabular-nums">
            {stub.totalHours.toLocaleString()} hrs
          </span>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {stub.breakdown ? (
          <div className="space-y-1.5 border-t pt-3">
            <Row label="Base pay"  value={money(stub.breakdown.regularPay)} />
            {stub.breakdown.overtimeHours > 0 && (
              <Row
                label={`Overtime (${stub.breakdown.overtimeHours.toLocaleString()} hrs)`}
                value={money(stub.breakdown.overtimePay)}
              />
            )}
            <Row label="Tips" value={money(stub.breakdown.tipAmount)} />
            <Row
              label="Worth per hour"
              value={`${money(stub.breakdown.effectiveHourlyRate)}/hr`}
            />
          </div>
        ) : (
          <p className="border-t pt-3 text-sm text-muted-foreground">
            The detailed breakdown was not recorded for this period.
          </p>
        )}

        {stub.shifts.length > 0 && (
          <div className="space-y-1.5 border-t pt-3">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              Nights worked
            </p>
            {stub.shifts.map((s) => (
              <Row
                key={s.date}
                label={s.isOpener ? `${s.date} · opened` : s.date}
                value={`${s.hours.toLocaleString()} hrs`}
              />
            ))}
          </div>
        )}

        {stub.tipContext.length > 0 && (
          <div className="space-y-1.5 border-t pt-3">
            <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
              The bar&rsquo;s tip pool on those nights
            </p>
            {stub.tipContext.map((t) => (
              <Row key={t.date} label={t.date} value={money(t.poolTotal)} />
            ))}
            <p className="pt-1 text-xs text-muted-foreground">
              The whole bar&rsquo;s pool for the night. Your share of the period is
              the tips figure above.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit && npm run audit:scope && npm run lint && npm run build`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add "app/(staff)"
git commit -m "feat(portal): employee hours and approved pay at /me"
```

---

## Task 10: Authorization tests

**Files:**
- Create: `lib/employee-portal/authorization.test.ts`

**Interfaces:**
- Consumes: `resolveAccountState` (Task 5), `buildStub` (Task 4).

These are the tests that matter most. They assert the properties the whole design rests on, using the pure seams rather than a live database.

- [ ] **Step 1: Write the tests**

```typescript
import { describe, it, expect } from 'vitest';
import { resolveAccountState } from './session';
import { buildStub } from './stub';
import type { SnapshotEntry } from '@/lib/payroll/run-diff';

const run: SnapshotEntry[] = [
  { employeeId: 'dana', employeeName: 'Dana', totalHours: 30, totalCompensation: 600 },
  { employeeId: 'sam',  employeeName: 'Sam',  totalHours: 20, totalCompensation: 900 },
];

describe('an employee can only ever reach their own figures', () => {
  it('a stub built for one employee contains no trace of another', () => {
    const stub = buildStub(run, 'dana');
    expect(JSON.stringify(stub)).not.toContain('Sam');
    expect(JSON.stringify(stub)).not.toContain('900');
  });

  it('a pending account yields no session to scope a query with', () => {
    const state = resolveAccountState({
      organization_id: 'org1', employee_id: 'dana', status: 'pending', employees: { name: 'Dana' },
    });
    expect(state.kind).toBe('pending');
    expect('session' in state).toBe(false);
  });

  it('a revoked account yields no session', () => {
    const state = resolveAccountState({
      organization_id: 'org1', employee_id: 'dana', status: 'revoked', employees: { name: 'Dana' },
    });
    expect(state).toEqual({ kind: 'none' });
  });

  it('an active session names exactly one employee and one org', () => {
    const state = resolveAccountState({
      organization_id: 'org1', employee_id: 'dana', status: 'active', employees: { name: 'Dana' },
    });
    expect(state).toEqual({
      kind: 'active',
      session: { orgId: 'org1', employeeId: 'dana', employeeName: 'Dana' },
    });
  });
});
```

- [ ] **Step 2: Run them**

Run: `npx vitest run lib/employee-portal`
Expected: PASS — all four files green.

- [ ] **Step 3: Full verification**

Run: `npx tsc --noEmit && npm test && npm run audit:scope && npm run lint && npm run build`
Expected: everything clean.

- [ ] **Step 4: Commit**

```bash
git add lib/employee-portal/authorization.test.ts
git commit -m "test(portal): pin the isolation properties the portal rests on"
```

---

## Manual verification before shipping

Automated tests cover the pure seams; these cover the wiring, and must be done against a real database before this is trusted with anybody's pay.

- [ ] An employee with an **active** account sees only their own periods at `/me`.
- [ ] That employee is **redirected away from** `/app/payroll`, `/app/employees`, `/app/settings`.
- [ ] A **pending** account sees the waiting screen and no figures.
- [ ] A **rejected** person who signs up again does not reappear in the queue.
- [ ] A join code that has been **rotated** no longer works; a **disabled** (NULL) one returns the same "not recognised" message as a wrong one.
- [ ] Typing a name that **does not exist** returns the same message as a name that does, and records nothing.
- [ ] A run approved **before** this feature renders as totals-only with the caveat, and no invented breakdown.
- [ ] Submitting and approving a pay run still works, and `run-diff` still reports staleness exactly as before.
