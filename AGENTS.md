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
npx tsc --noEmit     # typecheck (no test runner in the Next app)
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

**POS sales deplete stock.** The item audit no longer just creates inventory rows:
quantities move `current_stock` and write `usage_logs` with `reason: 'pos_sale'`.
The agent re-sends a 2-day window every 5 minutes, so depletion is delta-based
against `pos_stock_applications` — never subtract what the POS reports, subtract
the difference from what was already applied. `pos_apply_item_sales()` does this
atomically; see `supabase/migrations/20260817000003_*.sql`.

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

## Env vars (`.env.local`)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`GROQ_API_KEY`, `DD_ENCRYPTION_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_FROM_NUMBER`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `TWOTOUCH_INGEST_SECRET`,
`CLOVER_CLIENT_ID`, `CLOVER_REDIRECT_URI`, `CLOVER_SANDBOX`. Plus `CRON_SECRET` on Vercel.

Agent release manifest (`GET /api/agent/manifest`, Vercel only — the route returns
`204` until all three are set, which every agent reads as "you are current"):
`AGENT_LATEST_VERSION`, `AGENT_DOWNLOAD_URL`, `AGENT_SHA256`, plus optional
`AGENT_MINIMUM_VERSION` and `AGENT_RELEASE_NOTES`. See `2touch-agent-dotnet/README.md`
→ *Releasing an update*.
