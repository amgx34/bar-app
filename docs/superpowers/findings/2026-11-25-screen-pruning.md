# Screen pruning: what is unnecessary (2026-11-25)

Read-only analysis. Nothing was edited, deleted, staged or committed. Branch `rebuild/foundation`, working tree clean at the start and at the end.

Inputs read: `route-inventory.md`, `2026-11-25-walk-findings.md`, the three walk files, `competitors/matrix.md`, `2026-11-25-decisions.md`, the Plan 2 constraints, `nav-config.ts`, every page file, and the import graph of `app/`, `components/`, `lib/`, `hooks/`.

## Headline

- 37 page routes. **None needs deleting.** 30 are real screens that do a job no other screen does. 6 are already pure redirect stubs (keep them: every one is a URL that has worked). 1 is an orphan (`/app/no-access`) that needs an owner call.
- The pruning that is real is **dead code, not screens**: 5 component/action files nothing imports, a further 5 unused UI primitives, and 3 `loading.tsx` skeletons that belong to redirect-only routes.
- Two stale links were found while tracing inbound references. They are bugs, not pruning, and are listed under "Found on the way".

## How "dead" was proven

1. Built an import graph (resolves `@/` and relative specifiers, `from`, `import()`, `require`, `next/dynamic`) over `app/`, `components/`, `lib/`, `hooks/`, `scripts/`, `supabase/` plus root configs. Entry points: Next file conventions (`page`, `layout`, `loading`, `route`, `icon`, `manifest`, `robots`, `sitemap`, ...), `proxy.ts`, configs, every test, every script. Anything not reachable from an entry is dead. Re-run with tests and scripts removed as entries: same list, so nothing is alive only because a test or script imports it.
2. Grep for the file stem and every exported name across `app/ components/ lib/ hooks/ scripts/ proxy.ts package.json vercel.json public/` and the repo docs. Only self-references and prose mentions remain.
3. Copied the repo to the scratchpad (node_modules symlinked), deleted the SAFE list there, and ran `npx tsc --noEmit` (clean), `npm test` (61 files, 1014 tests, pass) and `npm run audit:scope` (0 unjustified). The real tree was never touched.

Baseline on the real tree before the experiment: `npx tsc --noEmit` clean; `npm test` 61 files / 1014 tests pass.

## Route table

Kind: real = screen with its own job; stub = only `redirect()`; orphan = no inbound reference anywhere in code. "Walk" = rendered in the 2026-11-25 walk (all 37 were walked except `/app/dashboard`, which no walk file covers). Git dates are the last commit touching `page.tsx`.

| route | kind | verdict | conf. | evidence | risk if wrong |
|---|---|---|---|---|---|
| `/` | real (marketing) | KEEP | high | `app/page.tsx`; footer links to /eula, /accessibility; sitemap | Public front door |
| `/accept-terms` | real | KEEP | high | `app/(app)/app/layout.tsx:33` redirects here; `accept-terms/actions.ts:21` | Locks new users out of the app |
| `/accessibility` | real | KEEP | high | `app/page.tsx:609`, `privacy/page.tsx:236`, `legal-page.tsx:117`, `sitemap.ts:43`. Distinct content from privacy/terms/eula | Legal/WCAG statement |
| `/app/analytics` | stub | KEEP AS REDIRECT | high | `analytics/page.tsx:7` redirects to `/app/inventory/analytics`. No inbound link, but it was a sidebar item (bookmarks) | Breaks bookmarks |
| `/app/books` | real | KEEP | high | nav-config.ts:93, 142; notification link `detect.ts:201`; 7 commits, last 2026-11-24 | Only P&L screen |
| `/app/dashboard` | real | KEEP | high | `manifest.ts:20` start_url, nav root, `not-found.tsx:36`, `sw.js:46,53`; 17 commits, last today. Not walked | PWA start page |
| `/app/employees` | stub | KEEP AS REDIRECT | high | `employees/page.tsx:15` redirects to `/app/payroll/employees`. **Live inbound:** `app/(auth)/join/actions.ts:99` writes `link: '/app/employees'` into `notifications`, so stored bells point here | Dead link in every existing "staff wants a login" alert |
| `/app/inventory` | real | KEEP | high | nav root; notification `detect.ts:58`; 15 commits | Core |
| `/app/inventory/analytics` | real | KEEP | high | nav tab; `dashboard/page.tsx:581`; target of `/app/analytics` redirect | Core |
| `/app/inventory/loss` | stub | KEEP AS REDIRECT | high | `loss/page.tsx` redirects to `/app/inventory`. No inbound link; last real change 2026-08-07 | Bookmarks |
| `/app/inventory/setup` | real | KEEP | high | nav tab; `dashboard:603`, `item-form-dialog.tsx:271`. Shows POS-to-stock gaps and recipes, which no other page shows | Hides why stock does not move |
| `/app/inventory/shipments` | real | KEEP | high | nav tab; the only invoice/delivery ledger (`inventory_shipments`) | Money (delivery cost) |
| `/app/inventory/weigh` | real | KEEP | high | nav tab; `weigh_reports` has its own tables and pour analysis. Different data from Items/Setup/Shipments/Analytics | Only place bottle weights are kept |
| `/app/payroll` | real | KEEP | high | nav root; day/week/month views via `?view=`; Day Split already merged here (see page comment lines 29-41) | Core pay screen |
| `/app/payroll/direct-deposit` | real | KEEP | high | nav tab; `LEGACY_TAB_ROUTES` (`payroll/_shared.ts:123`). Bank accounts and OTP; no other screen | Money |
| `/app/payroll/employees` | real | KEEP | high | nav tab; target of `/app/employees`; claims approval and tax setup live only here | Money, tenancy |
| `/app/payroll/review` | real | KEEP | high | nav tab; links from dashboard:386, `open-run-banner.tsx:46`, `approval-actions.ts:238,377,425` (notification deep links). Holds the approval snapshot and NACHA gate | Money; emailed/bell links |
| `/app/payroll/split` | stub | KEEP AS REDIRECT | high | `split/page.tsx` forwards to `/app/payroll?view=day` and preserves `?date=` | Bookmarks and staff links (stated in the file) |
| `/app/reps` | real | KEEP (nav placement is a Plan 2 call) | high | nav root; `mobile-fab.tsx:13`; dashboard x4. Competitors fold ordering under Stock (matrix.md), which argues for moving the link, not deleting the screen | Rep correspondence has no other home |
| `/app/sales` | real | KEEP | high | nav root; notifications `detect.ts:111,166`; Tonight/Day/Week/Month in one screen | Core |
| `/app/sales/categories` | stub | KEEP AS REDIRECT | high | redirects to `/app/sales?view=week`; absorbed 2026-08-31 (f2a27f6) | Bookmarks |
| `/app/sales/margins` | stub | KEEP AS REDIRECT | high | redirects to `/app/sales?view=month`; same commit | Bookmarks |
| `/app/settings` | real | KEEP | high | 7 tabs, none duplicates another screen (see Settings tabs below) | Core |
| `/app/tax` | real | KEEP | high | nav root ("had no route into it" before); W-2, 1099-NEC, Tax Report share one data pipeline, different forms | Compliance |
| `/app/tips` | real | KEEP | high | nav root; `detect.ts:243`. Z-reported tips and server tip %. Payroll shows distributed tips; the two are different data (and currently disagree, finding #2, which is a bug to fix, not a reason to merge) | Do not merge |
| `/setup` | real | KEEP | high | onboarding step 1; `router.push('/setup/pos')` at `setup/page.tsx:64`; `lib/org.ts:153` redirects here | New orgs |
| `/setup/pos` | real | KEEP | high | onboarding step 2; skips itself when a POS is already set (`pos/page.tsx:12`); `pos-selector.tsx:92` | New orgs. Settings POS tab handles later changes |
| `/setup/pos/clover` | real | KEEP | high | `pos-selector.tsx:92`; sits before the Clover OAuth hop | Clover onboarding |
| `/join` | real | KEEP | medium | no in-app link by design: the owner shares the code and the URL (`team-tab.tsx`). Staff sign-up (2186396) | Staff portal sign-up |
| `/login` | real | KEEP | high | `proxy.ts` redirect target; everywhere | Auth |
| `/me` | real | KEEP | high | `lib/org.ts:152`, `employee-portal/session.ts`; staff portal, named untouchable by the plan | Staff pay view |
| `/me/pending` | real | KEEP | high | `employee-portal/session.ts:54` | Staff portal |
| `/eula` | real | KEEP | high | footer links; sitemap; the agent licence, distinct from /terms | Legal |
| `/privacy` | real | KEEP | high | footer, sitemap | Legal |
| `/terms` | real | KEEP | high | footer, sitemap, `lib/legal.ts` | Legal |
| `/thank-you` | real | KEEP | high | `demo-request-form.tsx:52` pushes here after the landing form | Landing conversion |
| `/app/no-access` | **orphan** | **OWNER DECISION** | medium | Zero references in `app/ lib/ components/ proxy.ts`; `getCurrentOrg` sends a membership-less user to `/setup` or `/me`, never here (`lib/org.ts:146-153`). Last real edit 2026-08-07. Also has a placeholder `mailto:support@yourdomain.com` and a Base UI warning (walk finding #22) | Low; nothing reaches it today |

Counts: KEEP 30, KEEP AS REDIRECT 6, OWNER DECISION 1. MERGE 0. Dead-code removal is tracked per file below because it attaches to files, not routes.

## Questions you asked, answered

- **Payroll Pay Period vs Review vs Direct Deposit vs Employees:** four jobs, four data sets (live pay run and payouts; frozen snapshot, approval and NACHA gate; bank accounts and OTP; roster, tax setup, claims). No merge. The only duplication is chrome on Review (walk #32), a layout fix.
- **Tips tabs vs payroll day view:** Tips reads `z_report_days` and `z_report_server_tips` (what the POS reported); payroll day view shows what `computePayroll` allocated. Same night, different questions. Keep both. Do not merge while the tip double-count (decision 1) is open: merging would hide the one place the two numbers can be compared.
- **Inventory weigh / setup / shipments / analytics:** weigh = bottle-weight reports (own tables); setup = POS mapping gaps and deal recipes; shipments = invoice ledger; analytics = velocity, par, shrinkage. No overlap in data. Overlap is only visual: the Items page "Top Sellers / Biggest Losses" cards repeat Analytics themes (walk #10 shows them as identical series, a bug).
- **Tax tabs:** W-2, 1099-NEC, Tax Report. Different forms, one page, `?tab=`. Keep.
- **Settings tabs:** General, Tip & Pay, Inventory, Import Data, POS Integration, Notifications, Team. None duplicates another screen. Inventory tab = pour defaults and bottle sizes; Import Data reuses the payroll `ImportTab` (used nowhere else); POS tab hosts the exclusions panel (recipes moved to Inventory > Setup on purpose, per the comment in `settings/page.tsx`). The only coupling to note: Import Data is a payroll component living under Settings, which is why the old `?tab=import` link is broken (see below).
- **Marketing/legal duplicates:** privacy, terms, eula, accessibility are four different documents. No duplicate. No demo, test or scratch pages exist under `app/` (searched for `demo`, `test`, `sandbox`, `playground`; the only hit is `/api/demo`, an API route).

## SAFE TO DELETE NOW

Zero references (proven above). Deleting changes no route and no behaviour. Verified on a copy: tsc clean, 61 test files / 1014 tests pass, audit:scope 0 unjustified.

Tier A, component and action files for retired screens (recommended):

```
app/(app)/app/employees/_components/employee-roster.tsx
app/(app)/app/analytics/_components/analytics-charts.tsx
app/(app)/app/analytics/actions.ts
app/(app)/app/settings/_components/bar-settings-form.tsx
```

Notes per file:
- `employee-roster.tsx`: the old `/app/employees` roster. Rendered by nothing. It was touched in 4c035ef (archive employees) only because it still called `archiveEmployee`; `employees-tab.tsx` is the live copy (same imports, same actions). Safe to delete the `_components/` folder with it.
- `analytics/actions.ts`: a stale fork of `inventory/analytics/actions.ts` (older, lacks the POS velocity and pour conversion). It is a `'use server'` file that uses the admin client and exports `getAnalyticsData`, so while it exists it is a callable endpoint nothing uses. Deleting it removes one unused service-role caller.
- `analytics/_components/analytics-charts.tsx`: a fork of the live `inventory/analytics/_components/analytics-charts.tsx`. The live page imports its own folder's copy (`inventory/analytics/page.tsx:14-19`).
- `bar-settings-form.tsx`: the "legacy shim" form. Settings uses the three tab components instead.

Tier B, zero references but a capability someone may want back (hold for a one-line OK):

```
app/(app)/app/_components/org-switcher.tsx
```
Nothing renders it (not in `app-header.tsx` or `app-sidebar.tsx`), so a user who belongs to two bars has **no UI to switch** and `switchOrg` (`app/(app)/app/actions.ts:14`) is also uncalled. AGENTS.md says one org = one bar, so this is probably fine, but it is a lost feature rather than clutter. See Owner Decisions.

Tier C, unused shadcn-style primitives (zero references; harmless to keep, delete only as part of a dependency tidy):

```
components/ui/avatar.tsx
components/ui/command.tsx
components/ui/input-group.tsx      (only command.tsx imports it)
components/ui/popover.tsx
components/ui/form.tsx             (the only file still importing Radix; AGENTS.md says so)
```
Deleting `form.tsx` would also let `@radix-ui/react-label` and `@radix-ui/react-slot` leave `package.json` and `cmdk` leave with `command.tsx`. That edits `package.json`/lockfile, so it is not "no behaviour change" in the strict sense. Leave for the owner.

Not deleted on purpose: `lib/supabase/browser.ts` (unused today, but AGENTS.md names it as one of the three Supabase clients for client components).

### Delete with a tiny behaviour change (not in the safe list)

```
app/(app)/app/employees/loading.tsx
app/(app)/app/analytics/loading.tsx
app/(app)/app/inventory/loss/loading.tsx
```
These are skeletons for routes that only `redirect()`. They are real route files, so removing them is a behaviour change, though a tiny one (nothing to show while a synchronous redirect runs). They are also the only thing the three routes that logged "Rendered more hooks than during the previous render" (walk finding #6: `/app/analytics` 4 of 4 loads, `/app/inventory/loss` 1 of 5) have in common with a Suspense boundary. The walk marked the cause unconfirmed, so treat this as an experiment: delete the three, reload `/app/analytics`, see whether the error goes.

### Follow-up edits once Tier A is gone (not file deletions)

- `updateBarSettings` in `app/(app)/app/settings/actions.ts:142` (comment at line 140 names the deleted form) becomes an unused server action. Remove it with the comment. It writes `bar_settings` through `mergeBarSettings`, so give it a review rather than a drive-by.
- `switchOrg` if org-switcher is also deleted.

### Verification that must pass after deleting

```bash
npx tsc --noEmit        # no output
npm test                # 61 files, 1014 tests (count should not change; no test references these files)
npm run lint            # no new errors against the Plan 1 baseline of 29
npm run audit:scope     # 0 unscoped and unjustified (copy run: 25 justified, 0 unjustified)
npm run build           # final proof for the Next route table; not run here (it writes .next and needs env)
git grep -n "employee-roster\|bar-settings-form\|analytics/actions\|org-switcher" -- app lib components   # nothing
```
Ran on the copy: tsc, `npm test`, `audit:scope`. Not run: `lint`, `build`.

## OWNER DECISIONS

1. **`/app/no-access` (orphan).** Nothing sends anyone there; membership-less users go to `/setup` (or `/me`). Options: (a) keep the route, fix the placeholder `support@yourdomain.com` and the `nativeButton` warning, because it is a cheap safety net if `getCurrentOrg` ever changes; (b) make it a redirect to `/login` or `/setup`. **Recommend (a)** until Plan 2's route map test exists, since a URL that "has ever worked" must keep working and deleting gains nothing. Whatever you pick, the placeholder address must change before launch.
2. **Org switcher (Tier B).** Delete as dead, or re-wire into the profile menu for people who belong to more than one bar? **Recommend** asking whether any real user has two memberships (`select user_id, count(*) from memberships group by 1 having count(*) > 1`). If none, delete it and `switchOrg`; if any, re-wire it into the profile menu Plan 2 is designing instead of deleting.
3. **Where `/app/reps` lives.** Competitor matrix shows ordering folded under inventory or purchasing everywhere it exists. That is a navigation placement call for Plan 2 task 5, not a removal. **Recommend** keep the route and URL, move the link under Stock or the profile menu.
4. **Items page cards vs Inventory Analytics.** `inventory-dashboard.tsx` repeats Analytics themes and its two charts showed identical series (walk #10). **Recommend** fix or drop those two cards; do not remove either screen. This touches stock figures, so owner review.
5. **Repoint the staff-claim notification.** `join/actions.ts:99` still writes `link: '/app/employees'`. It resolves through the redirect, so nothing is broken. **Recommend** change new alerts to `/app/payroll/employees` and keep the redirect forever for the ones already stored.
6. **Tier C primitives and Radix dependencies.** **Recommend** leave them until you want a dependency tidy; no user-visible gain.

## Found on the way (bugs, not pruning)

- **Dashboard "Import Z reports" links are dead ends.** `app/(app)/app/dashboard/page.tsx:433` and `:744` link to `/app/payroll?tab=import`. `LEGACY_TAB_ROUTES` (`payroll/_shared.ts:119`) maps only `employees`, `split`, `direct-deposit`, so this lands on the payroll day view, not on an import screen. The import now lives at `/app/settings?tab=import-data` (`payroll/review/page.tsx:215` links there correctly). Fix: add `import: '/app/settings?tab=import-data'` to `LEGACY_TAB_ROUTES` (this also rescues old bookmarks) and point the dashboard at the Settings URL. Walk did not cover `/app/dashboard`, so this was not seen in the walk.
- `dashboard/page.tsx:382, 496` use `/app/payroll?tab=split`. It works through the legacy map but drops any date. Use `?view=day&date=...`.

## What I could not determine

- **Whether anyone has bookmarked the six stubs.** Git shows they were sidebar items for months and two comments say so; I cannot see production traffic. Treat all six as permanent per the plan.
- **`/app/dashboard`:** not in any walk file, and the Plan 1 note says it had uncommitted edits (the tree is clean now, last commit 2026-11-25). I did not review its content for duplication with Books, Sales or Inventory; I only verified it is the PWA start page and the target of many links.
- **`/join`** has no in-app link by design; I assumed it is shared out of band. Not provable from code.
- **Cross-feature use of dead exports.** I proved file-level deadness. I did not hunt for dead individual exports inside live files (for example other actions only the retired roster used); `updateBarSettings` and `switchOrg` surfaced only because their sole caller is on the list.
- **`npm run lint` and `npm run build`** were not run, on the real tree or the copy.
- **API routes** (`/api/poll-2touch`, `/api/email-replies`, `/api/demo` and the others) were out of scope. `/api/poll-2touch` has no entry in `vercel.json` (only `/api/cron/2touch` is scheduled), so it may be an orphan endpoint; I did not check.
- **The `Rendered more hooks` cause** is still unconfirmed; the loading.tsx experiment is a hypothesis, not a finding.
