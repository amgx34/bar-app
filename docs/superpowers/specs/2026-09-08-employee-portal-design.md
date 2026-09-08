# Employee portal — design

**Date:** 2026-09-08
**Status:** approved for planning

Bar employees log in to see their own hours and what they earned. They are a new
class of user: they authenticate, but they are not members of the organisation
in the sense the rest of the app means it.

## The problem this has to avoid

`memberships` cannot be reused for employees.

`supabase/migrations/ensure_full_schema.sql` creates policies in a loop:

```sql
CREATE POLICY %I ON %I FOR ALL USING (
  organization_id IN (SELECT organization_id FROM memberships WHERE user_id = auth.uid())
)
```

over `reps, rep_orders, weigh_reports, weigh_report_items, z_report_days,
z_reports, z_report_server_tips, z_report_cc_types, z_report_cc_batch,
losses_reports, employees, employee_shifts, direct_deposit_accounts,
dd_verification_codes, dd_audit_log`. `FOR ALL` is read *and* write. 41 policies
across the schema key on that table.

A `memberships` row with `role = 'employee'` would therefore hand a bartender:

- every colleague's pay, hours and **bank details** (`direct_deposit_accounts`)
- the ability to **edit their own recorded hours**, and everyone else's

Rewriting 41 policies to carve out a fourth role is one missed `WHERE` clause
away from that outcome, on tables where the failure is silent. This design keeps
employees out of `memberships` entirely, so none of those policies can apply to
them by construction.

## Decisions

| Question | Decision |
|---|---|
| Identity | New `employee_accounts` link table. No `memberships` row, ever. |
| What they see | Hours per shift, their pay breakdown, bar-wide tip context. |
| Which figures | Approved runs only, read from `payroll_runs.snapshot`. Never a live recompute. |
| Sign-up | Bar join code, then a manager confirms the claim. |
| Payout status | **Out of scope.** `payroll_payouts` is not exposed; the portal does not answer "have I been handed my money". Deliberate, per instruction. |

## Architecture

### 1. `employee_accounts` — the link

```sql
CREATE TABLE employee_accounts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- Nullable on purpose: a claim whose typed name matched two employees is
  -- recorded unresolved for a manager to settle. A session is only ever built
  -- from an ACTIVE row, and approval cannot set status='active' while this is
  -- NULL, so an unresolved claim can never become a login.
  employee_id     UUID REFERENCES employees(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'active', 'revoked')),
  claimed_name    TEXT NOT NULL,
  requested_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_by      UUID REFERENCES auth.users(id),
  decided_at      TIMESTAMPTZ
);
```

Two unique indexes carry real rules:

- `UNIQUE (organization_id, employee_id) WHERE status <> 'revoked'` — one live
  account per employee record. Two people cannot both be Dana. Postgres treats
  NULLs as distinct in a unique index, so several unresolved claims coexist
  happily, which is what we want.
- A `CHECK (status <> 'active' OR employee_id IS NOT NULL)` — an active account
  without a resolved employee is the one state that would let a session build
  against nobody.
- `UNIQUE (user_id, organization_id)` — one claim per person per bar. A
  double-tapped sign-up is a no-op, not a second pending row.

`status` is a real column here, unlike `payroll_payouts` where absence means
unpaid. A rejected claim must be *distinguishable* from one never made, or a
manager who declines an impostor sees them reappear in the queue forever.

`claimed_name` records what the person typed, not the employee's name. When a
manager reviews a claim, the useful question is "did this person type something
that plausibly identifies them", and the typed string is the evidence.

**RLS:** enabled, with a single self-read policy
(`user_id = auth.uid()`). Every other access is server-side through
`createAdminClient()`, scoped explicitly. Managers read the pending queue
through a server action gated on `canManagePayroll`.

### 2. The join code

`organizations.staff_join_code TEXT` — nullable. NULL means staff sign-up is
**off** for that bar, which is the default and what every existing org gets.
Turning it on is a deliberate act in Settings, and rotating it invalidates
nothing already claimed.

The code is not a secret worth much on its own: it gets a claim into a queue and
nothing else. It is deliberately not a credential.

### 3. Claiming, without leaking the roster

Sign-up asks for email, password, bar code, and **the employee's own name typed
in** — never a roster to pick from. Listing names would turn the join code into a
staff directory for anyone who has it, and a join code will end up written on a
whiteboard.

The server matches the typed name against `employees` for that org
(case-insensitive, trimmed, whitespace-collapsed) and **always returns the same
"sent to your manager" response** whether or not it matched. A miss records
nothing. A response that differed on a hit would make the endpoint a name oracle
and undo the point of not listing.

Matching is pure and lives in `lib/employee-portal/claim.ts`:

- exact normalised match → claim that employee
- multiple matches (two Daves) → no auto-claim; the manager resolves it
- no match → nothing recorded, same response

### 4. Session resolution

`lib/employee-portal/session.ts` → `getCurrentEmployee()`, mirroring
`getCurrentOrg()` in shape but nothing else:

```ts
type EmployeeSession = { orgId: string; employeeId: string; employeeName: string };
```

Returns the session or redirects. It resolves from `employee_accounts` where
`user_id = auth.uid() AND status = 'active'`. A `pending` account renders a
waiting screen, not the portal. A `revoked` one is treated as no account at all.

Every portal query scopes on **both** `organization_id` and `employee_id` from
this session — never on a value from the request. This is the portal's entire
security model, so it is one function and it is tested.

### 5. Routing

- New route group `app/(staff)/me/`, with its own layout (`robots: noindex`).
- `proxy.ts` gates `/me` and `/me/*` the same way it gates `/app/*`.
- `/app/*` stays members-only. `getCurrentOrg()` currently redirects a
  membership-less user to `/setup`; it must instead send a user who holds an
  active employee account to `/me`, or a bartender who taps an old link lands in
  the owner's setup wizard.
- A person who is both a member and an employee keeps full `/app` access; `/me`
  is available to them too. The two are independent.

### 6. Widening the snapshot

`toSnapshot()` in `app/(app)/app/payroll/approval-actions.ts` currently freezes
four fields:

```ts
{ employeeId, employeeName, totalHours, totalCompensation }
```

`computePayroll()` produces the rest — `role, regularHours, overtimeHours,
hourlyRate, regularPay, overtimePay, tipAmount, tipsPerHour,
effectiveHourlyRate, payType` — and it is discarded at submit.

The portal shows an approved breakdown, so the breakdown must be part of what
was approved. The snapshot widens to carry the full entry, plus the nights
behind it:

```ts
type SnapshotEntry = {
  // unchanged — what run-diff compares
  employeeId: string; employeeName: string;
  totalHours: number; totalCompensation: number;

  // new, all optional so pre-existing runs still parse
  breakdown?: {
    role: string | null;
    regularHours: number; overtimeHours: number; hourlyRate: number;
    regularPay: number; overtimePay: number;
    tipAmount: number; tipsPerHour: number;
    effectiveHourlyRate: number; payType: BarbackPayType;
  };
  shifts?: Array<{ date: string; hours: number; isOpener: boolean }>;
  /*
    The pool TOTAL on each night worked, and deliberately no per-night share.
    computePayroll works in period totals; a night-by-night share exists nowhere
    in the app, and deriving one by dividing would print a figure that disagrees
    with the tip total on the same card. The person's own share for the period
    is `breakdown.tipAmount`.
  */
  tipContext?: Array<{ date: string; poolTotal: number }>;
};
```

**`diffPayrollRun` keeps comparing only the original four fields.** Approval
semantics must not change as a side effect of this feature: a run is stale when
someone's hours or pay moved, not when a derived rate rounded differently.

**Back-compat is explicit, not accidental.** Runs approved before this ships have
no `breakdown`. The portal renders those as totals only, with a line saying the
detail was not recorded for that period. It never reconstructs a breakdown by
recomputing — that number would not be the one that was approved, and presenting
it as though it were is the failure this whole design is arranged around.

### 7. What the portal shows

`/me` — one page, mobile-first, since this is read on a phone in a stockroom.

- **This period, in progress.** Hours so far from `employee_shifts`, and
  explicitly no money: "these hours have not been approved yet". This is what
  lets someone notice a missing Tuesday while it can still be fixed.
- **Past periods.** One card per approved run, most recent first: total pay,
  total hours, and on expand the breakdown, the nights, and the tip context.
- Nothing about colleagues, ever. No totals that are not this person's, except
  the tip pool figures they opted into.

Tip context is per night worked: the bar's pool total for that night, frozen
into the snapshot with everything else so the one rule holds — **the portal reads
the snapshot, never a recompute.** Their own share is the period tip figure on
the same card; see the type above for why it is not broken down per night.

### 8. Manager side

- **Pending claims** surface in the existing employees screen
  (`app/(app)/app/employees/`), showing the typed name, the matched employee, the
  email and when it was requested. Approve / reject, gated on `canManagePayroll`
  — the same people who already correct hours and move tips.
- **Notification:** new event type `staff.claim_pending`, delivered inline (not
  on the daily cron — a new hire waiting a day to see their hours is the kind of
  thing that makes people stop using a tool). Defaults to owner + manager.
  `dedupe_key` on the claim id.
- **Settings** gains staff-access controls: enable/disable, show and rotate the
  join code, and revoke an active account.

## Error handling

| Case | Behaviour |
|---|---|
| Bad or disabled join code | Generic "that code was not recognised". Never says whether the bar exists. |
| Typed name matches nothing | Same success response as a match. Nothing recorded. |
| Typed name matches two employees | Claim recorded with no `employee_id` resolution; manager picks. |
| Claim already pending | Idempotent — returns the same response, no second row. |
| Employee record deleted | `ON DELETE CASCADE` removes the account. Next request redirects to a "no longer active" screen. |
| Account revoked | Treated as no account. No portal, no explanation of why. |
| No approved runs yet | Portal renders with the in-progress section only, and says so. |

## Testing

Pure, in `lib/employee-portal/` with vitest, matching the `lib/` convention:

- `claim.ts` — name normalisation, exact/ambiguous/no match, and that the
  response shape is identical in all three cases.
- `snapshot.ts` — projecting a `SnapshotEntry` to a pay stub; a legacy
  four-field entry projects to totals-only and never fabricates a breakdown.
- `run-diff` — existing tests must pass unchanged, plus a new one proving a
  widened snapshot with an identical four fields diffs as **not stale**.

Authorization tests are the ones that matter most and get written first:

- an active employee resolves to exactly their own `employee_id`
- a `pending` account resolves to no session
- a `revoked` account resolves to no session
- a portal query built from a session cannot return another employee's rows
- a user with only an employee account is redirected away from `/app/*`

`npm run audit:scope` must stay clean: every new `createAdminClient()` chain is
scoped by `organization_id`, or carries an `admin-scope-ok` justification.

## Out of scope

- Payout status (`payroll_payouts`) — excluded by instruction.
- Employees editing anything. The portal is read-only. Requesting a correction
  is a conversation with a manager, not a workflow.
- Shift schedules, availability, time-off. Different product.
- Employees seeing anything about other employees.

## Build order

1. `employee_accounts` migration + `getCurrentEmployee()` + authorization tests.
2. Snapshot widening + back-compat projection (independent of the portal).
3. Join code, claim flow, manager approval queue, `staff.claim_pending`.
4. The `/me` portal itself.

1 and 2 are independent and both must land before 4 is worth building.
