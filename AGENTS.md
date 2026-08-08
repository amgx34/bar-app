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
~19 files under `app/`. Every query through it MUST filter `.eq('organization_id', org.id)`
by hand — a missing filter silently returns other bars' data.

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
- AI parsing uses Groq (`lib/ai-parsers/`).

## Env vars (`.env.local`)

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`,
`GROQ_API_KEY`, `DD_ENCRYPTION_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_FROM_NUMBER`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `TWOTOUCH_INGEST_SECRET`,
`CLOVER_CLIENT_ID`, `CLOVER_REDIRECT_URI`, `CLOVER_SANDBOX`. Plus `CRON_SECRET` on Vercel.
