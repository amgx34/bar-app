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
- **N5 done** (sonnet): walk #14 (16 low-contrast classes -> `accent-text`) and #15 (well date row wraps at 390px, aria-labels). 1 commit, class names and labels only. Browser-checked the 390px overflow; the amber text on tax and direct-deposit is checked against token ratios only. Lint unchanged (45/12).
- **N6 done** (sonnet): `navigation-validation.md` and `lib/nav/destinations.ts` (+50 tests, red first), not wired. 2 commits. Click counts from code, not measured: 17 -> 16 total; tasks 5 (order from a rep) and 7 (tips page) are one click longer on desktop. Finding: no page-level role gates exist (all 7 permission helpers gate actions), so every role sees all five destinations. Visible rebuild (Task 7 steps 3-4) stays deferred to a human plus watched browser checks.
- **N7 done** (13 sonnet agents): six screens critiqued twice plus measured evidence, in `docs/superpowers/findings/critique/` (`summary.md` first). Averages: Payroll Review 21.5, Books 22.0, Inventory 22.5, Shipments 24.5, Sales 24.5, Payroll 26.0; spreads 0 to 3, no third reviews needed. **Needs a human, not fixed:** (1) Payroll Review has a local-only 'Confirm Payroll' button beside the real approval and the Approved badge sits over live recomputed figures; (2) Books shows $0 COGS as 0.0% pour cost and 87.4% profit with no warning; (3) Inventory's Low/In Stock chips write `?stock=` the page never reads; (4) Shipments voided rows look live. 1 commit, documents only. The day-split label inconsistency ("15% of tips" vs "58% of tips") is folded into N9.
- **N9 done** (sonnet): day split applies tip removals like the pay run (`nightForSharing`, 7 tests red first), shows the over-allocation warning, and labels every percentage with its base ("85% / 15% of the shared pool"). Verified in the browser for 2026-11-19 (reconciles to the cent). The removal line and over-allocation alert were not seen in the browser (the demo has neither). `removalOverdrawn` is computed but not shown anywhere. `computePayroll` not edited. 1 commit (the three parts share the same files).
