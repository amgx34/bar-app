# Overnight log (owner asleep)

Started 2026-11-25. The owner delegated every open decision to reasoning agents: **Fable = general manager** (decides and reviews), **Sonnet = implements and researches**, **Opus = debugs failing gates**. This file is the bookmark: where things stand, what was decided and why, and what is waiting for a human. Newest entries at the bottom.

## Guardrails in force
- Nothing live: no live DB, no live migration, no push, no deploy, no key rotation, no branch deletion, no real email, SMS or payment.
- Money, tips, stock and tenancy: failing test first, one separate revertable commit each.
- Every task ends green on `npx tsc --noEmit`, `npm test`, `npm run audit:scope`, and no new lint errors (baseline 60 problems, 27 errors), then a local commit. Branch: `rebuild/foundation`.
- If a gate cannot be made green: revert that task's uncommitted changes, record the failure here, and move to the next task.

## State at start
- Commits so far: Plan 1 close-out, P1 fixes (live-key guard, routing validation, payout tolerance, tips double-count on pay run and day-split, honest delete error), archive-employee feature, dashboard redesign, competitor matrix, screen pruning (4 dead files removed), link fixes.
- Waiting for a human, cannot be done by an agent: apply `supabase/migrations/20261125000000_employees_archived_at.sql` to dev, then live before deploying; rotate Gmail, Twilio and Groq keys; run the two real-data tips queries in `2026-11-25-decisions.md`.

## Entries

- **N1 done** (sonnet): no-access page uses `BUSINESS.email`; join notification link now `/app/payroll/employees`. 2 commits. Gates green (tsc, 1014 tests, audit:scope). Not browser-checked.
- **N2 done** (sonnet): deleted unused `updateBarSettings`; lint 60/27 -> 45/12 (new baseline for later items). 2 commits. Gates green.
