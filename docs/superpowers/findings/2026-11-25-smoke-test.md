# Smoke test, 2026-11-25

Read-only. Dev server at localhost:3000 (dev database), one demo session (owner of "Demo Bar, The Tipsy Tavern"), Playwright on system Chrome 158 via the Playwright MCP, viewports 1440 and 390 wide. No application code changed.

## Routes

Columns: status is the HTTP status of the page load. "Ends at" is the final URL. Overflow is `scrollWidth - clientWidth` at 390px (0 means none). "Exc" is uncaught page exceptions.

| Route | Status | Ends at | Console at 1440 / 390 | Exc | Overflow 390 | Notes |
|---|---|---|---|---|---|---|
| / | 200 | / | clean | 0 | 0 | |
| /login | 200 | /login | clean | 0 | 0 | |
| /join | 200 | /join | clean | 0 | 0 | |
| /accessibility, /eula, /privacy, /terms, /thank-you | 200 | same | clean | 0 | 0 | |
| /app/no-access | 200 | same | clean | 0 | 0 | reachable by a signed-in demo owner |
| /accept-terms | 200 | /app/dashboard | clean | 0 | 0 | already accepted |
| /setup, /setup/pos, /setup/pos/clover | 200 | same | clean | 0 | 0 | reachable by an owner who already has an org |
| /me, /me/pending | 307 | /login | n/a | 0 | n/a | owner session has no staff profile; see defect 5 |
| /app/dashboard | 200 | same | clean | 0 | 0 | |
| /app/analytics | 307 | /app/inventory/analytics | clean | 1 (defect 1) | n/a | redirect page |
| /app/books | 200 | same | 4x Recharts width(-1) warning | 0 | 0 | defect 3 |
| /app/employees | 307 | /app/payroll/employees | clean | 1 (defect 1) | n/a | redirect page |
| /app/inventory | 200 | same | clean | 0 | 0 | |
| /app/inventory/analytics | 200 | same | 11x Recharts warning | 0 | 0 | defect 3 |
| /app/inventory/loss | 307 | /app/inventory | clean | 1 at 390, 0 at 1440 | n/a | redirect page |
| /app/inventory/setup | 200 | same | clean | 0 | 0 | |
| /app/inventory/shipments | 200 | same | clean | 0 | 0 | |
| /app/inventory/weigh | 200 | same | clean | 0 | 0 | |
| /app/payroll | 200 | same | clean | 0 | 0 | |
| /app/payroll/direct-deposit | 200 | same | clean | 0 | 0 | |
| /app/payroll/employees | 200 | same | clean | 0 | 0 | |
| /app/payroll/review | 200 | same | clean | 0 | 0 | |
| /app/payroll/split | 307 | /app/payroll?view=day | clean | 1 (defect 1) | 0 | redirect page |
| /app/reps | 200 | same | clean | 0 | 0 | |
| /app/sales | 200 | same (390 adds ?start=&end=&hour=15) | clean | 0 | 0 | defect 6 |
| /app/sales/categories | 307 | /app/sales?view=week | clean | 1 (defect 1) | n/a | redirect page |
| /app/sales/margins | 307 | /app/sales?view=month | clean | 1 (defect 1) | 0 | redirect page |
| /app/settings | 200 | same | clean | 0 | 0 | |
| /app/tax | 200 | same | clean | 0 | 0 | |
| /app/tips | 200 | same | 2x Recharts warning | 0 | 0 | defect 3 |

No page produced a blank render, an error boundary, a 4xx or 5xx on a sub-request, or horizontal overflow at 390px. The "n/a" overflow cells are redirect pages where the measuring script lost its execution context to the navigation; their destination pages were measured on their own rows.

### Clicks (1440px, demo owner)

Up to 8 non-destructive buttons or tabs per screen were clicked (labels containing delete, remove, send, pay, submit, approve, export, save, confirm, download, invite, import, connect and similar were skipped). Screens: dashboard, inventory (all category/stock-filter tabs, Add item, Show inactive), inventory analytics, setup (Add a deal), shipments (Log a shipment), weigh (Reports, Pour Analysis, Load Analysis), payroll (day prev/next, Cash tips), payroll employees (Pool, Individual, Sales %, Add Employee, Edit), review (CSV), books (Add), tax (year, state, Generate W-2s), reps (Add rep, More actions), settings. No uncaught exception, console error or 5xx on any click. Screens with no safe button found: sales, tips, direct-deposit, inventory analytics.

### API routes (unauthenticated)

| Route | Result | Verdict |
|---|---|---|
| GET /api/2touch/ingest | 405 | POST only; HMAC check not exercised (would write) |
| GET /api/agent/manifest | 200 | public by design |
| GET /api/clover/callback | 307 to /app/settings?tab=pos&error=clover_missing_params | refused |
| GET /api/cron/2touch | **200, ran the job** | defect 2 |
| GET /api/demo | 307 to /?demo=use-button | refused (POST only) |
| GET /api/email-replies | 405 | POST only, not POSTed |
| GET /api/payroll/nacha | 401 | refused |
| GET /api/poll-2touch | 405 | POST only, not POSTed |
| GET /api/v1/me | 401 | refused |
| GET /auth/callback | 307 | refused |

POST was used only on /api/demo, once. No POST to any route that sends email, SMS or money. Unauthenticated /app/dashboard returns 307 to /login?next=%2Fapp%2Fdashboard as intended.

## Could not reach

- Staff portal /me and /me/pending: the demo session is an owner with no staff profile, and the route sends it to /login. Needs a staff login (join code) that this run did not create. Not tested at either width.
- Payroll NACHA download, the "send"/"approve"/"pay" paths, W-2 generation output, and the Clover and POS connect flows: skipped on purpose (they write or call out).
- /api/2touch/ingest signature handling and /api/email-replies, /api/poll-2touch behaviour past the method check: would need a POST.
- Roles other than owner (manager, viewer): one demo session only, rate limit.

## Defects, most severe first

1. **Uncaught "Rendered more hooks than during the previous render." on every redirect-only page.** Routes: /app/analytics, /app/employees, /app/payroll/split, /app/sales/categories, /app/sales/margins, and /app/inventory/loss at 390px. The destination page still renders, so users see a working page, but the exception fires in the browser each time a bookmarked legacy URL is hit. Stack: `updateWorkInProgressHook` > `updateOptimistic` > `useOptimistic` > `useActionQueue` > `Router` (Next's own client router in `next/dist/client`, not app code). Suspected cause: Next 16.2.4 with React 19.2.4 in dev mode when a server `redirect()` is the whole page result; the page files are trivial (`redirect('/app/inventory/analytics')` at `app/(app)/app/analytics/page.tsx` lines 4-8, and the same shape in the other five). Not confirmed to happen in a production build. Reproduce: sign in, open /app/analytics with a pageerror listener, wait 2 seconds. Candidate fix to try later: move these redirects to `redirects()` in `next.config.ts` or to `proxy.ts` so no page renders.

2. **GET /api/cron/2touch runs the full job with no credentials when CRON_SECRET is unset.** Returned 200 with a JSON report (emails, demo purge, notifications for 6 orgs). `app/api/cron/2touch/route.ts` lines 20-22: `if (process.env.CRON_SECRET && auth !== ...)` fails open. AGENTS.md says CRON_SECRET is set on Vercel, so production is presumably gated, but any environment (preview deploys, a fresh clone) without it exposes a job that polls mail, deletes demo orgs and sends notifications. Note: this run triggered it once while probing (counts were zero: 0 emails processed, 0 users or orgs deleted, 0 notified). Reproduce: `curl localhost:3000/api/cron/2touch`. Fix idea: refuse when the secret is missing, except in `NODE_ENV=development`.

3. **Recharts "The width(-1) and height(-1) of chart should be greater than 0" warnings.** /app/books (4), /app/tips (2), /app/inventory/analytics (11), identical at both widths. A ResponsiveContainer renders before its parent has a size (usually inside a hidden or zero-height box on first paint). Already noted in 2026-11-24-dev-setup.md for the dashboard; it is app-wide. Charts do render. Suspected files: the chart components under `app/(app)/app/books/`, `.../tips/` and `.../inventory/analytics/`; give the wrapper a `min-w-0` and a fixed height, or set `minWidth={0}` on the container.

4. **Console info in dev: Vercel Analytics debug script blocked by CSP.** "Loading the script 'https://va.vercel-scripts.com/v1/script.debug.js' violates ... script-src 'self' 'unsafe-inline' 'unsafe-eval'". Seen on the landing page. Dev-only (the debug script is only requested in development), but the CSP in `next.config.ts` or `proxy.ts` would also need `https://va.vercel-scripts.com` if analytics is wanted in production; confirm on a preview.

5. **A signed-in owner who opens /me or /me/pending is sent to /login, not to their dashboard.** Redirect shows the login form to an authenticated user. Suspected: the staff layout treats "no staff profile" as "not signed in". Low impact (owners rarely open /me), but it reads as being logged out. Reproduce: sign in as the demo owner, open /me.

6. **/app/sales rewrites its own URL at 390px only.** Final URL is `/app/sales?start=2026-11-25&end=2026-11-25&hour=15`; at 1440 it stays `/app/sales`. A client-side default-range effect probably runs only on the mobile layout, which makes a shared link carry the sender's current hour. Needs a look at `app/(app)/app/sales/page.tsx` and its range control. Low severity.

7. **Dev-only noise to ignore when reading logs:** cron response included "Vapid private key should be 32 bytes long when decoded" for every demo org, so the dev VAPID keys in `.env.local` are malformed or placeholder. Push cannot work in dev until they are regenerated (`npx web-push generate-vapid-keys`). Not a code defect.

Observation, not a defect: other agents were editing files while the crawl ran (the dev log shows repeated Fast Refresh rebuilds), so any single-request result above could reflect a half-saved file; none produced an error.

## After fixes (partial re-run)

Defect status: 1 fixed (retired routes are now `redirects()` in `next.config.ts`; page files deleted). 2 fixed (cron fails closed unless `NODE_ENV=development`). 3 attempted (`initialDimension` on every ResponsiveContainer with 100% sizing). 4 left as is (dev-only, documented in `next.config.ts`). 5 fixed (signed-in non-employee goes to `/app`). 6 left: by design in `tonight-clock.tsx`, needs an owner decision. 7 config only.

Re-run: all 37 routes at 1440 and 390, signed OUT. `/api/demo` returned 429 (rate limit, about 29 minutes) and the first session's cookies had not been saved, so the signed-in pass could not be repeated. Results: every route loads 200 with no page exception, no console error or warning and zero horizontal overflow at both widths. The five retired routes redirect (307) to their destinations before reaching the proxy, so a signed-out visitor lands on `/login?next=<destination>`; `/app/payroll/split` and the sales redirects carry their query (`view=...`) onto the login URL, which is harmless. curl confirmed the redirects including `?date=` forwarding.

Not re-verified signed in: defect 1 on the destination pages, defect 3 (Recharts warnings on books, tips, inventory analytics) and defect 5. Re-run with a fresh demo session once the rate limit clears.
