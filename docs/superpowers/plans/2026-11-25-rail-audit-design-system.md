# Rail Audit, Design System and Navigation Plan (Plan 2 of 5)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Know where Rail stands against its competitors and against the 16 laws, settle one set of design tokens for the site and the app, and move the app to a validated five-destination navigation without breaking a single existing URL.

**Architecture:** Research and critique produce files under `docs/superpowers/findings/`. Everything with logic (the route map for the new navigation, the token contrast check) is a small pure function in `lib/` or `scripts/` with a vitest test written first. Screens are changed only after a critique says so; money, tips, stock and tenancy are never touched by this plan.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` first), Base UI, Tailwind 4 tokens in `app/globals.css`, vitest 4, Playwright with system Chrome (scripts live in the session scratchpad, not the repo), Impeccable (`PRODUCT.md`, `DESIGN.md` and `.impeccable/design.json` already exist), Hallmark, the `web-fetch` agent for public competitor pages.

**Spec:** `docs/superpowers/specs/2026-11-24-rail-rebuild-design.md` (phases 2 and 3, the 16 laws). **Inputs from Plan 1:** `docs/superpowers/findings/2026-11-25-walk-findings.md`, `2026-11-25-for-owner-p0-p1.md`, `2026-11-24-baseline.md`, `route-inventory.md`.

**Plans after this one:** **3** animated front page; **4** app simplification and the packages table; **5** go-to-market pack and launch video.

## Global Constraints

- Dev project only. `npm run dev` already refuses to start on live Supabase or on live Gmail, Twilio, Groq, Clover or VAPID keys; do not set `RAIL_ALLOW_LIVE_DEV` or `RAIL_ALLOW_LIVE_THIRD_PARTY`. Third-party integrations are disabled by placeholder values in `.env.development.local`.
- No edits to money, tips, stock or tenancy logic in this plan. Anything found there goes to `findings/` and the owner. Money tests are never edited to pass; a failing money test stops the work.
- A fix with logic gets a failing test first. `npm test`, `npx tsc --noEmit`, `npm run audit:scope` and `npm run lint` (no new errors against the Plan 1 baseline of 29) pass at every checkpoint.
- Each task ends with a **Checkpoint**: stage that task's files and show `git diff --stat`. Commit only what the owner has authorized; a change that touches money, NACHA or tenancy is held for the owner's review even when commits are authorized.
- Competitor research uses public pages only: no logins, no scraping behind a paywall, no terms-of-service evasion. Every claim records its URL and the date read. A claim that cannot be verified is marked `unverified`, not guessed.
- Anything only the owner can provide is marked **OWNER ACTION**. Do not invent it.

## Lessons from Plan 1 that shape this plan

- **A critique score is noisy.** Independent reviewers disagreed by about three points on the same page, and a fix loop chasing a target (35/40) oscillated 28, 31, 27, 28 and rewrote a page by a third. So: score every screen twice with separate reviewers and use the average; never loop to a number; treat a one-reviewer change under four points as noise.
- **Heuristics 7 (flexibility) and 10 (help) cap a score** unless a feature exists. Record those as product gaps, not visual defects.
- **Detector and measured evidence is cheap and reliable; opinions are not.** Keep both assessments isolated and report them separately.
- **Silence shown as zero is the failure this codebase keeps producing.** Every critique checks error, empty and not-configured states, not just the happy path.

## Review Focus

- **Navigation change breaks bookmarks or the staff portal** (`/me`, deep links, emailed links, `next=` redirects). Tested in Task 7 with a route map that must resolve every URL in `route-inventory.md`.
- **Role gates** (`lib/permissions.tsx`): a destination must not appear to a role that cannot use anything in it. Tested in Task 7.
- **Token drift between the landing page and the app** (`app/page.tsx`, `lib/site.ts`, `globals.css`). Checked in Task 6.
- **Contrast in both themes and in print** for every token pair. Tested in Task 6.

---

### Task 1: Owner decisions that gate the rest

**Files:** `docs/superpowers/findings/2026-11-25-decisions.md` (create)

The Plan 1 walk left four things only the owner can decide. Nothing later depends on the answers except where noted, but they must be on record.

- [ ] **Step 1: OWNER ACTION, tips double-count (P1 #2).** Is the Z `cc_tips` total meant to include an individual-mode server's tips? See the update at the end of `2026-11-25-for-owner-p0-p1.md`. Record yes or no, and whether one real night has been checked by hand.
- [ ] **Step 2: OWNER ACTION, employee delete (P1 #3).** The `employees` table has no DELETE policy, so deletes are silently refused (the action now says so). Choose: add a policy, deactivate instead of delete, or keep deletion admin-only. Record the choice.
- [ ] **Step 3: OWNER ACTION, review the three held fixes.** Payout settled-tolerance (`lib/payroll/payouts.ts`), routing-number validation (`lib/direct-deposit/routing.ts`, settings action, NACHA route), and the honest delete error (`payroll/actions.ts`). Record approve or change for each, then commit.
- [ ] **Step 4: OWNER ACTION, two small calls.** Remove the two stale `.worktrees/` (both are 0 commits ahead); and whether to rotate the Gmail, Twilio and Groq keys that were printed to a session terminal during Plan 1.
- [ ] **Checkpoint:** stage `2026-11-25-decisions.md`.

### Task 2: Competitor matrix from live pages

**Files:** `docs/superpowers/findings/competitors/<name>.md` per competitor, `docs/superpowers/findings/competitors/matrix.md` (create)

- [ ] **Step 1: Fix the list.** Start from the spec: Toast, MarginEdge, BevSpot, WISK, MarketMan, Bar Cop, 7shifts, Restaurant365. Search for others a bar owner would consider (POS-native back offices, payroll-for-hospitality tools). **OWNER ACTION:** approve the final list of about ten before reading begins.
- [ ] **Step 2: Read each one's public pages** (home, pricing, features, a product tour or help page if public) with the `web-fetch` agent, one agent per competitor, in parallel. For each record: who it targets, headline promise, the top-level navigation they show, what they charge and how (per location, per user, tiers), the three most-claimed features, onboarding model (self-serve or sales call), integrations named, and anything a bar owner would call a dealbreaker. Every line carries its URL and `read on 2026-11-25`. Unverifiable or gated claims are written `unverified`.
- [ ] **Step 3: Write `matrix.md`:** one row per competitor, columns for target, price model, nav shape, inventory, payroll and tips, sales analytics, supplier ordering, POS integrations, mobile, onboarding. Add a short section: what Rail has that none of them show, what all of them have that Rail lacks, and which of Rail's five proposed destinations each competitor also uses.
- [ ] **Checkpoint:** stage `competitors/`.

### Task 3: Screen-by-screen critique, scored twice

**Files:** `docs/superpowers/findings/critique/<route-slug>.md` per screen, `docs/superpowers/findings/critique/summary.md` (create)

- [ ] **Step 1: Scope.** The page routes in `route-inventory.md` with `needsParams: false` (about 22 app pages plus the public and staff pages), at 1280 and 390. The dashboard already has three snapshots in `.impeccable/critique/`; critique it once more only if its design changed.
- [ ] **Step 2: Run the dual-assessment critique per screen** (design review and detector plus measured evidence as two isolated agents; the review agent is never told a target score and never sees the detector output). Run it **twice per screen with separate reviewer agents** and record both scores. Use the Hallmark skill as a second lens on the public pages.
- [ ] **Step 3: Record per screen:** both totals and the average, the 10 heuristic scores, P0-P3 issues, the measured findings (contrast, targets, landmarks, console), and which issues are product gaps (heuristics 7 and 10) rather than visual defects. If the two scores differ by more than four, run a third and note the spread.
- [ ] **Step 4: Write `summary.md`:** a table of screens by score, the five lowest, issues that recur on three or more screens (these are design-system problems, fed to Task 6), and the cognitive-load failures.
- [ ] **Checkpoint:** stage `critique/`.

### Task 4: Score the app against the 16 laws

**Files:** `docs/superpowers/findings/laws-matrix.md` (create)

- [ ] **Step 1:** Build a screen-by-law table from Task 3's evidence (Hick, Fitts, Jakob, Proximity, Miller, Doherty, Von Restorff, Minimize target distance, Serial position, Peak-End, Zeigarnik, Prägnanz, Similarity, Uniform connectedness, Tesler, Postel). Each cell is pass, partial or fail with a one-line reason and a screenshot reference. Doherty needs real timings: measure the time to first useful paint and to feedback after the main action on each screen with Playwright and record the numbers.
- [ ] **Step 2:** List the ten worst law failures by how many screens they affect. Note which laws the current navigation fails by itself (Miller: the sidebar has six groups and about twelve items; Von Restorff: more than one accent in use; Zeigarnik: only payroll shows unfinished work).
- [ ] **Checkpoint:** stage `laws-matrix.md`.

### Task 5: Validate the five destinations

**Files:** `docs/superpowers/findings/navigation-validation.md` (create)

- [ ] **Step 1:** Map every route in `route-inventory.md` to one of Today, Stock, Sales, Team & Pay, Books, Profile menu (Settings, Reps) or Staff portal, using the spec's table as the hypothesis. Flag every route that fits two homes or none (for example `/app/tax`, `/app/reps`, `/app/inventory/analytics`).
- [ ] **Step 2:** Write the top ten tasks of the two PRODUCT.md users (the owner closing the night, the manager on shift) as click paths today and under the proposal; count clicks and screens. A proposal that makes an important task longer is rejected or adjusted.
- [ ] **Step 3:** Compare with the competitor navigation in `matrix.md` and with the role gates in `lib/permissions.tsx` (which roles see which destination).
- [ ] **Step 4: OWNER ACTION.** Present the final destination list, the contested routes with a recommendation each, and what moves to the profile menu. The owner approves before Task 7.
- [ ] **Checkpoint:** stage `navigation-validation.md`.

### Task 6: One set of tokens for the site and the app

**Files:** `app/globals.css`, `DESIGN.md`, `.impeccable/design.json`, `scripts/design/check-tokens.ts` and `scripts/design/check-tokens.test.ts` (create)

- [ ] **Step 1: Write failing tests first** for a pure `contrastRatio(fg, bg)` and `checkPairs(pairs)`: `contrastRatio('#000000','#ffffff')` is 21; `#1E40AF` on `#F8FAFC` is above 4.5; a known-bad pair returns a failure naming both tokens; `checkPairs` reports every failing pair, not just the first. Run and confirm FAIL.
- [ ] **Step 2: Implement** the two functions, then `check-tokens.ts`, which reads the token pairs the design system documents (text on background, text on card, primary on primary-foreground, destructive, muted, the amber call-to-action and its ink, the chart colours on card, each in light and dark) from `globals.css` and exits 1 on any pair under 4.5:1 (3:1 for chart marks and control edges). Add it to `package.json` as `audit:tokens`.
- [ ] **Step 3: Reconcile** the landing page (`app/page.tsx`, `app/_components/landing/`) and the app against one token set. List every hard-coded colour, font size and radius used on the landing page that is not a token (use `impeccable detect` and a grep), and decide per item: promote to a token, or replace with one. Settle the questions the critiques raised, each as a recorded decision in `DESIGN.md`: the amber role (one signal; section labels used as the heading, not stacked above one), the stat-chip tints (status meaning only), the type scale and the two uses of Fira Code, spacing and radius steps, and a reduced-motion rule that keeps useful feedback instead of a blanket 0.01ms kill.
- [ ] **Step 4:** Apply the token changes in one place, rerun `npm run audit:tokens`, `npm run build`, and screenshot five representative screens and the landing page in both themes. Update `DESIGN.md` and regenerate `.impeccable/design.json` with `/impeccable document`.
- [ ] **Checkpoint:** stage the token files and the design docs.

### Task 7: Move the app to five destinations, keeping every URL

**Files:** `lib/nav/destinations.ts` and `lib/nav/destinations.test.ts` (create), `app/(app)/app/_components/app-sidebar.tsx`, `bottom-nav.tsx`, `section-tabs.tsx`, `app-header.tsx`, `next.config.ts` (redirects only if a URL changes)

Only after the owner approves the list in Task 5.

- [ ] **Step 1: Write failing tests first** for a pure route map: `destinationFor('/app/inventory/shipments')` is `stock`; every path in `route-inventory.md` returns exactly one destination or `profile`/`staff`; `visibleDestinations(role)` hides a destination a role cannot use anything in (cross-check `lib/permissions.tsx`); an unknown path returns `null` rather than throwing. Run and confirm FAIL.
- [ ] **Step 2: Implement** `destinations.ts` as the single source for the sidebar, the bottom bar and the breadcrumbs, so the three cannot drift. Keep URLs unchanged wherever possible; where a URL must change, add a permanent redirect and a test that the old path resolves.
- [ ] **Step 3:** Rebuild the sidebar and the mobile bottom bar from the map: at most five top-level destinations, Settings and Reps in the profile menu, the staff `/me` portal untouched. Keep the 44px mobile targets and the single `<main>` landmark.
- [ ] **Step 4: Verify** on the dev app at 1280 and 390 as the owner and as a restricted role: every old URL still loads, no destination is empty, the active destination is marked, keyboard focus order is sensible, the console is clean. Re-measure the click paths from Task 5.
- [ ] **Checkpoint:** stage the nav files and tests.

### Task 8: Close out

- [ ] **Step 1:** Rerun `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run audit:scope`, `npm run audit:tokens` and `npm run build`; record the numbers next to the Plan 1 close-out in the baseline note.
- [ ] **Step 2:** Re-critique the five lowest screens from Task 3 (twice each) and report the change in averages, labelling any gain under four points as noise.
- [ ] **Step 3:** Report to the owner: what the competitor matrix showed, which law failures remain, what changed in navigation and tokens, what is still held for review, and what Plan 3 (the front page) can now assume. Ask for the go-ahead to write Plan 3.
