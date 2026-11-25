# Manager plan for the overnight session (2026-11-25)

Written by the general manager agent. Read-only on code: this file is the only thing written. Branch `rebuild/foundation`.

**Roles tonight:** Sonnet implements and researches. Opus is called only to debug a gate that fails. The orchestrator dispatches and commits. Every item below is a decision already made; an implementer does not reopen it.

## Baseline measured before writing this plan

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | exit 0, no output |
| `npm test` | 61 files, 1014 tests, all pass |
| `npm run audit:scope` | 25 justified, 0 unscoped and unjustified |
| `npm run lint` | 60 problems: 27 errors, 33 warnings |
| Working tree | clean except the untracked `docs/superpowers/OVERNIGHT-LOG.md` |

A dev server is already listening on port 3000. The Supabase CLI is not installed on this machine and `supabase/.temp` does not exist (no project is linked).

## Guardrails (non-negotiable)

1. **Nothing live.** No live database, no live migration, no push, no deploy, no key rotation, no branch deletion, no real email, SMS or payment. Never set `RAIL_ALLOW_LIVE_DEV`, `RAIL_ALLOW_LIVE_THIRD_PARTY` or any new override this plan introduces.
2. **Do not invent owner facts.** No made-up support address, price or customer name. Where one is needed, use a value the repo already publishes or leave it for the owner.
3. **Money, tips, stock, tenancy:** a failing test first, one separate revertable commit per change, and DEFER rather than guess. Existing money tests are never edited to pass.
4. **Every task ends green** on `npx tsc --noEmit`, `npm test`, `npm run audit:scope`, and adds no lint errors against the current baseline (60 problems / 27 errors; after item 2 the baseline is 45 / 12).
5. **Every existing URL keeps working.** No route file is deleted or renamed tonight.
6. **No new dependencies.** None is needed by anything below.
7. **A task that cannot be made green is reverted** (`git checkout -- <its files>`, remove its new files), logged in `OVERNIGHT-LOG.md`, and the queue moves on. Opus gets one debugging attempt per failed gate; a second failure is a revert.
8. Never print a secret. Never read `.env*` beyond what `scripts/dev/check-dev-env.ts` already does.

**Standard gates** (referred to as GATES below):

```bash
npx tsc --noEmit
npm test
npm run audit:scope
npm run lint
```

**Browser precheck** (only for items that say so): `node --no-warnings scripts/dev/check-dev-env.ts` must exit 0 before the dev app on port 3000 is opened. If it exits 1, skip the browser step and log "not browser-verified"; do not work around it. Browsing is read-only: dialogs may be opened, nothing is submitted (no Pay, Mark paid, Undo, Post, Save, Submit, Approve, Send, Archive, Delete).

---

## The sixteen decisions

### 1. Org switcher: DEFER TO HUMAN (keep both files, delete nothing, do not re-wire tonight)

- **Reason.** It is not dead in the sense the pruning note assumed. A second membership is something the product creates on purpose, and the read side of switching is still live; only the control is missing.
- **Evidence.** `app/(app)/app/settings/team-actions.ts:114-159`: `addTeamMember` returns `'added_existing'` when the email already has a login and inserts a membership for this bar. `lib/org.ts:156-159` still resolves the active bar from the `current_org_id` cookie and falls back to the oldest membership. `app/(app)/app/actions.ts:14-37` (`switchOrg`) is the only writer of that cookie. `app/(app)/app/_components/app-header.tsx:41-45` shows a plain bar name where the switcher used to sit.
- **Risk if wrong.** Deleting strands anyone with two bars on their oldest one with no way across, and removes the only code that sets the cookie. Keeping costs nothing. Re-wiring unattended changes which tenant a session acts on and cannot be tested without creating a second membership.
- **Human supplies.** The result of `select user_id, count(*) from memberships group by 1 having count(*) > 1` on live, and whether owning two bars is a supported case. If yes, the switcher goes into the profile menu when Task 7 is built. If no, delete both files then.
- **Flag.** Today a person added to a second bar has no way to reach it. That is an existing gap, not something tonight introduces.

### 2. `/app/no-access` placeholder and Base UI warning: DO TONIGHT

- **Reason.** A real, already-published contact address exists, so nothing has to be invented.
- **Evidence.** `app/app/no-access/page.tsx:25` has `mailto:support@yourdomain.com` (note the path: the file is outside the `(app)` group). `lib/site.ts:40` (`BUSINESS.email`) is the business contact; the same address is `LEGAL_CONTACT_EMAIL` at `lib/legal.ts:32` and is printed on `/privacy`, `/accessibility`, `/terms` and `/eula`. The warning comes from `<Button render={<Link href="mailto:..." />}>`: a link rendered inside a button without `nativeButton={false}`.
- **Interim.** Import `BUSINESS` from `@/lib/site` and render a plain `<a href={`mailto:${BUSINESS.email}`}>` styled with `buttonVariants({ variant: 'outline' })` (the pattern at `app-header.tsx:71`). A plain anchor is the right element for `mailto:` and removes the warning. No address is typed into the page.
- **Risk if wrong.** Support mail lands in the general business inbox, which is the one the legal pages already publish.
- **Human supplies.** A dedicated support mailbox if one is wanted; it would then be one constant in `lib/site.ts`.

### 3. Staff-claim notification link: DO TONIGHT

- **Evidence.** `app/(auth)/join/actions.ts:99` writes `link: '/app/employees'`; it is the only remaining reference (`git grep "/app/employees"` outside `payroll/employees`). The stub `app/(app)/app/employees/page.tsx:15` redirects to `/app/payroll/employees`, where the pending claims panel lives.
- **Change.** New alerts get `/app/payroll/employees`. The redirect stub stays forever for alerts already stored.
- **Risk if wrong.** None: both URLs resolve to the same screen.

### 4. Items page "Top Sellers" and "Biggest Losses": DO TONIGHT (fix, not drop), late in the queue, test first, own commit

- **Root cause, found.** `app/(app)/app/inventory/_components/inventory-dashboard.tsx:109-119` builds Top Sellers from every usage log except `delivery` and `recount`. So it counts `spillage`, `comp`, `staff_drink`, `other` (which includes a shipment void) and `pos_reversal` as sales. `121-131` builds Biggest Losses from `spillage`, `comp`, `staff_drink`. With no `pos_sale` rows (the demo seed has none) the two series are identical, which is walk finding #10. The enum is at `supabase/schema-export/baseline.sql:10`; `pos_reversal` is stored as a positive quantity (`baseline.sql:163-170`).
- **Fix.** Top Sellers = `pos_sale` minus `pos_reversal` per item, items at zero or below omitted. Biggest Losses unchanged. Both move to a pure function with tests. Empty state reads "No POS sales recorded yet".
- **Why fix rather than drop.** Removing two cards is a visible product change with no owner in the room; correcting a card titled "Top Sellers" so that it counts sales is not a judgement call.
- **Risk if wrong.** A bar with no POS feed sees an empty Top Sellers card where it used to see its losses mislabelled as sales. That is the honest state. No stock figure is written; this is display only.
- **How to verify.** Unit tests on the pure function; on the dev demo bar the card shows the empty state and Biggest Losses is unchanged.

### 5. Five unused UI primitives and the Radix/cmdk dependencies: DEFER TO HUMAN

- **Evidence.** `components/ui/avatar.tsx`, `command.tsx`, `input-group.tsx`, `popover.tsx`, `form.tsx` have no importer (screen-pruning Tier C). `cmdk`, `@radix-ui/react-label` and `@radix-ui/react-slot` are in `package.json:17-18,26` and are imported only by `command.tsx:4` and `form.tsx:4-5`.
- **Reason.** No user-visible gain; it edits `package.json` and the lockfile unattended; and the profile menu in Task 7 is the likeliest consumer of `avatar` and `popover`, so deleting now risks adding them back next week.
- **Risk if wrong.** Three small unused packages stay installed a little longer.
- **Human supplies.** A yes to a lockfile change, after Task 7 shows which primitives the profile menu uses.

### 6. `updateBarSettings`: DO TONIGHT (delete), own commit

- **Evidence.** `app/(app)/app/settings/actions.ts:140-146`. Its only caller was `bar-settings-form.tsx`, deleted in `5751429`; `git grep updateBarSettings` finds only the definition. It passes any `Partial<BarSettings>` straight to `mergeBarSettings`, so it would accept a `nacha_routing_number` without the check added at `actions.ts:74-76` (commit `8cb1f33`).
- **Reason.** It is an exported server action nobody calls that bypasses the routing-number validation. Deleting dead code changes no behaviour and `tsc` proves there is no caller.
- **Risk if wrong.** None that `tsc` would not catch.

### 7. Plan 2 Task 3 scope: DO TONIGHT, bounded to six screens

- **Screens.** `/app/payroll` (week and day views), `/app/payroll/review`, `/app/inventory`, `/app/inventory/shipments`, `/app/sales`, `/app/books`, each at 1280x800 and 390x844.
- **Why these.** They are the landing screen of four of the five proposed destinations (Today already has three critiques in `.impeccable/critique/` and was redesigned in `b70a07e`), plus the two screens with the most walk findings: Review (#32, #33, #35) and Shipments (#11, #23, #26). Payroll carries #1, #14, #29-31, #33, #34; Items #7, #9, #10, #24, #28; Sales and Books contradict each other (#17) and show the "silence as zero" failure the plan says to look for.
- **Left out and why.** The six redirect stubs (nothing to critique), the legal and auth pages, `/setup*`, the staff portal (the walk could not sign in as staff), the landing page (Plan 3 rebuilds it), and Tips, Tax, Settings, Weigh, Setup, Analytics, Employees, Direct Deposit and Reps (next session).
- **Cost.** 12 reviewer agents (two isolated reviewers per screen) plus one measured-evidence agent for all six: 13, not 50.
- **Risk if wrong.** A partial critique is mistaken for the whole. `summary.md` must say "6 of about 28 screens" in its first line.

### 8. Task 4 (laws matrix): DEFER. Task 5 (navigation validation): DO TONIGHT. The five-destination list is APPROVED as the working hypothesis.

- **Task 4.** A laws table built on six screens would be redone once the rest are critiqued, and its Doherty column needs timings across all screens. Unlock: Task 3 run on the remaining screens. The laws the current navigation fails by itself go into the Task 5 document instead.
- **Task 5.** A document, derived from code (`nav-config.ts`, in-page links, `lib/permissions.tsx`) and from `competitors/matrix.md`. No dev server needed.
- **Approved list, with the contested routes resolved:**

| Destination | Routes (URLs unchanged) |
|---|---|
| Today | `/app/dashboard` |
| Stock | `/app/inventory`, `/weigh`, `/shipments`, `/setup`, `/analytics`, `/app/reps` (as an "Ordering" tab); stubs `/app/inventory/loss`, `/app/analytics` |
| Sales | `/app/sales`; stubs `/app/sales/categories`, `/app/sales/margins` |
| Team & Pay | `/app/payroll`, `/employees`, `/direct-deposit`, `/review`, `/app/tips`, `/app/tax`; stubs `/app/payroll/split`, `/app/employees` |
| Books | `/app/books` |
| Profile menu | `/app/settings` |
| Staff portal | `/me`, `/me/pending` |
| Outside the app shell | `/`, legal pages, `/thank-you`, `/login`, `/join`, `/accept-terms`, `/setup`, `/setup/pos`, `/setup/pos/clover`, `/app/no-access` |

- **Contested calls.**
  - `/app/inventory/analytics` goes to **Stock**, not Sales. The spec's table lists "analytics" under Sales, but that was the old `/app/analytics`, which now redirects here; the page is stock velocity, par and shrinkage.
  - `/app/reps` goes to **Stock**, not the profile menu (a change from the spec). `competitors/matrix.md` shows ordering under inventory or purchasing wherever it exists and top-level nowhere; `PRODUCT.md` names ordering from reps as one of the jobs the app exists for; the mobile FAB has "New Rep Order" (`mobile-fab.tsx:13`). A core weekly job should not sit behind an avatar.
  - `/app/tax` goes to **Team & Pay**. W-2, 1099-NEC and the tax report all come from the payroll pipeline.
  - `/app/tips` goes to **Team & Pay**, as a separate tab. Do not merge it with the payroll day view (screen-pruning, "Tips tabs vs payroll day view").
- **Roles.** There are three (`lib/org.ts:87`: owner, manager, accountant) and every function in `lib/permissions.tsx` gates an action, not a page. So every destination is visible to every role today, which matches PRODUCT principle 5.
- **Watch item.** Stock and Team & Pay would each hold six tabs. That is inside Miller's limit but at the edge.
- **Risk if wrong.** Nothing visible changes tonight (see 9), so a wrong call costs one edit to a table and a map.
- **Human supplies.** A yes or a correction on the table above, in particular Reps under Stock.

### 9. Task 7 (rebuild the nav): SPLIT. Steps 1-2 DO TONIGHT (pure map and tests, not wired). Steps 3-4 DEFER.

- **Tonight.** `lib/nav/destinations.ts` and its test: the approved table as code, with a test that every page in `route-inventory.md` resolves. No component imports it, so the app looks and behaves exactly as before and the commit reverts cleanly.
- **Deferred.** The sidebar, bottom bar, section tabs and breadcrumbs. `nav-config.ts:164-187` finds a route's section by URL prefix; putting `/app/reps` under Stock and `/app/tips` and `/app/tax` under Team & Pay breaks that assumption, so this is a rebuild of four components, not a config edit. It is also the first thing the owner sees, and the plan orders it after the critique and the laws matrix.
- **Unlock condition, exact.** (a) The owner confirms the destination table in `navigation-validation.md`; and (b) the change is verified in a browser at 1280 and 390 as owner and as accountant, with every URL in `route-inventory.md` loading, in a session where someone can look at the result.
- **Risk if wrong.** Deferring costs a day. Doing it unattended risks the owner waking to a navigation they did not choose.

### 10. Task 6 (tokens): DO TONIGHT, steps 1-2 only

- **Safe slice.** Pure `contrastRatio` and `checkPairs` with tests first, a `check-tokens.ts` that reads the light and dark token blocks from `app/globals.css` (`:118-184`, `:193-238`; all hex, so no colour-space conversion), and an `audit:tokens` script. Run with `node --no-warnings`, as `predev` already does (`package.json:6`).
- **Not tonight.** No token value changes, no landing-page reconciliation, no `DESIGN.md` or `.impeccable/design.json` regeneration (steps 3-4). Those are design judgement and need screenshots in both themes.
- **If the audit finds a failing pair.** Commit the tool anyway, record the pairs, change no value. `audit:tokens` is not one of the four gates.
- **Risk if wrong.** A new script that reports honestly. Nothing renders differently.

### 11. Supabase CLI guard, migrations note, legacy marker: DO TONIGHT

- **Evidence.** `supabase/migrations/` holds 42 files; 10 have no timestamp prefix (`add_bar_messages.sql`, `add_bar_messages_update.sql`, `add_demo_requests.sql`, `add_direct_deposit.sql`, `add_pos_columns.sql`, `add_reps.sql`, `add_settings_fields.sql`, `add_weigh_reports.sql`, `ensure_full_schema.sql`, `seed_sales_kingr5183.sql`). `scripts/dev/live-guard.ts` already has `normalizeHost` and `readEnvValue` and the pattern to copy.
- **Decision.** A wrapper script that refuses any Supabase CLI command whose target is the project in `.env.local`, with a pure decision function tested first; `npm run supabase -- <args>`. A `supabase/README.md` (outside `migrations/`, so the CLI never sees it) that lists the ten files as legacy and says how a migration reaches dev and live. The ten files are **not** moved or renamed.
- **Do not invent.** The repo does not show how live has been migrated. The note states what the repo shows (a human applies each file, dev first; agents never apply) and marks the rest "OWNER TO CONFIRM".
- **Limits.** A bare `supabase db push` bypasses an npm wrapper; the note says so. The guard cannot be exercised end to end because the CLI is not installed, so it is proven by tests only. The wrapper is never run tonight.
- **Risk if wrong.** A guard that is too strict blocks a deliberate live migration until the owner sets the documented override.

### 12. Remaining walk findings: three are safe tonight

- **DO TONIGHT:** **#14** (warning text contrast), **#15** (Tips well tab scrolls sideways at 390), **#22** (no-access, covered by decision 2).
  - #14 evidence: `text-amber-300`, `text-amber-300/70`, `text-amber-300/80` and `text-yellow-400` are dark-theme colours used on light surfaces: `payroll/_components/direct-deposit-tab.tsx:145,147`; `tax/page.tsx:53,54`; `tax/_components/form-1099.tsx:133,135`; `tax/_components/tax-report.tsx:318,319,326,327`; `payroll/_components/day-split-tab.tsx:669`; `tips/_components/analytics-tab.tsx:67`; `tips/_components/flags-tab.tsx:67,76,123,133`. The token `text-accent-text` exists for exactly this (`globals.css:149,213`: 6.78:1 light, 11.22:1 dark; DESIGN.md "Do use Amber Text").
  - #15 evidence: `tips/_components/well-performance-tab.tsx:159` is a non-wrapping row holding a `min-w-[200px]` date and the Options button.
- **Considered and left out.**
  - #37 (native `confirm()` on Reps): the same pattern is used in four places including the archive flow shipped yesterday (`employees-tab.tsx:52,92`, `pos-panel.tsx:390`). Changing one is inconsistency; it is a design-system decision.
  - #38: the doubled login error is deliberate (`login-form.tsx:26`). DROP.
  - #6, #27, #32, #39: need a browser and a design call; #32 is covered by tonight's critique of Review.
  - #8, #21, #31, #33, #34, #35: change action or auth behaviour, or wording inside tested payroll copy (`lib/payroll/open-run.ts`).
  - #7, #9, #11-13, #16-20, #23-26, #28-30, #36: money, tips, stock or tax, or seed data. Human review.

### 13. The 27 lint errors: DO TONIGHT for 15, DEFER 12

- **Safe 15.** Eight `no-require-imports` are in `2touch-agent/` and `2touch-agent-dotnet/testdata/`, sibling codebases with their own toolchains (AGENTS.md) that the Next lint config should not scan: add both to `globalIgnores` in `eslint.config.mjs`, as was done for `.worktrees/`. Six `react/no-unescaped-entities` are text escapes with identical rendering (`reps/_components/order-dialog.tsx:125`, `tips/_components/well-settings-dialog.tsx:114`, `setup/pos/clover/page.tsx:35,51`). One `prefer-const` at `reps/page.tsx:29` (the object is mutated, never reassigned).
- **Deferred 12.** Eight `no-explicit-any` on the pay and import path (`payroll/actions.ts:96,713,722`, `payroll/_components/csv-upload.tsx:17`, `lib/csv-parsers/parse-employee-shifts.ts:27,102`, `parse-z-reports.ts:26,86`): typing them is a change to money input parsing. Four `react-hooks/set-state-in-effect` (`reps/_components/order-history-sheet.tsx:31`, `tips/_components/well-performance-tab.tsx:89,100`, `hooks/use-mobile.ts:14`): each is a behaviour refactor that needs a browser.
- **Expected result.** 45 problems: 12 errors, 33 warnings. That becomes the baseline for every later item.
- **Risk if wrong.** None for behaviour; the ignored folders were never part of this app's build.

### 14. Day split vs pay run on unattributed tip removals: DO TONIGHT, last, test first, own commit

- **Evidence.** The pay run takes unattributed removals off the night and then carves out kept tips (`payroll/actions.ts:819-833`). `getDaySplitData` never reads `payroll_adjustments` and carves from the raw Z total (`payroll/actions.ts:1127-1146`); the client shares `totalTips - keptTips` (`day-split-tab.tsx:324`). So on a night with a garnishment-style removal the day split promises the pool more than the pay run pays.
- **Why tonight.** It is the same class of fix as `e49b661` on the same function, it mirrors a pattern already on that screen (the `keptTips` sub-line), `computePayroll` is not edited, and nothing is written to the database. PRODUCT principle 1: a figure must agree with the screen it links to.
- **How it is tested.** A new pure function in `lib/payroll/night-split.ts` that composes `applyTipRemovals` and `carveOutKeptTips` in the pay run's order, with tests written first (cases under item 9).
- **Risk if wrong.** A preview screen shows a wrong pool for nights with an unattributed removal, which is what it does today. Stop condition: if any existing payroll test fails, or the fix needs a line inside `computePayroll`, revert and defer.

### 15. Over-allocation flag: DO TONIGHT on the day-split screen only; DEFER the pay run and review screens

- **Evidence.** `payroll/actions.ts:837-841` only `console.error`s. `getDaySplitData` discards `carve.overAllocated` (`:1131-1146`). `decisions.md` intended behaviour 5 says the night is "flagged in the day split".
- **Tonight.** Pass the boolean to the day split and show one plain sentence. No arithmetic changes.
- **Deferred.** Showing it on the week view and on Review means adding a field to `computePayroll`'s result and deciding whether it belongs in `payroll_runs.snapshot` and in `run-diff`, and whether a flagged night should block submit. That is a product rule for the owner.
- **Risk if wrong.** An extra notice on a night with bad server rows.

### 16. `/api/poll-2touch` has no `vercel.json` entry: investigated read-only. The missing entry is by design (DROP that question). The route's gate is weak (DEFER TO HUMAN).

- **Finding.** `app/api/poll-2touch/route.ts:1-21` is a manual `POST` trigger for the same `poll2TouchEmails()` the cron runs. Vercel crons are `GET`, and `vercel.json` schedules `/api/cron/2touch`, so no entry is expected. Nothing in the app calls it: `git grep poll-2touch` finds only the route and a comment at `lib/2touch/poll-emails.ts:13`.
- **Concern.** The gate at `route.ts:14-16` is "any signed-in user": no membership, no role. A self-serve demo account or a staff-portal account can therefore trigger a mailbox poll that routes across every 2Touch bar (`poll-emails.ts:148-161`), runs up to 60 seconds, calls the AI parser, and returns `errors[]` containing raw IMAP error text (`poll-emails.ts:322,331`). It exposes no bar's figures, but it is a cost and abuse vector.
- **Second observation.** `app/api/cron/2touch/route.ts:21` checks the secret only `if (process.env.CRON_SECRET && ...)`. With the variable unset the cron route is open.
- **Why not tonight.** It is a cross-tenant job and a URL removal, and nothing can be deployed tonight anyway, so a fix would not reach production before the owner reads this.
- **Human supplies.** A choice: delete the route (nothing uses it) or restrict it to owners with a rate limit; and confirmation that `CRON_SECRET` is set in Vercel, or a yes to making the cron route fail closed.

---

## Ordered work queue (nine items)

Smallest and safest first; the two money-display items are last and separate. Each item ends with GATES, a local commit by the orchestrator, and a log entry. Model is Sonnet for every item; Opus only if a gate fails.

### N1. Placeholder support link and stale notification link
- **Model:** sonnet.
- **Files:** `app/app/no-access/page.tsx`; `app/(auth)/join/actions.ts`.
- **Scope.** (a) In no-access: import `BUSINESS` from `@/lib/site` and `buttonVariants` from `@/components/ui/button`; replace the `Button`/`Link` pair at line 25 with `<a href={`mailto:${BUSINESS.email}`} className={buttonVariants({ variant: 'outline' })}>Contact support</a>`; drop the now-unused `Link` import. Type no address into the file. (b) In join/actions.ts line 99: `'/app/employees'` becomes `'/app/payroll/employees'`. Do not touch `app/(app)/app/employees/page.tsx`.
- **Test first:** none (no logic).
- **Acceptance:** GATES; `git grep -n "yourdomain" -- app lib components` prints nothing; `git grep -n "'/app/employees'" -- app lib` prints nothing; `test -f "app/(app)/app/employees/page.tsx"`.
- **Commits:** two, one per file.
- **Log:** both changes, and that the support link uses the published business contact pending a dedicated mailbox.
- **Stop:** if `lib/site.ts` cannot be imported into that server page without a build error, revert (a) and log; do not fall back to typing an address.

### N2. Hygiene: delete `updateBarSettings`; lint safe slice
- **Model:** sonnet.
- **Files:** `app/(app)/app/settings/actions.ts`; `eslint.config.mjs`; `app/(app)/app/reps/_components/order-dialog.tsx`; `app/(app)/app/tips/_components/well-settings-dialog.tsx`; `app/(app)/setup/pos/clover/page.tsx`; `app/(app)/app/reps/page.tsx`.
- **Scope.** (a) Remove lines 140-146 of settings/actions.ts (the "legacy shim" comment and the function). Nothing else in that file. (b) Add `"2touch-agent/**"` and `"2touch-agent-dotnet/**"` to `globalIgnores` with a one-line reason; escape the six quotes and apostrophes flagged at order-dialog 125, well-settings-dialog 114 and clover/page 35 and 51 with HTML entities; `let countMap` becomes `const countMap` at reps/page.tsx:29.
- **Test first:** none (dead-code removal and mechanical lint).
- **Acceptance:** GATES; `git grep -n "updateBarSettings" -- app lib components` prints nothing; `npm run lint` reports at most 45 problems and 12 errors, and every remaining error is in `payroll/actions.ts`, `csv-upload.tsx`, `lib/csv-parsers/*`, `order-history-sheet.tsx`, `well-performance-tab.tsx` or `hooks/use-mobile.ts`.
- **Commits:** two: (a) alone, then (b).
- **Log:** the new lint baseline, exactly as measured.
- **Stop:** if `tsc` finds a caller of `updateBarSettings`, revert (a) and report the caller. If an escape would change visible text, leave that line.

### N3. Supabase CLI guard and migrations note
- **Model:** sonnet.
- **Files (new):** `scripts/dev/supabase-guard.ts`, `scripts/dev/supabase-guard.test.ts`, `scripts/dev/supabase.ts`, `supabase/README.md`. **Edited:** `package.json` (one script line).
- **Failing test first** (`supabase-guard.test.ts`, run and confirm red before implementing), for a pure `projectRefFromUrl(url)` and `assertTargetIsNotLive({ args, linkedRef, liveRef, allowLive })`:
  1. `projectRefFromUrl('https://abcd1234.supabase.co')` is `'abcd1234'`; a blank or non-Supabase URL is `''`.
  2. `link --project-ref <live>` throws; `link --project-ref <other>` does not.
  3. `db push` with `linkedRef === liveRef` throws, and the message names the override.
  4. `db push` with a different `linkedRef` does not throw.
  5. `db push` with no linked project and no `--local` throws (fails closed: cannot tell).
  6. `--db-url` containing the live ref throws.
  7. Any command with `--local` does not throw.
  8. `allowLive: true` lets a live target through.
  9. An unknown `liveRef` (no `.env.local`) with a remote target throws.
- **Implement.** Reuse `normalizeHost` and `readEnvValue` from `live-guard.ts`. `supabase.ts` reads only `NEXT_PUBLIC_SUPABASE_URL` from `.env.local` and `supabase/.temp/project-ref` if present, calls the guard, then spawns `supabase` with the same arguments. The override is `RAIL_ALLOW_LIVE_DB=1`. `package.json`: `"supabase": "node --no-warnings scripts/dev/supabase.ts"`. Add a `shortcut:` comment that a bare `supabase` command bypasses the wrapper.
- **`supabase/README.md`.** Three short sections: how a migration reaches dev and live (what the repo shows: files in `supabase/migrations/`, applied by a person, dev first then live, never by an agent; anything not provable is marked **OWNER TO CONFIRM**); the ten legacy files by name, with the note that the CLI ignores names without a timestamp and that the base tables were created outside the repo (AGENTS.md); and the guard and its override. Do not open or summarise `seed_sales_kingr5183.sql`.
- **Acceptance:** GATES (test count rises); `git status --short supabase/migrations` prints nothing; `git diff --stat package.json` shows one added line.
- **Never run:** `npm run supabase`, or `supabase` in any form.
- **Log:** that the guard is proven by tests only, and the README's open "OWNER TO CONFIRM" lines.
- **Stop:** if the guard needs a dependency, or needs to read anything in `.env.local` other than the Supabase URL.

### N4. Token contrast check (`audit:tokens`)
- **Model:** sonnet.
- **Files (new):** `scripts/design/check-tokens.ts`, `scripts/design/check-tokens.test.ts`. **Edited:** `package.json` (one script line).
- **Failing test first:** `contrastRatio('#000000', '#ffffff')` is 21; `contrastRatio('#1E40AF', '#F8FAFC')` is above 4.5; three-digit and lower-case hex are accepted; a known-bad pair (`#D97706` text on `#FFFFFF` at a 4.5 threshold) is returned as a failure naming both tokens; `checkPairs` returns every failing pair, not only the first; `parseTokens(css)` returns separate light and dark maps from a small CSS fixture and ignores `var(...)` aliases.
- **Implement.** `check-tokens.ts` reads `app/globals.css`, checks in both themes: foreground on background, card-foreground on card, popover-foreground on popover, primary-foreground on primary, secondary-foreground on secondary, muted-foreground on background, on card and on muted, accent-foreground on accent, cta-foreground on cta, accent-text on background and on card, destructive on background and on card, sidebar-foreground and sidebar-primary on sidebar, sidebar-accent-foreground on sidebar-accent (all 4.5:1); border-strong and input on card and on background, ring on card, and each chart colour on card (3:1). Prints a table; exits 1 on any failure. `package.json`: `"audit:tokens": "node --no-warnings scripts/design/check-tokens.ts"`.
- **Acceptance:** GATES; `npm run audit:tokens` runs to completion and its result is recorded whichever way it exits; `git diff --stat app/globals.css DESIGN.md .impeccable` prints nothing.
- **Log:** the full list of failing pairs, or "all pairs pass".
- **Stop:** do not change a token value to make the audit pass. If a token is not a plain hex value, report it as "not checked" instead of adding a colour parser.

### N5. Contrast and overflow fixes (walk #14, #15)
- **Model:** sonnet.
- **Files:** `app/(app)/app/payroll/_components/direct-deposit-tab.tsx`, `app/(app)/app/payroll/_components/day-split-tab.tsx`, `app/(app)/app/tax/page.tsx`, `app/(app)/app/tax/_components/form-1099.tsx`, `app/(app)/app/tax/_components/tax-report.tsx`, `app/(app)/app/tips/_components/analytics-tab.tsx`, `app/(app)/app/tips/_components/flags-tab.tsx`, `app/(app)/app/tips/_components/well-performance-tab.tsx`.
- **Scope.** #14: at the lines listed under decision 12, replace `text-amber-300`, `text-amber-300/70`, `text-amber-300/80` and `text-yellow-400` with `text-accent-text` (no opacity modifier). Backgrounds and borders stay. **Do not touch** `app/(app)/setup/pos/*`: those pages sit on a fixed dark surface where the light amber is correct. #15: add `flex-wrap` to the toolbar row at well-performance-tab.tsx:159, and `aria-label="Previous day"` / `"Next day"` to the two icon-only buttons.
- **Test first:** none (class names and labels only).
- **Acceptance:** GATES; `git grep -nE "(^|[^:])text-(amber-300|yellow-400)" -- "app/(app)/app"` prints nothing (today it prints 16 lines; the 50 `dark:`-prefixed uses are correct and stay); every changed line is a `className` or an `aria-label` (read `git diff` to confirm; the money files in this list must show no other change). Browser precheck, then if it passes: at 390 wide `/app/tips?tab=well` has `document.documentElement.scrollWidth <= 390`; the warnings on `/app/tax` and `/app/payroll/direct-deposit` are readable in light and dark.
- **Log:** whether it was browser-verified.
- **Stop:** if a replacement would need a new token or a logic change, leave that line and log it.

### N6. Navigation validation and the destination map (not wired)
- **Model:** sonnet.
- **Files (new):** `docs/superpowers/findings/navigation-validation.md`; `lib/nav/destinations.ts`; `lib/nav/destinations.test.ts`.
- **Document.** (1) The route-to-destination table from decision 8, one row for each of the 37 pages in `route-inventory.md`, with the four contested calls and their reasons. (2) The ten most common tasks of the two PRODUCT.md users as click paths today (from `nav-config.ts` and in-page links) and under the proposal, with click counts; say plainly that paths are derived from code, not measured in a browser; flag any task that gets longer. (3) Comparison with `competitors/matrix.md`. (4) Roles: three roles, no page-level gate, so every destination is visible to every role. (5) What the current navigation fails by itself: six groups and nine items against Miller's five; more than one accent; only payroll shows unfinished work. (6) A box headed **OWNER TO CONFIRM** with the table and the Task 7 unlock condition from decision 9.
- **Failing test first** (`destinations.test.ts`): `destinationFor('/app/inventory/shipments')` is `'stock'`; `/app/reps` is `'stock'`; `/app/tips` and `/app/tax` are `'team-pay'`; `/app/settings` is `'profile'`; `/me/pending` is `'staff'`; `/login` and `/app/no-access` are `'outside'`; every page path parsed from `docs/superpowers/findings/route-inventory.md` returns a non-null value; a query string and a trailing slash are ignored; an unknown path returns `null` and does not throw; `visibleDestinations(role)` returns the five destinations for `owner`, `manager` and `accountant`, with a comment that no page-level role gate exists today (`lib/permissions.tsx`).
- **Implement.** A plain data table and two functions. No icon or React import. An exact-match table for the listed routes with longest-prefix fallback for children.
- **Acceptance:** GATES; `git grep -n "nav/destinations" -- app components` prints nothing (it is not wired); `git diff --stat "app/(app)/app/_components"` prints nothing.
- **Commits:** two: the document, then the map with its test.
- **Log:** that the navigation is unchanged and what unlocks Task 7 steps 3-4.
- **Stop:** do not edit `nav-config.ts`, the sidebar, the bottom bar, the tabs or the breadcrumbs.

### N7. Critique of six screens, scored twice (documents only)
- **Model:** sonnet (12 reviewers and one measurement agent). No Opus: there is no gate to debug.
- **Files (new):** `docs/superpowers/findings/critique/app-payroll.md`, `app-payroll-review.md`, `app-inventory.md`, `app-inventory-shipments.md`, `app-sales.md`, `app-books.md`, `summary.md`.
- **Scope.** The six screens in decision 7 at 1280x800 and 390x844; payroll in week and day views. Per Plan 2 Task 3: two reviewer agents per screen, isolated from each other, never told a target score and never shown the measured output; one measurement agent records contrast, target sizes, landmarks and console messages for all six. Each file records both totals and the average, the ten heuristic scores, P0-P3 issues, the measured findings, error, empty and not-configured states, and which issues are product gaps (heuristics 7 and 10) rather than visual defects. A third reviewer only where the two totals differ by more than four. `summary.md` opens with "6 of about 28 screens", then the table by score, issues that recur on three or more screens, and the cognitive-load failures.
- **Preconditions.** Browser precheck passes. Sign in through the documented dev route (`2026-11-24-dev-setup.md`: one `POST /api/demo`, once, reusing the session for every agent). Read-only browsing as defined under the guardrails.
- **Acceptance:** seven files exist; `git status --short` shows changes only under `docs/superpowers/findings/critique/`; GATES (unchanged, since no code moved).
- **Log:** the six averages, and any screen that could not be reached.
- **Stop:** if the precheck fails or sign-in fails, skip the whole item and log why. No fix is made in this item, however obvious. No loop to a score.

### N8. Items "Top Sellers" counts sales only (stock display; own commit)
- **Model:** sonnet.
- **Files (new):** `lib/inventory/usage-rank.ts`, `lib/inventory/usage-rank.test.ts`. **Edited:** `app/(app)/app/inventory/_components/inventory-dashboard.tsx`.
- **Order of work.** (1) Move the two `useMemo` bodies (lines 109-131) verbatim into pure `rankTopSellers(logs)` and `rankBiggestLosses(logs)`. (2) Write the tests below; the first one must fail against the verbatim move. (3) Fix `rankTopSellers`. (4) Point the component at the two functions and change the Top Sellers empty text to "No POS sales recorded yet".
- **Failing test first:**
  1. Logs containing only `spillage`, `comp` and `staff_drink` give an empty Top Sellers list (red before the fix).
  2. `pos_sale` 10 and `pos_reversal` 3 for one item rank it at 7.
  3. An item whose reversals meet or exceed its sales is left out.
  4. `delivery`, `recount` and `other` never count as sales.
  5. At most five items, largest first.
  6. Biggest Losses: `spillage` + `comp` + `staff_drink` only, summed per item, five at most. This pins today's behaviour and must pass both before and after.
- **Acceptance:** GATES (test count rises); `git diff --stat` lists exactly those three files; no query, no action and no other card in the component changes. Browser precheck, then if it passes: on the dev demo bar `/app/inventory` shows the Top Sellers empty state and the same Biggest Losses list as before.
- **Log:** the root cause in one line and whether it was browser-verified.
- **Stop:** if the fix needs a change to the `usage_logs` query in `inventory/page.tsx` or to any write path, revert and defer.

### N9. Day split agrees with the pay run on removals, and shows the over-allocation flag (money display; two commits)
- **Model:** sonnet.
- **Files:** `lib/payroll/night-split.ts`, `lib/payroll/night-split.test.ts`, `app/(app)/app/payroll/actions.ts` (**only** `DaySplitData` and `getDaySplitData`, from line 1052 down), `app/(app)/app/payroll/_components/day-split-tab.tsx`.
- **9a. Failing test first**, for a new pure `nightForSharing({ zTotalTips, removals, serverTips, keepers })` returning `{ removed, removalOverdrawn, kept, keptTotal, remainder, overAllocated }`, which calls `applyTipRemovals` and then `carveOutKeptTips` in the pay run's order (`payroll/actions.ts:819-833`):
  1. Z 1000, one unattributed removal of 100, no keepers: `removed` 100, `remainder` 900.
  2. A removal naming an employee does not shrink the night: `remainder` 1000.
  3. A removal of 1200 against Z 1000: `remainder` 0, `removalOverdrawn` true.
  4. Z 1000, unattributed removal 100, one `individual` keeper with `tipsPaidOut` 300: `keptTotal` 300, `remainder` 600.
  5. For a `sales_pct` keeper, the result equals calling `applyTipRemovals` then `carveOutKeptTips` by hand on the same inputs.
  6. Keeper tips larger than the night: `overAllocated` true, `remainder` 0.
  7. No removals and no keepers: `remainder` equals the Z total (today's behaviour, pinned).
- **9a. Implement.** In `getDaySplitData`, read that date's `payroll_adjustments` rows with `kind = 'tip_removal'` through the same cookie-scoped client, with `.eq('organization_id', org.id)`; call `nightForSharing`; add `removedTips: number` to `DaySplitData`; keep `totalTips` as the Z total. In the client, the pool base at line 324 becomes `data.totalTips - data.removedTips - data.keptTips`, and the Total Tips card gets a second sub-line, shaped like the existing `keptTips` one, when `removedTips > 0`.
- **9b.** Add `overAllocated: boolean` to `DaySplitData` from the same result and show one sentence on the day split when it is true, in `text-accent-text` with `role="status"`: "The per-server tips recorded for this night add up to more than the night's tips, so they were scaled down to fit. Check the server rows on the Z report." No arithmetic changes in 9b.
- **Acceptance:** GATES (test count rises); `git diff --numstat -- lib/payroll/night-split.test.ts` shows 0 deletions; no other test file changes; `git diff "app/(app)/app/payroll/actions.ts"` shows no hunk above `export interface DaySplitData`. Browser precheck, then if it passes: record the Bartender Pool figure for one demo night before and after; with no removal on that night the two must be equal to the cent.
- **Commits:** two: 9a, then 9b.
- **Log:** the before and after pool figure, and that `computePayroll` was not edited.
- **Stop:** any existing payroll test fails (revert; never edit the test); the change needs a line inside `computePayroll`; or `audit:scope` reports a new unscoped query.

---

## Do NOT do tonight

| Item | Why |
|---|---|
| Rebuild the sidebar, bottom bar, tabs or breadcrumbs (Task 7 steps 3-4) | Most visible surface; needs the owner's yes on the table and a watched browser check. |
| Delete or re-wire the org switcher | A second membership is reachable by design; the deciding query is on live. |
| Delete UI primitives or remove dependencies | Lockfile change with no user gain; Task 7 may want them. |
| Change any token value, DESIGN.md or `.impeccable/design.json` | Design judgement; needs screenshots in both themes. |
| Move or rename the ten legacy migration files | They are already ignored by the CLI; moving them gains nothing and can break references. |
| Run `supabase` in any form, or apply `20261125000000_employees_archived_at.sql` anywhere | Live and dev schema are a human's job. |
| Edit `computePayroll`, a pay-run snapshot, `run-diff`, NACHA, payouts or any tax figure | Money; out of tonight's scope except the two display items in N9. |
| Type the eight `any`s on the pay and import path, or refactor the four set-state-in-effect sites | Money input parsing; behaviour refactors without a browser. |
| Change `/api/poll-2touch`, the cron route or `proxy.ts` | Cross-tenant jobs and the auth gate. |
| Fix walk findings 7, 9, 11-13, 16-21, 23-36 | Money, tips, stock, tax, auth, or need a design call. |
| Laws matrix (Task 4), landing reconciliation (Task 6 steps 3-4), close-out (Task 8) | Depend on work not finished tonight. |
| Loop any critique to a target score | Plan 2, lessons from Plan 1. |
| Push, deploy, rotate a key, delete a branch, send anything | Guardrail 1. |

## What remains for a human

1. **Carried over.** Apply `supabase/migrations/20261125000000_employees_archived_at.sql` to dev, then live, before deploying; rotate the Gmail, Twilio and Groq keys; run the two real-data tips queries in `2026-11-25-decisions.md`.
2. **Org switcher.** Run the two-membership count on live and say whether one person running two bars is supported.
3. **Support address.** Confirm the published business contact is the right place for "Contact support", or supply a dedicated mailbox.
4. **Navigation.** Confirm or correct the destination table in `navigation-validation.md` (Reps under Stock is the change from the spec). That confirmation, plus a watched browser check, unlocks the visible nav rebuild.
5. **`/api/poll-2touch`.** Delete it or restrict it to owners with a rate limit. Confirm `CRON_SECRET` is set in Vercel, or approve making the cron route fail closed.
6. **Over-allocated nights.** Decide whether a flagged night should also show on the week view and Review, be stored in the run snapshot, or block submit. Same question for a removal larger than the night's tips (`removalOverdrawn`), which is still silent.
7. **One night function for both screens.** After reviewing N9, decide whether `computePayroll` should call `nightForSharing` too, so the pay run and the day split cannot drift again.
8. **Dependencies.** Yes or no to removing `cmdk`, `@radix-ui/react-label`, `@radix-ui/react-slot` and the five unused primitives.
9. **Migrations.** Fill in the "OWNER TO CONFIRM" lines in `supabase/README.md`: how live has actually been migrated, and whether `seed_sales_kingr5183.sql` (a data seed, judging by its name) belongs in that folder.
10. **Token audit.** Any pair `audit:tokens` reports as failing needs a design decision.
11. **Lint.** Twelve errors remain (eight `any` on the pay and import path, four set-state-in-effect).
12. **Walk findings still open.** Needing owner review because they touch money, tips, stock or tax: 7, 9, 11, 12, 13, 17, 18, 19, 20, 23, 24, 25, 26, 29, 30, 36. Needing a behaviour or design call: 6, 8, 16, 21, 27, 28, 31, 32, 33, 34, 35, 37, 39. Dropped: 38 (deliberate).
13. **Plan 2 remainder.** Task 3 for the other screens, Task 4, Task 6 steps 3-4, Task 7 steps 3-4, Task 8.
14. **Dev data.** The walk's test rows are still in the dev project (`walk-findings.md`, "Test data left in dev"); N7 adds one demo org, swept after 24 hours.
