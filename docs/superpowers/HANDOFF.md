# Handoff: continuing on another machine

Branch: `rebuild/foundation`. Plan: `plans/2026-11-24-rail-foundation.md`. Design: `specs/2026-11-24-rail-rebuild-design.md`.
Findings so far: `findings/` (baseline, tooling audit, security review, route inventory).

## Where it stopped

Tasks 1-6 are done and committed. Task 6 Step 6 is open: `npm run dev` printed "Ready" on the
Windows PC and then exited, so `localhost:3000` never answered. The cause was not diagnosed.
Next after that: Task 7 (seed a demo org through `POST /api/demo`, then index with Graphify).

Not verified: that `supabase/schema-export/baseline.sql` was applied to the dev Supabase project.

## Setting up the new machine (nothing below is in git)

1. `npm install`.
2. `.env.local` (live project values) and `.env.development.local` (the dev project: URL, anon key,
   service-role key; third-party keys left blank). Both are gitignored, so copy them by hand.
   `npm run dev` runs `scripts/dev/check-dev-env.ts` first and refuses to start if dev points at live.
3. Claude plugins are installed per machine under `~/.claude` (ponytail, impeccable, hallmark, brag,
   ECC). Task 1 of the plan describes the audit-then-register steps; redo them on this machine.
4. Graphify: `pip install graphifyy`, then `graphify install`. Do NOT run `graphify claude install`.
5. `scripts/dev/run-vitest.mjs` works around a Windows lowercase-drive-letter bug. On macOS plain
   `npm test` works the same.
6. `.claude/settings.local.json`, `.playwright-mcp/` and `.superpowers/` are local-only.

## Rules that carry over

Money-test failures stop the work and go to the owner. Fixes touching money, tips, stock or tenancy
get the owner's review. Never edit a test expectation to match the code.
