# Universal demo: one shared, read-only demo bar set

Status: design only. No code changed, nothing applied, nothing pushed.
Measured against branch `rebuild/foundation` (HEAD 23c4c1d).

## 1. Diagnosis

### Why it loads slowly

`POST /api/demo` does everything a sign-up would do, once per visitor, one await at a time.

| Step | Round trips |
|---|---|
| bot check, rate limit RPC, `getUser`, live-org count | 3 to 4 |
| `auth.admin.createUser` | 1 |
| `seedDemoOrg` x 3 bars (tavern, lounge, corner) | see below |
| `recordTermsAcceptanceForUser` | 1 |
| `signInWithPassword` | 1 |

`seedDemoOrg` per bar is 6 fixed inserts (org, membership, categories, reps, items, employees), plus 1 usage-log insert, plus **5 calls per open night** inside a `for` loop: upsert `z_report_days`, delete then insert `z_report_server_tips`, delete then insert `employee_shifts`. The base data has 12 nights. After the profiles close some nights: tavern 12 nights = 67 calls, lounge 10 = 57, corner 9 = 52. That is **176 sequential calls in the seed, about 185 for the whole request.**

Measured here: one Supabase REST round trip from this Mac to the dev project is 0.22 to 0.35 s (6 samples, includes TLS), so the same path run from this machine is roughly 40 s. From Vercel the per-call cost is lower (about 30 to 100 ms depending on region match), which is still **6 to 18 s of pure waiting**, before cold start, and `maxDuration = 60` was raised for exactly this reason. Then the dashboard page has to render, so the visitor's total is seed time plus a cold page.

Batchable on sight: the per-night loop is 60 calls per bar that become 3 bulk calls (upsert all days, insert all tips, insert all shifts) with the delete replaced by one `delete().eq('organization_id')` before it. The three bars could also run in parallel. That alone would take ~185 calls to ~25. It is moot under the new design, but the same batching is how the new seed stays under the cron budget (section 3).

I did not POST `/api/demo` to time it end to end: that creates a user and three orgs in the dev project, and this task is read-only.

### Why demos do not delete themselves

- **Sweep exists and is scheduled in production only.** `vercel.json` has one cron, `0 13 * * *` on `/api/cron/2touch`, and that route calls `purgeExpiredDemoUsers()`. Nothing else triggers it. `npm run dev` never runs a cron, so a dev project is never swept.
- **Daily cron against a 24 hour TTL.** A demo made at 13:05 UTC is 23h55m old at the next run, so it survives to the run after: lifetime is 24 to 48 hours, and the "expired" banner shows long before deletion.
- **The sweep shares one 60 s budget with three other jobs** and runs after `poll2TouchEmails()` and the Clover/Toast sync. It also pages every auth user (`listUsers`, 100 per page) and deletes with one `organizations.delete().in('id', ids)` that cascades through dozens of child tables. A timeout or cascade error lands in an `errors` array that only goes to `console.log`; nothing alerts and the next run just retries into the same wall.
- **Users are deleted even when the org delete failed**, which is how orphan orgs were made. The sweep by slug fixed that, but only for the cases it reaches.
- **Cap math.** `MAX_LIVE_DEMO_ORGS = 750` counts orgs, so every undeleted visitor holds 3 slots.
- Preview deployments get no cron at all.

Counts, read-only (head-count queries and an auth user listing, nothing written):

| Project | Orgs | Demo orgs (slug prefix) | Auth users | Demo users | Demo users older than 24 h |
|---|---|---|---|---|---|
| dev (`.env.development.local`) | 16 | 16 | 10 | 10 | **10, so nothing has ever been swept** |
| live (`.env.local`) | 9 | 3 | 11 | 1 | 0 |

Disclosure: I ran the read-only count against the `.env.local` project first, before I had confirmed it is the live one (`scripts/dev/live-guard.ts` says `.env.local` holds live). Only counts were read; no rows, emails or ids were printed or saved. The live project holds 3 demo orgs and 1 demo user that the cleanup script in section 4 will list on its dry run.

## 2. The design in one paragraph

Three permanent demo bars (the existing three profiles) owned by **one fixed demo user**. Visitors are signed in to that user with a normal Supabase session, so no user or org is ever created per visit. The data is seeded by an idempotent command and refreshed daily. Writes are refused in the database by a trigger that every path hits (server actions, API routes, RPCs, the admin client), and the app turns that refusal into a friendly sentence. The old per-visitor orgs and users are retired by a dry-run-first script.

## 3. Specification

### (1) Instant entry, no users or orgs created

Pattern: **fixed demo user with a real password held only in the server env, `signInWithPassword` per visitor.**

- Auth user created once by the seed command (`email_confirm: true`), email `shared-visitor@demo.example`. It must **not** end in `@rail.demo`, because the old purge deletes any user with that suffix older than 24 h. Env: `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD` (random, 32+ chars, never shown to a client).
- `POST /api/demo` becomes: bot check, rate limit (keep `demoCreate`, raise limit since it is now cheap), `getUser` (keep the "already signed in to a real account" early return), `signInWithPassword`, return `{ redirectTo: '/app/dashboard' }`. Two or three calls. No `createUser`, no seed, no terms upsert in the request (the terms row is written once by the seed command for the demo user; `/app` consent gate then finds it).
- Why this pattern: the repo's `createClient()` (`lib/supabase/server.ts`) already writes session cookies on sign-in, `proxy.ts` only needs a valid session, and `signInWithPassword` is the exact call the current route already relies on, so it is known to work here. Each visitor gets their own session and refresh token, so there is no shared-token reuse revocation. Rejected: sharing one cookie/refresh token across visitors (Supabase refresh-token reuse detection would sign everyone out); a custom JWT (the repo has no signing secret path and `getUser` validates against Auth server-side anyway); `generateLink` plus `verifyOtp` (two calls, no benefit).
- Risk accepted: the password allows `/login` sign-in as the demo user. Harm is nil because every write is refused (below) and settings that change auth (password, email, delete account) are blocked in section (3a).
- Three bars, one visitor: the user has three `memberships` (tavern owner, lounge manager, corner owner), exactly as today, and `selectActive` plus the `current_org_id` cookie already switch between them. Switching sets a cookie only and must stay allowed.
- Remove per-visitor concepts for this user: the 24 h countdown in `DemoBanner`, `demoTimeLeft`, the `rail_demo` expiry redirect. The banner becomes a permanent "Sample data. Nothing you change is saved." with a Sign up link.
- Identify demo orgs by a **column**, not by name: add `organizations.is_read_only boolean not null default false` (migration, not applied here), set true for the three bars. `isDemoOrg()` (billing exemption, settings, account-actions) becomes `org.is_read_only || slug startsWith DEMO_SLUG_PREFIX`; getCurrentOrg already selects the org row so add the column to that select.
- New slug prefix for the permanent bars: `rail-demo-` (`rail-demo-tavern`, `rail-demo-lounge`, `rail-demo-corner`). It must not start with `demo-tipsy-tavern-`, so the existing sweep can never match it (section 4).

### (2) Fresh sample data with relative dates

- Seed command: `npm run demo:seed`, a `.ts` run by `node --no-warnings` like `predev`. Ordering at the top of the script: call `assertDevIsNotLive` style check and **refuse unless the target URL equals the dev project host** (flag `--allow-host` needed for anything else, and it must be typed by the owner). Idempotent: upsert the user, orgs (by slug), memberships; then for each bar delete its generated children by `organization_id` and bulk insert. Safe to run any number of times.
- All dates are offsets from "today in the bar's time zone" (`dateStr(offset)` already works this way). Nights run offsets 1 to 14, closed nights from the profile. Shipment `invoice_date` and `logged_at` are set from the same offsets but as the two separate clocks the codebase documents; the shipment lines carry `shipment_id` and `unit_cost`, not a date join.
- Batching: bulk upserts per table (roughly 25 calls per bar, the three bars in `Promise.all`), so a refresh finishes in a few seconds, well inside the cron budget.
- Refresh in production: the existing daily cron `/api/cron/2touch` gets `refreshUniversalDemo()` in its own try/catch with a hard 20 s limit, placed **before** the purge. Same function the seed command calls, so there is one code path. It runs with the seed header (see 3a).
- Staleness between crons (Hobby plan allows one cron per day): follow the existing "refresh after the response when stale" pattern (`isStaleOnView`). When the newest sales night in a demo bar is older than yesterday in the bar's zone, or `pos_config.last_sync_at` is over 30 minutes old, the app layout schedules `refreshUniversalDemo()` via `after()`, guarded by a lease row so overlapping visitors do not stampede. The sync-status timestamp refresh is a one-row update, throttled to once per 30 minutes.
- Because shared data is rewritten under visitors, the refresh deletes and reinserts per table inside the short window; a page rendering mid-refresh can briefly look thin. Acceptable for a demo; reads are never blocked.

### (3) Central write guard

Principle: do not trust the UI and do not trust that 43 action files each remember a check. Put the guarantee where every path converges, the database, then make the app friendly on top.

**Layer A, database trigger (the guarantee).** One migration (not applied here) that:

1. adds `organizations.is_read_only`;
2. defines `rail_demo_guard()` as a `BEFORE INSERT OR UPDATE OR DELETE` row trigger: if the row's org (`organization_id`, or for child tables the parent lookup) has `is_read_only`, and the request does not carry the seed credential, raise exception with message `This is a sample bar, so changes are turned off. Sign up to try it with your own data.`;
3. attaches the trigger with a `DO` block that loops over every `public` table having an `organization_id` column, plus an explicit list of parent-inherited tables with no such column: `weigh_report_items` (via `weigh_reports`), `pos_bundle_components` (via `pos_bundles`), and any other table the same `information_schema` query finds with an FK to an org-scoped parent and no `organization_id` (listed by the migration test, not guessed);
4. also guards `organizations` (update/delete of a read-only org) and `memberships`.

Why a trigger and not RLS or app code: the service role bypasses RLS, and `createAdminClient()` is imported by **61 files**. Triggers fire for service-role writes and for writes made inside `security definer` RPCs (`pos_apply_item_sales`, `inventory_apply_count`, `dd_commit_account`, `dd_delete_account`), so those are covered with no extra work.

**Seed bypass.** The seed and refresh use a client created with a custom header `x-rail-seed: <DEMO_SEED_KEY>`; the trigger reads `current_setting('request.headers', true)::json ->> 'x-rail-seed'` and compares it with a hash stored in a one-row `demo_seed_key` table (readable only by the trigger function owner). The app's normal `createAdminClient()` never sends it. This is unverified against this repo's Supabase until tried on the dev project, and is the first thing the implementation task must prove with a failing-then-passing test (a write without the header refused; with it, allowed). Fallback if headers are not exposed: seed through one `security definer` function that sets a transaction-local flag.

**Layer B, friendly message in the app.** The trigger message is already the user-facing sentence, so every action that returns `error.message` shows it. The implementation task must grep every action for places that swallow or replace DB errors (generic "Something went wrong") and route them through one helper `friendlyDbError(error)` that maps this message (SQLSTATE `P0001` plus the sentence) to the standard toast. Verification is a Playwright pass that fires each write below as the demo user and expects the sentence, not a crash.

**Layer C, requests that never reach the table** (auth writes and side effects, not covered by a row trigger):

- `proxy.ts` already calls `getUser()`. For the fixed demo email, return 403 JSON for every non-GET to `/api/*` except `/api/demo` (sign-in) and the sign-out path. This covers `email-replies`, `poll-2touch`, `billing/checkout`, `billing/portal`, `account/*`, `payroll/*` API routes and `v1/*` without editing each.
- Block in code: `settings/account-actions.ts` (delete account; already returns a message for demo orgs, extend to the universal flag), `team-actions.ts` (`auth.admin.createUser`, invites), `staff-access-actions.ts`, `(auth)/*` actions for password/email change, `settings/actions.ts` anything that calls `auth.updateUser`, `setup/pos/*` (Clover/Toast connect: external credential writes, `pos_credentials`), `actions/messages.ts` and `payroll/*` actions that send email, SMS or push (Twilio, Gmail, web push, NACHA export download is a read and may stay).
- Outbound effects: none of the three bars may have `pos_credentials`, Stripe ids or real phone numbers, so cron provider sync, notifications delivery and billing skip them by construction. Keep `BILLING_ENFORCE` exemption through `isDemoOrg`.

**Write-path inventory (from grep, not from the UI).**

Server action files (`'use server'`, 43): `accept-terms`, `app/actions`, `me/actions`, `settings/{excluded-items,team,staff-access,main,bundle,account}-actions`, `sales`, `books/{actions,expense-actions}`, `dashboard`, `tax`, `inventory/{actions,weigh,count,analytics,setup,shipment-actions,deals-actions}`, `tips`, `actions/{messages,notifications}`, `payroll/{tax-settings,payout,actions,cash,direct-deposit,claim,adjust,approval}-actions`, `reps`, `setup/{actions,pos,pos/clover,pos/toast}`, `app/actions/contact`, `(auth)/{login,join,signup}`, and `lib/ai-parsers/{parse-shifts,parse-z-report}-with-ai`.

POST/PUT/PATCH/DELETE route handlers: `2touch/ingest` (HMAC, agent token; demo bars have none), `billing/{checkout,portal,webhook}`, `clover/webhook` (inert without key), `demo`, `email-replies`, `poll-2touch`. GET routes with side effects: `cron/2touch`, `agent/manifest` (read), `auth/{confirm,callback}`.

`createAdminClient()`: 61 files. Browser client (`lib/supabase/browser.ts`): no importer in `app`, `components` or `lib`, so there are no client-side direct writes. RPCs that write: `pos_apply_item_sales`, `inventory_apply_count`, `dd_commit_account`, `dd_delete_account` (all covered by the trigger), plus `rate_limit_hit`/`rate_limit_sweep`/`prune_jsonb_payloads` which are not org data and stay allowed.

Deliberately allowed: org switching (cookie only), sign out, read-only exports and downloads.

**Tests.** Pure: a vitest listing every table from the migration set that has `organization_id` and asserting the guard migration attaches to it (so a new table cannot ship unguarded; the test fails when a migration adds one without the trigger). Integration (dev project only, by the implementation task): write as demo with and without the seed header via admin and via RLS client. The list of tables and the parent-lookup tables is derived by script, not typed.

### (4) Keep the old sweep off the new bars; retire the old orgs

Keeping the sweep off:

- `purgeExpiredDemoUsers()` finds orgs by `slug like 'demo-tipsy-tavern-%'` and users by email suffix `@rail.demo`. The new bars use `rail-demo-%` and `shared-visitor@demo.example`, so neither query can match them.
- Defence in depth, because "it cannot match today" is one rename from untrue: the purge also loads `DEMO_PERMANENT_SLUGS` and the demo user id and drops them from both id lists before any delete, and `organizations.delete` in the purge adds `.eq('is_read_only', false)`. A test pins both: given an expired-looking `rail-demo-tavern` org and the shared user, the selected delete set is empty.
- Add a second trigger rule: `DELETE` on a read-only org is refused unless the seed header is present.

Retiring the old per-visitor data, `scripts/demo/retire-old-demos.ts`, **dry run by default**:

1. Refuses to start unless the URL host matches an allow-listed project (flag `--project dev|live` must match the host; live needs `--i-understand-this-is-live` and is never run by an agent).
2. Reads, never writes: lists orgs with slug `like 'demo-tipsy-tavern-%'` (and the early unprefixed ones, found by `bar_settings->>_is_demo = 'true'`), lists auth users ending `@rail.demo`, prints counts, oldest and newest, and the memberships that tie them together. Orgs with a membership to a user that does **not** end in `@rail.demo` are listed as "protected, skipped" and never deleted.
3. `--apply` deletes in order: orgs (in batches of 25 with the cascade, stop on first error), then users one by one. Prints a summary and exits non-zero on any failure. Idempotent; a second run finds nothing.
4. Run once on dev after review by the owner. For live the owner runs it by hand during a quiet window; the dry run output is the change record.

Ordering of rollout: migration, seed on dev, verify, retire old demos on dev, switch `/api/demo`, then live.

### (5) The three-bar picture and fake data per category

| Bar | Role the visitor holds | Scale | What it shows |
|---|---|---|---|
| The Tipsy Tavern (Chicago, bar) | owner | 1.0x | The full set below, payroll run **submitted** and waiting for owner sign-off, tax withholding on |
| Velvet Room Lounge (Austin, nightclub) | manager | 1.9x | Busy, bigger sales, payroll run **approved**, a delivery shipment with freight and tax; manager view of what an owner would approve |
| Corner Pour (Madison, bar) | owner | 0.45x | Small bar, 3 fewer staff, thin sales, an open (not yet submitted) period, some items below par |

Fake data needed in each bar (all relative to today; none needs a live service):

| Category | Needed data |
|---|---|
| Sales and Z reports | 14 nights of `z_report_days` (sales, cc tips, cash/card split), a few `z_report_department_sales`, `z_report_register_sales`, `z_report_cc_types`, with a quiet Tuesday and a peak Saturday |
| Hourly and servers | `z_report_hourly_sales` (an evening curve peaking 10 pm to 12 am), `z_report_server_sales` and `z_report_server_tips`, one server with a high tip rate to show the flag |
| Tips | `cash_tips` on some nights with `cash_tips_source = 'manual'` on one to show the manual rule; pool, individual and barback modes in the employee set |
| Payroll | `employee_shifts` over the current and prior period with some overtime; `payroll_runs` rows: tavern `submitted` with `snapshot` (so `OpenRunBanner` renders), lounge `approved` with the approver, corner none; one `payroll_adjustments` row, one partial `payroll_payouts` row; a pay-run diff that is empty so the review screen is clean |
| Employees | 7, 6 and 4 staff with roles and rates, one W-2 and one 1099 classification, W-4 fields on two (no real bank data; `direct_deposit_accounts` empty) |
| Inventory with par levels | about 28 items across 5 categories, 3 low, 1 out, 1 over par; `usage_logs` for pos_sale, spillage, comp, staff drink, recount; one `weigh_reports` with items; `unit_cost` set on delivery rows |
| Shipment | one `inventory_shipments` with `invoice_date` five days back, vendor name, freight and tax, and 4 lines whose `usage_logs.shipment_id` link to it with `unit_cost` (so the "recorded, not inferred" rule is shown) |
| Reps and orders | 3 reps with company and phone-looking fake numbers (555 range), 2 `rep_orders` (one sent, one draft), 2 `bar_messages` with a reply |
| Books and expenses | `operating_expenses` across 3 months (rent, utilities, insurance, music license), enough to give COGS, labour and profit |
| Tax | `tax-settings` per bar (state, filing status defaults, FICA rates), withholding preview data derives from shifts; nothing filed |
| Notifications | 5 `notifications` per bar: low stock digest, nightly sales, one sales anomaly, payroll approval; some read, some unread; preferences left empty so role defaults apply |
| POS sync status | `pos_provider` set per bar, `pos_config` with `last_sync_at` = refresh time, a believable `last_sync_summary` (rows brought), `agent_version` current, no `agent_token` (so ingest rejects any signed request) and no `pos_credentials` |
| Billing exempt | `isDemoOrg` true through `is_read_only`, so `getOrgBilling` skips enforcement; no `org_billing` row, no Stripe ids |

Out of scope here, noted for the next step: the transparent or single colour sample images keyed on item-name keywords the owner asked for. That belongs in the inventory task (a keyword to image map applied when an item has no image), not in the demo plumbing.

## 4. Order of work for the build tasks

1. Failing tests first: guard coverage test (every `organization_id` table), purge exclusion test, `isDemoOrg` flag test, seed date-offset test.
2. Migration (written, not applied): `is_read_only`, trigger, seed key table.
3. `lib/demo/universal.ts`: fixed identity, slug constants, pure data builders; refactor `seed.ts` to bulk writes.
4. `npm run demo:seed` (dev-only guard), then `refreshUniversalDemo()` wired into the cron and the stale-on-view hook.
5. `/api/demo` rewrite, banner copy, proxy non-GET block, action/auth blocks, `friendlyDbError`.
6. `scripts/demo/retire-old-demos.ts` dry run, owner review.
7. Playwright pass at 390 and 1440, light and dark: sign in, every page loads in under 2 s, every write path shows the friendly message.

## 5. Not verified

- `request.headers` GUC availability for the seed bypass on this Supabase project (fallback specified).
- The exact full list of parent-inherited tables; the migration test must derive it.
- Actual wall time of the current path on Vercel; only the local round trip was measured and the call count is from the code.
- That `shared-visitor@demo.example` passes Supabase's email validation; any non-`@rail.demo` address works if not.
- Whether `signInWithPassword` concurrency for one user has a rate limit at high traffic (Supabase auth per-IP limits apply to the Vercel egress); the per-IP limit in the route should be re-tuned.
