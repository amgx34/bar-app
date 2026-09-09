# SDD ledger — plan: docs/superpowers/plans/2026-09-08-partial-payouts.md

Spec: docs/superpowers/specs/2026-09-08-partial-payouts-design.md (read, reachable)
Branch: partial-payouts
Base: 605b4bd

## Pre-flight conflict scan

### Cross-task rows (tasks sharing a file or an interface)

| A | B | A produces → B consumes | Finding |
|---|---|---|---|
| T1 | T5 | `covers_days`, `idempotency_key` columns → written by `markPaid` | OK — T1 precedes T5 |
| T1 | T5 | dropped `ux_payroll_payout_employee_period` → `markPaid` upserts on `organization_id,idempotency_key` | OK — new index created in T1 |
| T2 | T5 | `remainingAdvanceCapacity`, `totalPaidTo`, `Payout.id` → cap + delete-by-id | OK — names match |
| T2 | T7 | `summarizePayouts(entries, Map<string, readonly Payout[]>)`, `advancedTotal`, `totalPaidTo` | OK — names match |
| T3 | T4 | `lib/payroll/day-value.test.ts` — T3 creates, T4 appends | OK — sequential, T4 appends a new `describe` |
| T3 | T6 | `valueDays`, `DayValue` → dialog + picker | OK — signature matches T6 usage |
| T3 | — | exports `weekStartOf` from `overtime.ts` | OK — additive, no behaviour change |
| T4 | T6 | `PayrollEntry.tipsByDate`, `.shiftDays` → dialog props via T7 | OK — added in T4 Step 3 |
| T4 | T7 | `PayrollEntry.hourlyRate` (pre-existing), `.shiftDays`, `.tipsByDate` | OK |
| T4 | T8 | `computePayrollForOrg(orgId, start, end)` | OK — added T4 Step 4 specifically for T8 |
| T5 | T6 | `markPaid({..., coversDays, idempotencyKey})` | OK — signature matches |
| T5 | T7 | `deletePayout({payoutId})` replaces `unmarkPaid` | OK — T7 is the only caller |
| T6 | T7 | `PayoutDialog` props (`shifts`, `tipsByDate`, `hourlyRate`, `overtime`, `alreadyPaid`) | OK — T7 passes all five |

### Per-task self-consistency rows

| Task | Its tests vs its code | Its files vs later touches | Finding |
|---|---|---|---|
| T1 | no tests (migration) — verification is `db reset` or an explicit "not validated" note | T5 writes the columns it adds | OK |
| T2 | tests use `map()` helper rebuilt for lists; assert `outstanding` as balance | T7 consumes the new signature | OK |
| T3 | 9 tests cover threshold, straddle, isolation, tips, zero-shift, OT-off, week rollover | T4 appends to the same test file | OK |
| T4 | invariant test is arithmetic-only (computePayroll needs a DB) | — | **Weak test** — see Ruling 2 |
| T5 | no unit tests; cap logic tested at the pure seam in T2 | T6/T7 call it | OK — matches spec's testing section |
| T6 | no unit tests (presentational) | T7 renders it | OK |
| T7 | no unit tests (presentational) | — | OK |
| T8 | no unit tests (presentational + one query) | — | OK |

### Rulings made before execution

**Ruling 1 — the tree is expected to fail `tsc` between T2 and T7.**
T2 changes `summarizePayouts`'s signature, which breaks `payroll-tab.tsx` and
`payout-controls.tsx` until T7 rewires them. The plan says so explicitly in T2
Step 4 and T5 Step 5. Alternative was merging T2+T7 into one task, which would
produce a diff too large to review as a unit.
Decision: accept the red window. Each dispatch for T2-T6 states which files are
expected to fail and why, as fact from the plan; reviewers may still flag it.
Every task must still leave `npx vitest run` green — tests never go red.
Cost if wrong: a reviewer raises breakage that is expected, costing one
adjudication per task.

**Ruling 2 — T4's invariant test does not exercise `computePayroll`.**
The test as written asserts that a hand-written object's values sum to a
hand-written total, which is arithmetic, not a test of the production change. It
cannot fail if `addTips` is wrong. `computePayroll` needs a live database, so no
pure test can cover it.
Decision: keep the plan's test (it documents the invariant) but require the T4
implementer to ALSO extract the accumulator into a pure, exported helper in
`lib/payroll/` and test that directly — a real test of real code. The dispatch
carries this as a requirement.
Cost if wrong: one small extra module; if it turns out `addTips` cannot be
sensibly extracted, the implementer reports back and the test stays documentary.

## Task log

### Task 1
- dispatched: haiku, brief task-1-brief.md, BASE 605b4bd
- implementer DONE, commit e79a496, 648 tests pass, SQL not executed (no Docker/psql — honest in commit msg)
- review: spec ✅, quality Approved, 1 Important (plan-mandated), 2 Minor
- **Ruling 3:** reviewer is right that a nullable `idempotency_key` narrows protection —
  the old index blocked duplicates unconditionally, the new one only when the caller
  supplies a key. The spec calls that protection load-bearing, so leaving a hole the
  spec's own reasoning argues against is wrong. Decision: backfill existing rows with
  gen_random_uuid(), SET NOT NULL, make the unique index unconditional. Safe because
  markPaid (T5) is the only writer and its zod schema already requires the key.
  Cost if wrong: if some unknown writer omits the key, its insert now fails loudly
  instead of silently duplicating — the better failure.
- fix round 1/5 (1 addressed, 0 open; commits e79a496..4a836ea)
- Task 1: complete (commits 605b4bd..4a836ea, review clean)

### Task 2
- dispatched: sonnet, brief task-2-brief.md, BASE 4a836ea
- implementer DONE_WITH_CONCERNS, commit 540404e, 658 tests pass (+10)
- concern raised: it amended 3 pre-existing tests. Controller inspected the diff before review.
- **Ruling 4:** two of the three were mechanical (`paid('1')` -> `paid('1', 800)`; under the old
  model existence meant paid so the amount was irrelevant, under a ledger it is the whole point).
  The third is a REAL behavioural change and is correct: "owes the live figure, not the frozen
  one" asserted that a run corrected UP to $850 after an $800 payout left $0 outstanding. Under
  the ledger it leaves $50 — which is money the person is genuinely owed. The old rule silently
  swallowed underpayments created by an upward correction. Matches the spec's
  `max(0, totalCompensation - paidSoFar)` exactly.
  Cost if wrong: a bar that relied on "marked paid means done regardless of later corrections"
  now sees small balances reopen after a correction. That is the correct answer, but it is a
  visible change beyond "add partial payouts" and belongs in the release note.
- note: Ruling 1 named payout-controls.tsx as the second red file; it is actually
  payout-actions.ts (Task 5's). Red window otherwise exactly as predicted.
- review: spec ✅, quality Approved, 0 Critical/Important, 2 Minor
- Task 2: minor (deferred): overpayment-clamp test uses one employee; cross-contamination is
  impossible by construction, so coverage nicety only.
- Task 2: minor (deferred): a zero-compensation employee with no payouts now counts toward
  paidCount (balance 0 <= 0). Untested side effect. Controller view: this is an improvement —
  under the old rule such a person could never be "paid", so allPaid stayed false forever and
  the progress strip read "0 of 1" for good. Wants a test to lock it in deliberately.
- Task 2: complete (commits 4a836ea..540404e, review clean)

### Task 3
- dispatched: sonnet, brief task-3-brief.md, BASE 540404e
- implementer DONE, commit 9aca3b0, 667 tests pass (+9)
- review: spec ✅, quality NEEDS WORK — 2 Important, 1 Minor. Both Importants are defects in
  the PLAN's own test code, copied verbatim as instructed, so they are controller rulings.
- **Ruling 5:** the test named "splits the day that straddles the threshold" does not straddle.
  Every fixture uses flat 10h shifts, so Mon-Thu lands on exactly 40 and Thursday comes out
  all-regular. An all-or-nothing implementation ("if this day would push the week over 40, make
  the WHOLE day overtime") passes it identically. That is the single most load-bearing line in
  the feature. Decision: fix — add a fixture with uneven hours forcing one day to split into
  nonzero regular AND nonzero overtime at once.
  Cost if wrong: none; this strictly adds coverage.
- **Ruling 6:** same-date folding (two shift rows for one night) is implemented but untested;
  removing the fold would double-count and no test would notice. Decision: fix — add a test
  passing two rows sharing a date.
  Cost if wrong: none; strictly adds coverage.
- Task 3: minor (deferred): `hours` is round2(regular + overtime) while the two parts are
  rounded independently, so `hours !== regularHours + overtimeHours` is possible at sub-cent
  level. Cosmetic; note if the file is touched again.
- fix round 1/5 (2 addressed, 0 open; commits 9aca3b0..a0cb92a). Both new tests passed against
  the UNCHANGED implementation, so the logic was already correct — only the proof was missing.
- Task 3: complete (commits 540404e..a0cb92a, review clean)

### Task 4
- dispatched: sonnet, brief task-4-brief.md, BASE a0cb92a
- implementer DONE, commit a49e720, 678 tests pass (+9), audit:scope clean
- extracted lib/payroll/tip-ledger.ts + tests per Ruling 2 (accumulator now really tested)
- stop hook flagged 4 eslint problems in payroll/actions.ts. Controller checked BASE vs HEAD:
  IDENTICAL 4 problems at both (1 unused-import warning, 3 pre-existing `any`), only line
  numbers shifted. Task 4 introduced none. No action.
- controller note: do NOT use `git stash` on this repo — tracked obj/ artifacts conflict on
  pop. A stash push with a clean tree silently popped an unrelated older stash instead.
  No work lost; tree verified clean at a49e720.
- Task 4 review dispatch #1 (opus) was killed mid-run by a session rate limit — no verdict.
  Re-dispatched on sonnet.
- background security review of a49e720 flagged "broken-access-control" in payroll/actions.ts.
  Controller assessment: the finding is about the CONTRACT, not a live hole. Previously the org
  could only come from getCurrentOrg(); now an arbitrary orgId is accepted. Today it is still
  defended in depth because the function uses the RLS-scoped createClient() — verified the
  ORIGINAL used createClient() too, so Task 4 changed nothing about the client. Not a regression.
- **Ruling 7 (load-bearing plan defect, mine):** because computePayrollForOrg queries through
  the RLS-scoped client, and an employee has no memberships row, the membership-keyed FOR ALL
  policy on `employees` returns zero rows for them. Task 8's portal would therefore compute
  earnedSoFar = 0 and tell every employee they are owed nothing — a silently wrong wage figure,
  the exact failure this codebase refuses. My plan missed it.
  Decision: give computePayrollForOrg an optional 4th parameter — the Supabase client to use,
  defaulting to createClient(). The manager path keeps RLS as a second line of defence,
  UNCHANGED. The portal passes createAdminClient() explicitly, scoped by an orgId that came from
  an active employee_accounts row and nothing from the request. The bypass is then visible and
  auditable at the one call site that needs it, rather than widened for everybody.
  Rejected alternative: switching the whole function to the admin client — that removes RLS
  defence-in-depth from the manager path to serve one caller.
  Rejected alternative: computing earnedSoFar separately in the portal — duplicates the tip
  math, which the spec forbids precisely because two calculations drift.
  Carried into Task 8's dispatch.
  Cost if wrong: if the optional-client parameter is misused by a future caller passing an admin
  client with an unvalidated orgId, that is a cross-tenant read. Mitigated by audit:scope and by
  the doc comment naming the two legitimate callers.
- review (sonnet, retry): spec ✅, quality Approved. Refactor confirmed behaviour-identical
  (every org.id -> orgId, same `?? {}` default, guard moved to the wrapper, fires at the same
  time). All five per-night tip sites route through addTips; the transfer application correctly
  does NOT. shiftDays shape matches valueDays.
- reviewer independently reached Ruling 7 and refined it: an arbitrary orgId does NOT leak
  another bar's payroll — RLS filters to zero rows and the function returns [] via its existing
  early return. Fails safe. So the background security flag is a contract concern, not a live
  vulnerability. The real defect is the portal getting [] for its OWN org.
- Task 4: minor (deferred): the brief-mandated "sums to the period figure" test in
  day-value.test.ts is unfalsifiable — three literals, no production call. Superseded by the
  tip-ledger tests added under Ruling 2; consider deleting it in the final pass.
- Task 4: minor (deferred): "would catch a broken accumulator" test in tip-ledger.test.ts
  builds the broken map by hand rather than through addTip; redundant with the happy path.
- Task 4: complete (commits a0cb92a..a49e720, review clean, 1 Important carried to Task 8)

### Task 5
- dispatched: sonnet, brief task-5-brief.md, BASE a49e720
- implementer DONE, commit fceff7d, 678 tests pass, audit:scope clean
- implementer correctly corrected MY dispatch: 3 files fail tsc (payout-controls, payout-dialog,
  payroll-tab), not 1. All three are owned by Tasks 6/7. My dispatch was imprecise; it reported
  honestly rather than quietly matching my claim.
- review: spec ✅, quality Approved, 0 Critical/Important, 2 Minor. Cap verified as
  whole-period earned-minus-paid (NOT ticked days), float tolerance in the permissive direction,
  every admin query org-scoped, deletePayout cannot reach another bar's row.
- Task 5: minor (deferred): same idempotency key with a DIFFERENT amount is silently dropped and
  still returns ok:true. Inherited from the plan's own snippet. Not reachable in practice — the
  key is generated per dialog-open, so a different amount always carries a different key — but
  the code comment says "the second insert conflicts", which misdescribes ON CONFLICT DO NOTHING.
  Comment wording worth fixing.
- Task 5: minor (deferred): TOCTOU on the cap — the capacity read and the insert are not atomic,
  so two concurrent markPaid calls for one employee could both pass. Controller view: park it.
  It needs two simultaneous submissions for the same person, which is one owner racing
  themselves; the consequence is a small overpayment that the summary clamps to zero and the
  payments list shows plainly. An advisory lock or serializable txn is real complexity for a
  Friday-afternoon single-operator workflow.
- Task 5: complete (commits a49e720..fceff7d, review clean)

### Task 6
- dispatched: sonnet, brief task-6-brief.md, BASE fceff7d
- implementer DONE, commit 9ba31a3, 678 tests pass, eslint clean on both files
- review: spec ✅, quality Approved, no Critical/Important/Minor worth blocking. Idempotency key
  verified generated once per dialog OPENING and regenerated on close->reopen; one-tap default
  preserved (method pre-selected, picker behind a disclosure link); the whole-balance escape
  resets `selected` so a stale tick cannot leak into a full payment; no asChild.
- reviewer raised one ⚠️ it could not verify: can the run total differ from the nights sum for a
  reason OTHER than a tip transfer? Controller resolved it: YES. `openerBonusHours`
  (payroll/actions.ts:677,808,907) adds bonus HOURS to an opener's pay, and lib/payroll/day-value.ts
  has no concept of it (grep: 0 matches). So an opener on a bonus paid as hours also produces a gap.
- Task 6: minor (deferred): the dialog's gap warning attributes the difference to a tip transfer,
  but an opener bonus paid as hours causes it too. The operative sentence — "the run's figure is
  what caps this payment" — is correct, and the cap is enforced server-side regardless, so this is
  wording, not arithmetic. Broaden to "a tip transfer, or an opener bonus paid as hours".
- Task 6: complete (commits fceff7d..9ba31a3, review clean)

### Task 7
- dispatched: sonnet, brief task-7-brief.md, BASE 9ba31a3
- implementer DONE, commit b1ee006. Controller independently verified ALL of: tsc COMPLETELY
  CLEAN (first time since Task 2), eslint clean on all 4 touched files, 678/678 tests,
  audit:scope clean, npm run build succeeds.
- review: spec ✅, quality Approved, 0 Critical/Important, 2 Minor. Verified: undo targets the
  last payment and "last" is well-defined (paid_at is set server-side and loadPayouts orders
  ascending, so array order IS chronological); the three states are exhaustive and mutually
  exclusive at every boundary incl. overpayment; the dialog gets balance + alreadyPaid;
  overtime comes from overtimeFromSettings (not hardcoded) and reaches BOTH render paths;
  read-only roles get the fact without a control.
- ⚠️ resolved by controller: `bar_settings` null is handled by the `?? {}` at the call site.
- Task 7: minor (deferred): `payouts[payouts.length - 1]` computed twice in payout-controls;
  hoist to one `const last`.
- Task 7: minor (deferred, pre-existing): an employee owed $0 can never reach "fully paid"
  without an explicit $0 payout row. Predates this work; note if it surfaces in support.
- Task 7: complete (commits 9ba31a3..b1ee006, review clean)

### Task 8
- dispatched: sonnet, brief task-8-brief.md, BASE b1ee006, carrying Ruling 7
- implementer DONE, commit 8f20f46. Ruling 7 implemented exactly: optional 4th `client` param
  defaulting to createClient(), manager path untouched, portal passes the service-role client.
  Doc comment is stronger than I asked — it names the silent-$0 failure mode.
- controller verified: tsc clean, 678/678, audit:scope clean, build succeeds.
- review: spec ✅, quality NEEDS WORK — 1 Critical, 1 Important, 1 Minor.
- **Ruling 8 (Critical, my plan's defect, FIXING NOW):** the advances query uses CONTAINMENT
  (`gte period_start`, `lte period_end`) against a range derived from worked days, but payouts are
  recorded against the full calendar period from the payroll screen. Confirmed by tracing
  lib/date-range.ts -> payroll-tab -> payout-controls -> payout-actions:161, and by reading the
  query. Worked Tue-Fri with a payout stored Mon-Sun: `Mon >= Tue` is false, so it matches
  NOTHING. advancesReceived reads $0 and stillToCome overstates by the whole advance — the exact
  silently-wrong money figure the design exists to prevent, on the one screen Task 8 adds.
  Decision: change to an interval OVERLAP test — `period_start <= periodEnd AND period_end >=
  periodStart`. Cost if wrong: a payout spanning both an approved and an in-progress period would
  be counted against the in-progress one; that is still far better than counting none, and the
  approved side reads frozen snapshots which are unaffected.
- **Ruling 9 (Important, PARKED with reasoning):** because computePayrollForOrg now receives its
  client as a parameter, the literal `createAdminClient` appears nowhere in payroll/actions.ts
  (grep: 0), and scripts/audit-admin-scope.mjs gates whole files on that substring — so its ~25
  `.from()` chains are never scanned, including the new admin-capable path. NOT a regression: the
  count was 0 before this work too, so the file never had coverage. The reviewer manually verified
  every query inside computePayrollForOrg does filter `.eq('organization_id', orgId)`, so there is
  no live leak. Decision: park. Extending the gate to files declaring a `SupabaseClient` parameter
  would immediately surface 3 PRE-EXISTING unscoped inserts in that file (employees:245,
  employee_shifts:318, z_report_days:383) and turn the audit red; triaging those is a separate
  change and not something to attempt in a fix round at the end of a plan.
  Cost if wrong: a future edit adds an unscoped query to that file and the script stays silent.
  Carried to the final review.
- Task 8: minor (deferred): the implementer's own report undersold Ruling 9's effect — it framed
  it as occasional false positives rather than zero coverage for the file.
- fix round 1/5 (1 addressed, 0 open; commits 8f20f46..e42d06f). Overlap predicate verified
  column-by-column, plus the three date cases.
- Task 8: complete (commits b1ee006..e42d06f, review clean, Ruling 9 parked)

## All 8 tasks complete. Final whole-branch review next.

## Final whole-branch review (opus, 605b4bd..e42d06f)
NOT SAFE TO MERGE as-is. 2 Critical, 6 Important, 6 Minor. Approval/snapshot/run-diff/NACHA-gate
and notifications verified genuinely untouched; cap sequencing verified for pay->undo->pay, two
advances, and a downward correction; Ruling 7 verified sound; tenancy clean.

- **C1 (Critical):** app/api/payroll/nacha/route.ts:81,120,132 pays `entry.totalCompensation`
  and reads payouts nowhere (grep: 0). For a direct-deposit bar an advance is handed over in cash
  and then the FULL total leaves the bank — a real, unrecoverable overpayment, logged as correct.
  The branch introduced this: before, existence meant paid and there were no partial amounts.
- **C2 (Critical):** payout-controls.tsx — undo exists ONLY in the fullyPaid branch, so a
  mis-recorded advance can never be removed while a balance remains.
- **I3:** the payments list the spec §6 requires does not exist and `covers_days` has zero
  readers — an overpayment is invisible and a `title` tooltip is unreachable on phones.
- **I4:** cap/loadPayouts key on an EXACT period, portal on overlap. An advance made on the week
  view is invisible on the month view, so the cap sees alreadyPaid=$0 against a month-sized
  earned figure and PERMITS paying the month on top of the week's advance.
- **I5:** "paid out" labels `advancedTotal`, which excludes the fully paid, so the figure falls
  as people are settled.
- **I6:** both payout reads discard the Supabase error. If the app deploys before the migration
  runs, the select (which names the new columns) fails, every employee reads unpaid, and every
  markPaid insert fails — silently. Largest deployment risk given the migration is unexecuted.
- Minors M9-M14 as listed by the reviewer.

### Fix wave (ONE dispatch, per the skill — no second wave)
- **Ruling 10:** fix C1, C2, I3, I5, I6 as the reviewer specifies. All are money-visible or
  deployment-critical and all are cheap.
- **Ruling 11 (I4):** do NOT switch loadPayouts to overlap — on the week view that would pull in a
  month-sized payout and make the week look overpaid, trading one wrong figure for another. Fix
  only the CAP to read by overlap, so it can never be walked around, and leave the display exact.
  The result is safe-but-occasionally-conservative: the cap may refuse where the screen shows
  nothing paid, and the refusal message already names both figures. Preferring a refusal to an
  overpayment is this codebase's own rule.
  Cost if wrong: an owner switching views sees a refusal they must read to understand. Better
  than a silent double payment.
- Also in the wave: M9 (broaden the gap warning), M10's misleading comment, delete the
  unfalsifiable day-value test, note in computePayrollForOrg that the file is outside audit:scope.
- Deferred per the reviewer's triage: Ruling 9, TOCTOU, I7, I8, M11-M14, the Task 2/3/4/7 minors.
  Ruling 4's behaviour change goes in the release note.

### Fix wave re-review (sonnet, e42d06f..742ee23)
C2, I3, I4 (asymmetry correct — cap overlap, display exact), I5, I6, M9, M10, dead-test deletion
and the audit-scope note: ALL ADDRESSED. One residual:

- **C1 NOT fully closed / new Critical:** app/api/payroll/nacha/route.ts uses `loadPayouts`
  (EXACT period) to net advances, while the cap in the same wave moved to OVERLAP. So an advance
  recorded on the week view and exported on the month view is invisible to the netting and the
  full gross leaves the bank — the identical unrecoverable overpayment C1 exists to prevent,
  reachable by toggling a period view. On the money-movement path.
- **Ruling 12:** load-bearing and about real money leaving a bank account, so I am ruling rather
  than parking. The ACH route must read advances by the same interval OVERLAP the cap uses.
  Over-deducting (a month-scoped advance reduced from a week's export) underpays, which is
  visible and recoverable; under-deducting overpays, which is neither. This codebase's own rule is
  to prefer the safe failure. The deducted payouts are recorded in dd_audit_log so the file
  reconciles.
  Cost if wrong: an export could under-send where an advance spans a wider period than the run,
  and the owner tops up. Preferred over an unrecoverable overpayment.
- residual C1 closed: commit 66a51e2. Extracted `loadPayoutsOverlapping` and used it in BOTH the
  cap and the ACH route, so the two reads cannot drift apart again — which is what caused the
  residual. Display still uses exact-match `loadPayouts`. Controller verified.
- FINAL STATE VERIFIED: tsc clean, 684/684 tests (41 files), audit:scope clean, build succeeds.

## Plan complete. 19 commits, 605b4bd..66a51e2.
