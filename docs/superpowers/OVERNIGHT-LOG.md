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
- **N3 done** (sonnet): Supabase CLI guard (`npm run supabase -- ...`), 11 tests, `supabase/README.md`. 1 commit. Gates green; lint unchanged (45/12). Orchestrator review found a gap: the guard takes the target from the env, not from the project the CLI is actually linked to (`supabase/.temp/project-ref`), so a CLI linked to live by another route would pass. Follow-up N3b dispatched.
- **N3b done** (sonnet): guard also checks the CLI's linked project (`supabase/.temp/project-ref`); 7 tests, 3 red first. 1 commit. Note: the agent used `git stash` in a shared tree while another agent worked; verified nothing was lost; later agents are told not to stash.
- **N4 done** (sonnet): `npm run audit:tokens`. 54/56 pairs pass; `border-strong` and `input` on `background` (light) are 2.997:1 vs the 3:1 target (same colour is 3.14:1 on card). No token changed; recorded in `2026-11-25-token-audit.md`. The script exits 1 until a human nudges `#7C93B5` slightly darker. 1 commit.
