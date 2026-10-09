<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Rail — bar management SaaS

Multi-tenant Next.js 16 + Supabase app for bars: inventory, payroll, tips, Z reports.
One org = one bar; users join orgs via a `memberships` table.

## Commands

```bash
npm run dev          # next dev
npm run build        # next build
npm run lint         # eslint
npx tsc --noEmit     # typecheck
npm test             # vitest, unit tests for the pure money functions in lib/
```

Sibling codebases have their own toolchains:
- `2touch-agent-dotnet/` — .NET 9 Windows Service. `dotnet publish -c Release -r win-x64 --self-contained`. See its README.
- `direct-deposit-service/` — FastAPI. `pip install -r requirements.txt`, `pytest`.
- `2touch-agent/` — legacy Node agent, superseded by the .NET one.

## Data access — read this before writing a query

**`createAdminClient()` uses the service-role key and bypasses RLS.** It is used in
~25 files under `app/` and `lib/`. Every query through it MUST filter
`.eq('organization_id', org.id)` by hand — a missing filter silently returns other
bars' data.

`npm run audit:scope` enforces this and exits non-zero on a violation. Where the
filter genuinely does not belong — a mutation guarded by an earlier scoped
lookup, or a cron job that routes across orgs — justify it in place:

```ts
// admin-scope-ok: `item` was fetched above with .eq('organization_id', org.id)
// and the function throws when it is missing, so this id is always in-org.
```

Tables that inherit tenancy through a parent (`weigh_report_items` →
`weigh_reports`) have no `organization_id` of their own. Verify the parent before
mutating; see `assertItemInOrg` in `app/(app)/app/inventory/weigh/actions.ts`.

**A delivery's cost is recorded, not inferred.** `usage_logs.unit_cost` is what the
invoice charged, in stock units; `shipment_id` links the movement to its
`inventory_shipments` document. Both are NULL for every delivery recorded before
shipments existed, and the books fall back to `inventory_items.cost_price` for
those — which is why editing an item's cost used to restate past months. Anything
valuing a purchase must read `unit_cost ?? cost_price`, never `cost_price` alone.
Invoice-level freight and tax are allocated across a shipment's own lines by
share of value (`lib/inventory/shipments.ts`); deposits are recorded but are not
a cost of sale.

`usage_logs.logged_at` and `inventory_shipments.invoice_date` are **different
clocks**, and nothing copies one into the other: `logged_at` is when the row was
inserted, `invoice_date` is the date printed on the paper, typed in by a person
or read by the AI. Confusing them has produced a real bug three times on this
branch — the books once counted a shipment's freight in a month its lines never
appeared in, landing the charge in no month at all; the inventory dashboard once
matched a shipment to a delivery day and so almost never matched, because entry
is rarely same-day. The fix both times, and the general rule: two tables related
by a foreign key are joined on the key, never on a date that happens to look
similar.

- `lib/supabase/server.ts` → `createClient()`: cookie-scoped, RLS applies. Prefer this.
- `lib/supabase/admin.ts` → `createAdminClient()`: service role, RLS off. Scope manually.
- `lib/supabase/browser.ts`: client components.

Server pages start with `const { org, role } = await getCurrentOrg()` (`lib/org.ts`).
It redirects to `/login` or `/setup`, and resolves the active org from the
`current_org_id` cookie. Role gates live in `lib/permissions.tsx`.

## Conventions

- Auth gate is `proxy.ts` at the root, not `middleware.ts` — it redirects unauthenticated
  `/app/*` requests to `/login`.
- `components/ui` is **Base UI** (`@base-ui/react`), not Radix. No `asChild`; use `render`
  and controlled dialogs. Only `components/ui/form.tsx` still imports Radix.
- Route groups: `app/(app)/` is authed (its layout sets `robots: noindex`),
  `app/(auth)/` is login, `app/_components/landing/` is the public marketing site.
- Page-local components live in `_components/` next to the page.
- Migrations in `supabase/migrations/`. Note: the base org/membership tables were created
  outside this repo, so the migration set is not a full schema.

## Integrations

- `POST /api/2touch/ingest` — POS agents push Z/EW/Item-Audit data. Auth is
  **HMAC-SHA256 over the raw request body** in `X-Rail-Signature`, keyed by that org's
  own `pos_config.agent_token`. Per-org secret, never a shared one.
- `GET /api/cron/2touch` — Vercel Cron (`vercel.json`, daily 13:00 UTC) email fallback
  for bars not running the agent. Gated on `CRON_SECRET`.
- `GET /api/agent/manifest` — what version of the POS agent is current, polled by
  `rail-update.exe` on each POS box. Unauthenticated by design.

**A sync that moved nothing is not a healthy sync.** The agent catches a failing
feed per-feed so one broken mapping cannot cost the bar its other three — but it
used to then push an empty array, and the route recorded that as a clean
`last_sync_at` with no errors. One bar ran a month that way: green strip, current
agent version, and no sales since August. Three things keep it visible now, and
all three are load-bearing:

- `SyncService` collects feed failures, logs them at **Error**, returns
  `SyncResult.Ok = false`, and sends them as `payload.agentErrors`, which the
  ingest folds into `last_sync_errors` prefixed `agent:`. The agent's own log is
  the Windows Event Log on a box behind a bar — not a channel anyone reads.
- `assessSyncHealth` has a `no-data` status for "checked in on time, reported no
  errors, brought nothing back". It warns in amber rather than alarming, because
  a bar closed for two days is genuinely indistinguishable from a dead feed here.
  An **absent** `last_sync_summary` means "cannot say", never "moved nothing" —
  old agents must not light up every dashboard.
- `appsettings.json` sets `Logging:EventLog:LogLevel`. Microsoft's EventLog
  provider caps itself at Warning regardless of `LogLevel:Default`, because that
  rule is per-provider. Left alone, every `✓ Sync complete — Z:2 EW:16` the agent
  writes is discarded, and the Application log shows only the Start/Stop entries
  `ServiceBase.AutoLog` writes directly — which are not ours and pass through no
  filter, so their presence proves nothing about the agent.

**`rail-update.exe` replaces the binary and nothing else.** The schema mapping
lives in each box's `appsettings.local.json`, so a feed added in a new release
reaches an existing bar only through `ProfileMigration`, which recognises a
wizard-written 2Touch config by the exact text of its Z source. It matches **two**
eras — the pre-1.0.0 four-column source, and the current six-column one, which has
been byte-identical since 1.0.2 and so is also what every 1.1.x–1.2.x box carries.
Boxes in that second range matched nothing for a release and reported no hourly or
per-server trade, permanently. A migration may fill a blank feed; it may never
replace a non-empty one, which is somebody's answer.

**POS sales deplete stock.** The item audit no longer just creates inventory rows:
quantities move `current_stock` and write `usage_logs` with `reason: 'pos_sale'`.
The agent re-sends a 2-day window every 5 minutes, so depletion is delta-based
against `pos_stock_applications` — never subtract what the POS reports, subtract
the difference from what was already applied. `pos_apply_item_sales()` does this
atomically; see `supabase/migrations/20260817000003_*.sql`.

**Drinks and stock are different units, and the conversion is in TypeScript.**
`lib/pos/pour.ts` turns a POS sale into stock consumed (`unitsPerSale`), resolving
the pour size item → category → org. `lib/pos/bundles.ts` applies it *before* the
RPC, so `pos_apply_item_sales()` receives quantities already in stock units and
its 1:1 subtraction is correct — do not add a second conversion in SQL. It needs
BOTH a container size and a pour size; either alone deducts one whole unit.

Which side of that line a figure sits on is not guessable from its name:

| stock units | drinks (POS units) |
|---|---|
| `inventory_items.current_stock`, `cost_price`, `par_level` | `inventory_items.sale_price` |
| `usage_logs.quantity` | `pos_item_sales.qty_sold` |
| `pos_bundle_components.quantity` when `unit='each'` | `pos_bundle_components.quantity` when `unit='oz'` |

`Books COGS = usage_logs.quantity × cost_price`, so anything writing `usage_logs`
must write stock units. `lib/pos/velocity.ts` sums both sources and converts the
sales side first. `lib/pos/*.test.ts` pins these invariants down.

**Cash tips entered by a person outrank the POS.** `z_report_days.cash_tips` has
two writers: the agent's Z feed and the payroll close screen
(`app/(app)/app/payroll/cash-actions.ts`). The agent re-sends a two-day window
every 5 minutes and 2Touch reports 0 cash tips for nearly every bar, so an
unguarded upsert erases a manager's jar count minutes after it is entered.
`cash_tips_source = 'manual'` freezes the figure; every POS writer — ingest,
`lib/2touch/poll-emails.ts`, the Clover sync — must honour it.

`z_report_days.cash_sales` / `card_sales` are **nullable with no default**, and
NULL means "the POS did not report the split" — not "the night took no cash".
Older agents, emailed Z reports and pre-1.1.0 configs all send nothing. The UI
shows the drawer panel only when the figure is non-null.

Deals ("Bucket of 5 Domestic") are recipes in `pos_bundles` + `pos_bundle_components`,
resolved by `lib/pos/bundles.ts`. Exclusions (`pos_excluded_items`) are filtered
BEFORE bundles are resolved, so an item that is both is never expanded —
`saveBundle()` removes the exclusion for that reason.
- AI parsing uses Groq (`lib/ai-parsers/`).

**Demo orgs are swept by slug, never by membership.** Deleting a demo auth user
cascades its `memberships` row away, so a purge that finds orgs by joining
through memberships destroys its own only handle on them — 34 orgs were orphaned
that way, each counting permanently against `MAX_LIVE_DEMO_ORGS`. `lib/demo/`
sweeps `organizations` by `DEMO_SLUG_PREFIX` + age instead, which is idempotent
and self-healing. The prefix is shared from `lib/demo/constants.ts` by all three
places that need it; do not re-inline it.

**Notifications are two streams in one bell.** `bar_messages` is rep
correspondence; `notifications` is system-generated alerts (low stock, nightly
sales, sales anomaly, payroll approval). They are deliberately separate tables —
every rep column (`sender_email`, `requested_amount`, `ai_breakdown`) is NULL for
a system alert.

Detection is **pure and tested** in `lib/notifications/detect.ts`; everything
touching the network is in `deliver.ts`. The three periodic alerts run from
`lib/notifications/run-daily.ts`, driven by the one Vercel cron
(`/api/cron/2touch`, daily) — the Hobby plan allows exactly one cron per day, and
all three alerts want to fire once after the night reconciles anyway. Payroll
approval delivers inline instead, because a manager waiting a day for sign-off is
useless.

Two invariants that are easy to break:
- **Low stock is edge-triggered.** The digest's `payload.itemIds` is the full set
  of low items and is read back on the next run as "already announced". Write
  only the new ones there and the alert re-fires nightly forever.
- **`notifications.dedupe_key` is what makes the cron re-runnable.** A unique
  index on `(user_id, dedupe_key)` turns a repeat pass into a no-op. Periodic
  alerts key on the business date; payroll keys on the run plus a timestamp,
  because a resubmission after a send-back *is* a new ask.

Preferences store only explicit choices — **a missing row means "use the role
default"** (`ROLE_DEFAULTS` in `lib/notifications/types.ts`). That is what lets a
new event type behave sensibly for existing users with no backfill.

Push is optional infrastructure: with no VAPID keys the bell still works, nothing
buzzes, and nothing throws. A `404`/`410` from the push service is the only thing
that may delete a `push_subscriptions` row — a transient 500 must not cost a
manager their notifications.

**A pay run is a snapshot, not a status flag.** `computePayroll()` recalculates
live, so approving a period would otherwise mean approving whatever the numbers
happen to be at read time. `payroll_runs.snapshot` freezes them at submit, and
`lib/payroll/run-diff.ts` diffs that against a fresh recompute before an owner can
sign off. Approving accepted changes REPLACES the snapshot — storing the
superseded one would record an approval of numbers nobody agreed to. The NACHA
export is gated on an approved run, escapable only via `overrideApprovalGate()`,
which writes down the reason.

**Settling a period pays BALANCES, and the cap is the same one.** "Pay remaining
N" on the payout bar (`PayoutProgress` → `PayEveryoneDialog` → `markManyPaid`)
is one action, not a client loop over `markPaid` — a loop would mean a
`computePayroll` per employee and a half-finished payroll the browser cannot
describe. It computes the run once, reads `loadPayoutsOverlapping` once, and
plans through `planBulkPayout` in `lib/payroll/payouts.ts`, which is pure and
tested. Three rules it inherits rather than reinvents: pay the balance (never
`totalCompensation`, or an advance is paid twice), skip anyone already square
(a zero-amount row is a payment that did not happen), and refuse anything over
`remainingAdvanceCapacity`. The dialog plans with the SAME function so what is
listed is what is written, and it reports what the server actually wrote —
never what it planned, because a replayed confirmation writes nothing and
"done" would read as a second payday. Idempotency keys are minted one per
employee when the dialog opens, so a double-tap collides on
`ux_payroll_payout_idempotency` instead of paying the whole room again.

**An unfinished pay run is announced outside the review screen.** Submitting
wrote `payroll_runs` and then went quiet — the status existed only on
`/app/payroll/review`, the one screen somebody has already left once they are
waiting for an answer. `OpenRunBanner` renders from the Payroll *layout* (like
`SectionTabs`, so no page can double it) and reads `getOpenPayrollRun()`, which
keys on STATUS rather than a period — that is what `ix_payroll_run_pending` was
created for, and this is its first reader. The wording lives in
`lib/payroll/open-run.ts`, pure and tested: only an owner gets a verb on a
pending run because only an owner can approve one, and a role that cannot act
gets the sentence without a button rather than a control that would refuse it.
Figures come off `run.snapshot`, never a recompute, or the banner would
disagree with the screen it links to.

## Env vars (`.env.local`)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`GROQ_API_KEY`, `DD_ENCRYPTION_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_FROM_NUMBER`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `TWOTOUCH_INGEST_SECRET`,
`CLOVER_CLIENT_ID`, `CLOVER_REDIRECT_URI`, `CLOVER_SANDBOX`. Plus `CRON_SECRET` on Vercel.

Web Push (all three, or push silently no-ops and only the in-app bell works):
`NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a
`mailto:` or https URL). Generate a pair with `npx web-push generate-vapid-keys`.
Rotating them invalidates every stored `push_subscriptions` row — devices must
re-enable.

Agent release manifest (`GET /api/agent/manifest`, Vercel only — the route returns
`204` until all three are set, which every agent reads as "you are current"):
`AGENT_LATEST_VERSION`, `AGENT_DOWNLOAD_URL`, `AGENT_SHA256`, plus optional
`AGENT_MINIMUM_VERSION` and `AGENT_RELEASE_NOTES`. See `2touch-agent-dotnet/README.md`
→ *Releasing an update*.
