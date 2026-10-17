# Task 10 report

## Built
- `lib/payroll/run-diff.ts`: `SnapshotEntry.withholding?: Withholding` (optional). Staleness comparison untouched.
- `app/(app)/app/payroll/run-withholding.ts` (new): `computeRunWithholding` returns `off | unusable | ok`. One source for the review screen and the snapshot.
- `review/page.tsx`: notice, per-employee withholding row with expandable breakdown, shortfall warning.
- `approval-actions.ts`: `freezeRun` (used by submit, stale-approve and override) adds `withholding` only when kind is `ok`.
- `lib/payroll/run-diff.test.ts`: 3 new tests.

## Rulings
- R4: `computeRunWithholding` calls `loadEmployees` itself and builds the id map.
- R5: complete `Withholding` from a local factory `wh()`, no casts.
- R6: `tablesStatus` reused. Unusable: the screen shows the message and no figures, the snapshot carries none. Placeholder 2026 tables take this path. Bar with tax off: a quiet "switched off" line, nothing computed or snapshotted.
- R12: unclassified is an amber "Needs W-2 / 1099", not_taxed is "Contractor", disabled is "Tax withholding is off". Exempt shows a label with the total.
- R21: assumption comment at the call site, naming `totalCompensation` as the alternative.
- Shortfall lists all five uncollected fields; Additional Medicare is kept separate.
- Gross-payout notice shown when kind is ok. Payout code and nacha untouched.

## Deviation
- YTD range ends the day BEFORE the period start (brief said "to period start", which double-counts the first day). A period starting on or before 1 Jan skips the YTD call.

## Tests, each against a wrong implementation
1. Changed withholding total is not stale: catches a diff comparing withholding.
2. Entry without withholding vs with: catches legacy runs going stale.
3. Pay change is stale with withholding identical: catches comparison disabled wholesale.

## Verified
tsc clean, npm test 872 passed, npm run build passes.

## Not verified / unsure
- No UI render test or live run of the review page. The `ok` path is unexercised in a browser because 2026 tables are placeholders.
- `freezeRun` calls `getCurrentOrg()` again for settings; acceptable but not unit tested.
- YTD uses `totalCompensation` (includes tips) per the brief.

## Review follow-up
- Finding 1: extracted `ytdRange` and `snapshotWithholding` (and the `RunWithholding` type) to `lib/payroll/tax/run.ts`. Tests in `run.test.ts` and `run-withholding.test.ts` (mocked `computePayroll`/`loadEmployees`/`tablesStatus`; placed under lib/ because vitest only includes `lib/**`). Each assertion names the wrong implementation. Mutation check: reverting the end bound to `startDate` fails 4 tests. Unusable and off produce an object with no `withholding` key; asserted via `Object.keys(...)` equal to `[]`.
- Finding 2: `freezeRun` takes `withWithholding`. Submit and override pass true. Approve freezes false for the diff, and re-freezes true only when the diff is stale and changes are accepted.
- Verified: tsc clean, npm test 885 passed, build passes.
- Not tested: the `freezeRun` flag wiring itself (server action, needs a database); only the pieces it composes are pinned.

## R22 (supersedes R21)
Tips are paid on the cheque, so `availableToWithhold` is now `e.totalCompensation`. The unconfirmed-assumption comment is replaced with the confirmed fact, the consequence (a bar cashing tips out nightly would need `regularPay + overtimePay`), and the note that this is a global assumption, not a per-org setting. Shortfall handling and its tests are untouched. New test: wages $50 / total $800, asserting the result equals the engine run with available = 800. A premise assertion checks that available = 50 gives a different total. (The first draft used $100 of wages, the premise failed because $79 is still covered, and I corrected the input.) tsc, tests and build pass.
