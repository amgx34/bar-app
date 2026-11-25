# Journey inventory and UX audit procedure (2026-11-25)

Branch `rebuild/foundation`. Read-only run: no application code changed. Built from source (routes, `nav-config.ts`, `proxy.ts`, settings and staff pages), from PRODUCT.md, and from the earlier findings files. **No browser was driven in this run.** The demo cookie jar in the scratchpad was written at 16:13 today; I did not test whether it is still valid, so every state claim below is "from source" or "from an earlier finding" and is labelled that way. Anything marked UNVERIFIED needs a browser or the owner.

Labels: SRC = read in source this run. PRIOR = taken from a named earlier file. UNVERIFIED = not confirmed.

## 1. Every route

37 pages and 9 API routes at the time of `route-inventory.md`; five legacy pages were since replaced by `redirects()` in `next.config.ts` (smoke test, "After fixes"), so the live page files are the 31 below plus those redirects. API routes are not user journeys but are listed because they sit on a journey's path.

### Public and legal (first-time visitor)

| Route | Notes |
|---|---|
| `/` | Landing and demo button. Landing sections live in `app/_components/landing/` (demo-button, demo request form, mobile nav, sticky CTA). |
| `/pricing` | Public pricing. Linked from footer only (billing README). |
| `/accessibility`, `/privacy`, `/terms`, `/eula` | Legal pages via `legal-page.tsx`. |
| `/thank-you` | Landing after the demo request form (SRC: name only; confirm what posts to it, UNVERIFIED). |
| `not-found.tsx` | Global 404. There is **no `error.tsx` or `global-error.tsx` anywhere under `app/`** (SRC: file search). A thrown server action or render error therefore falls to Next's default error screen. |

### Auth

| Route | Notes |
|---|---|
| `/login` | Password form, "email me a login link", demo button. No create-account link (onboarding checklist section 0, SRC `login-form.tsx` has no signup). |
| `/join` | **Staff** sign-up with the bar's join code. Calls `supabase.auth.signUp`, files a pending claim, notifies managers. Never creates an org. |
| `/auth/callback` (API) | Magic link and OAuth return. |
| `/accept-terms` | Gate for terms acceptance; redirects to dashboard when already accepted (smoke test). |

### Setup (new owner)

| Route | Notes |
|---|---|
| `/setup` | Step 1 of 2, "Takes about a minute": creates org, owner membership, terms record. Requires a signed-in user. Renders to signed-out visitors and then fails with "Not authenticated" (PRIOR walk finding 21). |
| `/setup/pos` | Step 2 of 2, `pos-selector.tsx`. |
| `/setup/pos/clover` | Clover connect, in progress by another workflow. Out of scope here except as a journey stop. |
| `/api/clover/callback` | OAuth return, redirects to `/app/settings?tab=pos`. |
| `/app/no-access` | Shown to a signed-in user without a usable membership. Support link was a placeholder in walk finding 22; N1 changed it to `BUSINESS.email` (OVERNIGHT-LOG). |

### Owner and manager app (`/app/*`)

| Route | Notes |
|---|---|
| `/app/dashboard` | Home. Sync status strip, revenue chart, notification bell in the header. |
| `/app/sales` | `?view=tonight|day|week|month`, `start`, `end`, `hour`, `sort`. Night view, hourly curve, server table, menu quadrant, missing-data panel. |
| `/app/inventory` | Item list, adjust-stock dialog, add/edit item, categories, import, deactivate. |
| `/app/inventory/weigh` | Weigh reports, pour analysis, load analysis. |
| `/app/inventory/shipments` | Log shipment dialog (states idle, parsing, review, importing, done), void shipment, list. |
| `/app/inventory/setup` | Gaps panel (what blocks trustworthy numbers). |
| `/app/inventory/analytics` | Charts, deals panel. |
| `/app/payroll` | `?view=day|week|month`. Day split, week payout bar, cash tips card, employee days, adjust, payouts, "Pay remaining N" dialog. Open-run banner from the layout. |
| `/app/payroll/review` | Submit, diff against snapshot, approval panel, CSV, NACHA download. |
| `/app/payroll/employees` | Roster, setup dialog, pending staff claims, archive and delete. |
| `/app/payroll/direct-deposit` | Bank details, OTP by SMS. Owner decided: no direct deposit work now, free bank-file export stays. |
| `/app/tips` | Tabs `analytics`, `totals`, `flags`, `well` (via `?tab=`). Well settings dialog. |
| `/app/books` | Profit and loss, expenses panel, pure-profit band, charts. |
| `/app/tax` | Tax report, W-2 generator, 1099 form. |
| `/app/reps` | Rep list, order dialog (email and optional SMS), order history sheet, rep form. |
| `/app/settings` | `?tab=` general, tip-pay, inventory, import-data, pos, notifications, team, billing. Plain `<a>` links, so each tab is a full page load (SRC). |
| Legacy URLs | `/app/analytics`, `/app/employees`, `/app/payroll/split`, `/app/inventory/loss`, `/app/sales/categories`, `/app/sales/margins` now redirect (PRIOR smoke test). |

### Staff portal

| Route | Notes |
|---|---|
| `/me` | Own hours and pay. "This period" first, then approved periods. Empty state: "Nothing recorded yet." (SRC). |
| `/me/pending` | Waiting for manager approval after `/join`. |

### Billing (code exists, not live)

| Route | Notes |
|---|---|
| `POST /api/billing/checkout`, `/portal`, `/webhook` | Stripe-hosted Checkout and portal; webhook is server to server. Off unless `STRIPE_SECRET_KEY` is set; paywall off unless `BILLING_ENFORCE=true` (docs/billing/README.md). |
| `/app/settings?tab=billing` | The only in-app billing screen. |

### Other API routes on a journey path

`/api/2touch/ingest` (agent push), `/api/agent/manifest`, `/api/cron/2touch`, `/api/poll-2touch`, `/api/email-replies`, `/api/payroll/nacha` (the bank-file download), `/api/v1/me`, `/api/demo` (demo creation, rate limited, never POST in audits).

### Shell components that every journey crosses

Sidebar (desktop), bottom nav of Home, Inventory, Payroll, Books plus a "More" drawer (mobile), floating action button, breadcrumbs, section tabs, org switcher, notification bell, route-focus (moves focus on navigation), period toggle. All derive from `nav-config.ts`. The smoke test notes no page-level role gates exist (all gates are on actions), so every role sees every destination (navigation-validation.md).

## 2. Journeys, grouped by role

Principle numbers refer to PRODUCT.md: P1 one source of truth, P2 exact over impressive, P3 built for the floor (phone, one-handed, dim), P4 say what is missing, P5 roles gate actions not understanding. "Reviewed" says what earlier work exists.

Mobile is covered per journey in the "Mobile" line, not as a separate list, because PRODUCT.md says the primary tasks are phone tasks.

### J1. First-time visitor (not yet a customer)

- Steps: `/` (read, try demo or fill demo request) then `/pricing`, `/terms`, `/privacy`, `/accessibility` then either demo (`POST /api/demo`, lands in `/app/dashboard`) or `/thank-you` after the request form.
- First time vs repeat: first time only; a repeat visitor goes to `/login`.
- States. Loading: demo creation wait (UNVERIFIED how it looks). Error: demo rate limit returns 429 (smoke test saw it, about 29 minutes); how the button reports it is UNVERIFIED. Empty: n/a. Success: demo org opens. Missing: no "how do I become a customer" path other than the request form.
- Principles tested: P4 (claims register, no invented customers or prices), P3 (landing at 390).
- Reviewed: smoke test loaded all public pages, 200, no overflow at 390 (PRIOR). Copy was covered by `2026-11-25-gtm-review.md` (not re-read this run). No Impeccable critique of `/` or `/pricing`. **Not reviewed as a journey.**
- Mobile: landing has its own mobile nav and sticky CTA; never screenshot-reviewed for tap targets.

### J2. New owner sign-up and setup (highest risk, the user asked for this to be unblocked)

- Steps today: no public owner sign-up exists. Path (a) `/login` magic link, which only creates an account if the Supabase project allows new users (dashboard setting, UNVERIFIED); path (b) the founder creates the user in the Supabase dashboard; then `/login` then (no membership) redirect to `/setup` (step 1 of 2) then `/accept-terms` (UNVERIFIED order) then `/setup/pos` (step 2 of 2, choose POS: 2Touch, Clover, others) then for 2Touch the agent install on the bar PC (see onboarding checklist) then `/app/dashboard` with an empty sync strip, then `/app/inventory/setup` and `/app/settings` (tax, tips, bank, team).
- Also a trap: `/join` calls `signUp` for anyone holding a code, which suggests email sign-up is on; a stranger who signs up without a claim could land on `/setup` and create a bar (onboarding checklist section 0, UNVERIFIED).
- First time vs repeat: the repeat version is `/login` then dashboard. A second bar uses the org switcher; whether it has a "create another bar" route is UNVERIFIED.
- States. Empty: dashboard before any POS data; PRODUCT.md requires it to say what to connect. Loading: `/setup` submit. Error: `/setup` when signed out gives a toast "Not authenticated" and a 500 (PRIOR walk 21); server actions that throw show raw or masked messages (walk 16, 18). Missing: no way to see "what is left to finish setup" in one place; no defined "activation" screen even though strategy defines activation as first Z report synced plus first pay run approved (onboarding checklist).
- Principles: P4 (empty dashboard), P3 (setup done at a desk or on a phone?), P2 (tax and routing inputs; routing validation was added by the P1 fix, SRC OVERNIGHT-LOG "P1 fixes").
- Reviewed: `/setup`, `/setup/pos`, `/setup/pos/clover` loaded in the smoke test and walked at both widths (route-inventory). No Impeccable critique. **The sign-up path as a journey has never been reviewed**, and the Clover and Toast steps are changing right now.
- Mobile: setup forms use number inputs with `step=0.25`; untested on a phone keyboard.

### J3. Daily owner (open the app, check last night)

- Steps: `/app/dashboard` (sync strip, last night) then `/app/sales?view=tonight` or `day` then drill to `/app/tips` or `/app/books` by link then notification bell.
- First time vs repeat: first time has no POS data; repeat opens straight to the dashboard from a bookmark.
- States. Loading: `loading.tsx` exists for dashboard, sales. Empty: sales shows `$0.00 / 0 items / Never sold` for no-data periods (critique issue 1, PRIOR). Error: no `error.tsx`. Missing: "no sales" versus "agent not syncing" has `no-data` health status (AGENTS.md), UI wording UNVERIFIED. `/app/sales` default night disagrees with Tonight tab by one date (walk 20); at 390 the URL rewrites itself with the visitor's current hour (smoke defect 6, left for owner).
- Principles: P1, P4, P3.
- Reviewed: dashboard redesigned over four rounds and scored 28 (best 31) (critique summary). Sales critiqued twice, average 24.5. Sync strip not separately reviewed.
- Mobile: bottom nav and floating action button; the primary phone landing.

### J4. Manager running the close (after the night)

- Steps: `/app/sales` (confirm the night reconciled) then `/app/payroll?view=day` (day split, opener, tips) then cash tips card (manual count freezes the figure) then `/app/tips?tab=flags` (anything flagged) then mark day complete (UNVERIFIED which control).
- Repeat: nightly; the first time involves setting tip rules in Settings, Tip & Pay.
- States. Missing: "not-yet-closed night" is a principle-4 case; no single "close checklist" screen. Error: day-hours dialog and add-to-shift dialog validation (UNVERIFIED). Success: toasts. Tips over-allocation warning added in N9, not seen in browser because the demo has none (OVERNIGHT-LOG).
- Principles: P2 (tips exact to the cent), P1 (Z tips match payroll tips), P5 (a manager cannot approve but sees why).
- Reviewed: Payroll pay period scored 26 (week and day). Tips page not critiqued. Walk found the tips double count, since fixed (P1 fixes, OVERNIGHT-LOG); real-data checks still waiting on the owner (decisions.md).
- Mobile: day rows overlap and the Opener switch renders as a large circle at 390 (critique issue 3, PRIOR). This is the worst phone defect on a daily journey.

### J5. Payroll run, submit to approved to paid (highest money risk)

- Steps: `/app/payroll?view=week` (review period, hours, adjustments, advances) then "Run payroll" to `/app/payroll/review` (submit, snapshot frozen) then open-run banner appears in the payroll layout for owner or manager, owner sees "Approve" then `/app/payroll/review` diff vs snapshot (accept changes replaces snapshot) then Approve (owner only) then NACHA download (`/api/payroll/nacha`, gated on approved run, override writes a reason) then back to `/app/payroll` payout bar: pay one, or "Pay remaining N" dialog, undo a payout.
- Repeat: weekly or per period; first time includes tax setup (`tax-setup-panel`) and employee setup.
- States. Loading: `payroll/loading.tsx`, `review/loading.tsx`. Empty: no employees, no hours (UNVERIFIED wording). Error: validation thrown as 500 from server actions (walk 16). Success: approved panel; critique found no approver, date or approved total shown, and Approve is one click with no summary of the amount. Missing: P0 from critique, a local-only "Confirm Payroll" button beside the real approval; diff runs only while pending so a post-approval change is invisible while the ACH export stays unlocked (critique summary). Undo on a recorded payout is immediate with no confirmation (walk 29). "Mark paid" offered on a $0.00 row (walk 30). Sub-cent residue splits the payout summary from the bulk planner (walk 1, fixed in "payout tolerance").
- Principles: P2, P5, P1.
- Reviewed: Payroll Review twice, 21.5 average, lowest of the six, 2 P0. Payroll pay period 26. Neither the full submit-to-paid chain nor the manager-sees-why-it-is-waiting (P5) view was walked as one journey with a populated pending run (demo had an already-approved run, critique summary).
- Mobile: Payroll is a primary bottom-nav tab. Day rows collide (J4).

### J6. Inventory count

- Steps: `/app/inventory` (find item, search) then adjust-stock dialog (count mode) or `/app/inventory/weigh` (bottle weigh reports) then variance shows in analytics then `/app/inventory/setup` for gaps.
- Repeat: weekly count; first time is item import (`inventory-import-dialog`, Settings, Import Data) and par and pour setup.
- States. Empty: search with no match says "No items yet, create your first item" and reports $0.00 stock (critique issue 1). Error: adjust below zero is refused as an unhandled 500 with no message (walk 7); weigh levels outside 0 to 1 give a 500 with no message (walk 8). Missing: Low and In Stock chips write `?stock=` the page never reads (critique P1). Weigh header says "No items" until reload after adding a bottle (walk 27).
- Principles: P3 (counting is a phone job in a dark stockroom), P2, P4.
- Reviewed: Inventory twice, 22.5 average. Weigh and Setup walked (`walk-stock.md`) but not Impeccable-critiqued. Analytics not critiqued.
- Mobile: Inventory's list starts 1,100 to 1,400px down beneath four cards; adjust dialog has clipped mode tabs (critique).

### J7. Delivery logging

- Steps: `/app/inventory/shipments` then "Log a shipment" dialog: paste or upload invoice, AI parse (Groq), review lines (match to items, new item flag, freight and tax allocation), post, then check the list and the Items page "Latest shipment" card, void if wrong.
- Repeat: every delivery. First time needs items to exist.
- States. Loading: "parsing" and "importing" states exist (SRC dialog states). Error: parse failure wording UNVERIFIED. Success: dialog stays open reset to the paste step after posting, easy to double post (walk 23). Missing: Items page "Latest shipment" built from usage_logs by date not shipment id (walk 9, breaks the AGENTS.md key rule); strict name match labels "Tito 750ml" NEW ITEM (walk 26). Voided row keeps a bold total (critique).
- Principles: P2 (cost recorded not inferred), P1.
- Reviewed: Shipments twice, 24.5. The dialog's review step with real AI output has not been populated in a review; line table is wider than the dialog at both widths (walk 11).
- Mobile: Total, Invoice total and Void clipped; 64px inputs (critique issue 3). A delivery is logged on the dock, on a phone.

### J8. Rep ordering

- Steps: `/app/reps` then pick or add rep (rep form dialog) then Order dialog (items, email on by default if rep has email, optional SMS) then sent confirmation then order history sheet. Floating action button and the low stock notification may deep link here (UNVERIFIED).
- Repeat: weekly. First time: add reps and link items.
- States. Error: an order saves even if email fails, and the toast says "Check GMAIL_APP_PASSWORD in settings" (SRC `order-dialog.tsx` line 82), which is a developer instruction shown to a bar owner. No such setting exists in the UI (UNVERIFIED). Missing: reply handling via `/api/email-replies` has no visible journey stop (UNVERIFIED).
- Principles: P3, P4.
- Reviewed: walked (`walk-rest.md`) only. No critique. **Never Impeccable-reviewed.**
- Mobile: dialog is `max-h-[90vh]` with sm:max-w-2xl; untested with the keyboard open.

### J9. Staff member (portal, tips, shifts)

- Steps: owner gives join code, staff opens `/join` (name, email, password, code) then `/me/pending` (waiting) then manager approves in `/app/payroll/employees` (pending claims) or bell notification then `/me` (this period hours, approved periods, tip pool context) .
- Repeat: `/login` then `/me`. Staff see only their own data (PRODUCT.md).
- States. Empty: "Nothing recorded yet. Once you have worked a shift it will show up here." (SRC). Pending: page exists, content UNVERIFIED. Error: wrong code gives "That code was not recognised." (SRC `join/actions.ts`), deliberately the same message for staff sign-up being off. Missing: how a staff member learns they were approved (no email confirmed, UNVERIFIED); no shift schedule view, `/me` shows hours worked, not upcoming shifts, so "shifts" is hours history only (SRC, `getMyPeriods`).
- Principles: P3 (read on a phone in a stockroom), P5, P2.
- Reviewed: **never rendered signed in.** Smoke test and walk could only see the redirect to `/login` (PRIOR). The N-series fix made a signed-in non-employee go to `/app`. Zero visual or accessibility review.
- Mobile: designed mobile first (SRC comment); unverified.

### J10. Accountant

- Steps: invitation by owner (Settings, Team, temporary password via `auth.admin.createUser`, owner only) then `/login` then `/app/books`, `/app/tax`, `/app/payroll` read, W-2 and 1099 generation.
- States. Missing: `permissions.tsx` says accountant is deliberately excluded from several actions, and the nav shows every destination to every role (navigation-validation.md, "OWNER TO CONFIRM"). Whether an accountant sees buttons that then refuse is UNVERIFIED. No accountant-specific landing.
- Principles: P5, P2.
- Reviewed: Books critiqued (22.0), Tax walked. The role itself never walked (smoke test, "Could not reach": roles other than owner).
- Mobile: low priority, desk work.

### J11. Billing and cancelling (not live)

- Steps: `/pricing` then Settings, Billing tab then Checkout (Stripe hosted) then return, tab shows Active then portal to change or cancel. Past due keeps working 7 days then blocks only if `BILLING_ENFORCE=true`.
- States. Billing off: tab says billing is off (docs). Migration not applied: reads return no row. Paywall screen when blocked: UNVERIFIED it exists as a designed page; the code is in `app/(app)/app/layout.tsx`. Cancel is only in the Stripe portal, not in Rail, so there is no in-app cancel confirmation.
- Principles: P4 (what happens to my data), P5 (a manager sees why access stopped but cannot fix it).
- Reviewed: **never reviewed.** Not live, so lowest urgency, but it must exist before the first paying bar. Pricing is a hypothesis ($99, $199 are not validated, billing README).
- Mobile: Stripe pages are Stripe's.

### J12. Support and error recovery

- Steps: something goes wrong (blank sync, wrong figure, locked out) then where does the user go: `/app/no-access` support mailto, notification bell, sync status strip, 404 page, no help or contact in the app shell (UNVERIFIED), forgot password (`/login` has magic link as the recovery path), deleted or wrong data recovery (void shipment, undo payout, archive employee).
- States. Error: no `error.tsx` or `global-error.tsx` (SRC). Server actions throw, so users get a toast in dev and a masked 500 in production (walk 16 and 18). Zod errors showed raw JSON in the expense form (walk 18). Missing: offline or stale data warning on a phone; session expiry mid-form (UNVERIFIED).
- Principles: P4, P2 (a recovery path for money records).
- Reviewed: static pass only. **Never reviewed as a journey.** This is the cross-cutting gap.
- Mobile: errors on a phone with a poor bar wifi connection are the realistic case; untested.

### J13. Connect and monitor the POS (Clover, Toast, 2Touch)

- Steps: `/setup/pos` or Settings, POS Integration, install agent or OAuth, then dashboard sync strip shows green, amber `no-data`, or stale, then fix.
- States: the sync-health design is described in AGENTS.md. Clover and Toast screens are changing under another workflow, so audit this journey only after they land.
- Reviewed: sync strip not critiqued; POS panel walked at settings level. **Defer until the other workflow merges.**

### J14. Notifications and settings upkeep (daily owner, minor)

- Steps: bell then item; Settings tabs General (org name, routing, EIN), Tip & Pay, Inventory (pour sizes), Import Data, POS, Notifications (push opt-in, per-event prefs), Team (invite, roles, staff join code).
- States: eight tabs as plain links, full reload per tab; tab strip scrolls horizontally on phone with the scrollbar hidden, so tabs after "Import Data" may not be discoverable (SRC `overflow-x-auto` plus hidden scrollbar). Push needs three VAPID env vars or silently does nothing (AGENTS.md). Placeholders look like saved values (walk 19).
- Reviewed: walked (`walk-rest.md`); not critiqued.

## 3. What has and has not been reviewed

| Journey | Impeccable critique (2 reviewers) | Smoke test | Walk (`walk-*.md`) | Verdict |
|---|---|---|---|---|
| J1 Visitor | none | pages load | landing walked | not reviewed as a journey |
| J2 Sign-up and setup | none | `/setup*` loads when signed in | walked | never reviewed; highest gap |
| J3 Daily owner | dashboard (28, earlier rounds), sales (24.5) | yes | yes | partly |
| J4 Close | payroll day (26) | yes | yes | partly, tips page not critiqued |
| J5 Payroll run | review (21.5), payroll (26) | yes, write paths skipped | yes | reviewed on a thin demo; pending-run state never seen |
| J6 Count | inventory (22.5) | yes | yes | partly; weigh, setup, analytics not critiqued |
| J7 Delivery | shipments (24.5) | yes | yes | dialog review step with real data not seen |
| J8 Reps | none | yes | yes | never critiqued |
| J9 Staff | none | redirect only | redirect only | never rendered |
| J10 Accountant | books only | owner only | owner only | role never walked |
| J11 Billing | none | no | no | never reviewed |
| J12 Support and errors | none | no error states provoked | some | never reviewed |
| J13 POS connect | none | `/setup/pos` loads | partial | blocked, other workflow |
| J14 Settings | none | loads | yes | not critiqued |

Critique files exist only for six screens: books, inventory, shipments, payroll, payroll review, sales (`critique/`). Everything else is untouched by a design critique. The critique itself warns its reviewers worked on a thin demo org, so populated, pending and error states were judged from source.

## 4. Journeys ordered by risk

Risk = chance a first customer is lost or money is wrong, times how little has been reviewed.

1. J2 New owner sign-up and setup. No public owner path, a possible stray-org path, nothing reviewed, and the first thing every customer touches.
2. J5 Payroll run to paid. Money, two P0s on record, pending run never seen populated.
3. J12 Support and error recovery. No error boundary, raw errors on money forms.
4. J9 Staff portal. Never rendered signed in; each staff member is a user.
5. J7 Delivery logging. Money and stock, AI parsing, phone on the dock, clipped totals.
6. J4 Manager close. Daily, phone layout collisions, tips exactness.
7. J6 Inventory count. Phone in the dark, silent 500s on bad input.
8. J3 Daily owner. Best reviewed, but zero versus missing data still shown as fact.
9. J13 POS connect. Highest value, but blocked until Clover and Toast land.
10. J8 Rep ordering. Never critiqued; developer wording in an error toast.
11. J10 Accountant. Role untested.
12. J14 Settings upkeep. Hidden tab overflow, placeholder confusion.
13. J1 Visitor. Matters for sales, not for retention; GTM review covered copy.
14. J11 Billing. Not live.

## 5. Repeatable audit procedure (one journey)

Run per journey, in the order of section 4. Budget is a HYPOTHESIS: about two hours of agent time per journey.

### Setup

1. Pick the journey; write its steps from section 2 as a numbered list of routes. Do not skip a state: for each step name the empty, loading, error and success state and how to force it (demo org, a throwaway org, a signed-out window, devtools offline). Never POST `/api/demo` more than once per window; reuse the cookie jar and note if it has expired.
2. Use a throwaway or demo org only. Skip anything that sends email, SMS or money; judge those from source and say so.
3. Create the evidence folder `docs/superpowers/findings/journeys/<id>/` (screenshots go there, not in git unless small).

### Screenshots

For every step, full page, 8 images: 390x844 and 1440x900, each in light and dark (`prefers-color-scheme` emulation, and the `data-theme` attribute if the app uses it), for the first-time and the repeat version where they differ. Add one image per state that exists (empty, loading via throttled network, error, success). Open every dialog and sheet on the path and capture it at 390 with the on-screen keyboard height simulated for any text input (viewport height cut to about 400).

### Impeccable critique, two isolated reviewers

- Reviewer A and reviewer B each get PRODUCT.md, DESIGN.md, the screenshots and the step list, and nothing else. They must not see each other's output or any detector output (same rule as `critique/summary.md`).
- Each scores the ten heuristics out of 4 for a total out of 40 and lists P0, P1, P2, P3 items with route and evidence.
- If scores differ by more than 3 points, run a third reviewer. Report the average and the spread. Do not read differences under about 3 points as real.
- A separate measurement agent runs afterwards: the Impeccable detector, console, CLS, contrast, tab order (below), and writes `measured-evidence.md`.

### Detector run

Run the Impeccable detector over the files the journey touches and record counts by rule. Advisory findings (side-tab, off-ramp text sizes, off-palette colours) are P2 unless they hide content.

### Accessibility checks (WCAG 2.2 AA)

- Keyboard: complete the whole journey with Tab, Shift+Tab, Enter, Space, Escape only. Fail if any step needs a mouse, a dialog traps focus without Escape, or a dialog does not return focus to its trigger.
- Focus: visible ring on every stop (the earlier run checked 12 stops; check all on this journey). After a client navigation, focus lands on the new page (`route-focus.tsx`).
- Labels: every input, select, switch and icon button has an accessible name. Known misses to recheck: Z-report textareas, day date input, inventory search (critique issue 9).
- Contrast: measure text against its real background in both themes: 4.5:1 body, 3:1 large text and UI parts. Known weak spots: muted text, amber warning text, Voided and COGS labels. `npm run audit:tokens` covers tokens only; it exits 1 today for `border-strong` and `input` at 2.997:1.
- Target size: at 390 every tap target at least 24x24 CSS px (WCAG 2.2 AA minimum) and, for floor use, a goal of 44x44 for primary actions (P3). List anything smaller.
- Error handling and recovery: submit each form empty, with bad input, and with the network offline. Pass only if the message names the field and the fix, appears next to the field, is announced (live region or focus), keeps what the user typed, and no raw JSON, stack, or developer text appears. For every money record, name the undo or correction path (void, undo, edit) and whether it asks for confirmation.
- Structure: one `<main>`, one `<h1>`, no skipped heading levels, tables have headers, charts have a text alternative.
- Console: no errors; note warnings.

### Rubric

Score each of the 10 heuristics 0 to 4 per Impeccable's scale, then total out of 40 (bands as in the critique summary: 28 to 40 good, 20 to 27 acceptable with significant improvements, under 20 poor).

Journey passes only if all four hold:

1. Total at least 28 (average of the two reviewers).
2. Zero open P0 and every P1 has an owner and a decision (fix, defer with reason, or accept).
3. No accessibility fail in: keyboard completion, labels on every money input, error recovery on every money form, 390px with no page-level horizontal scroll.
4. Each PRODUCT.md principle the journey tests has a named pass or fail line in the report.

Severity: P0 = wrong or unrecoverable money, tips, stock, tenancy, or a journey that cannot be completed. P1 = completes but a first customer would stop, misread a figure, or lose data silently. P2 = friction or inconsistency. P3 = polish.

### Output per journey

One file `docs/superpowers/findings/journeys/<id>-<name>.md` with: step table, state matrix, score A, score B, average, spread, P0 and P1 list (route, evidence, suspected cause, whether it touches money, tips, stock or tenancy, which principle), accessibility results, and pass or fail. Money-related findings stop for the owner before and after any fix (AGENTS.md and OVERNIGHT-LOG).

## 6. Sign-up unblocking: findings to feed J2

Read-only here, so no change made. What the audit of J2 should resolve first:

1. Decide the owner entry path. Options in the code today: founder-created user (works now), magic link if the Supabase project allows sign-up, or a new public owner sign-up route (does not exist). The choice also decides whether strangers with a `/join` code can reach `/setup`.
2. `/setup` renders to signed-out visitors and fails on submit (walk 21); `proxy.ts` gates only `/app` and `/me`.
3. Add a visible "what is left" state after setup: POS connected, first Z report seen, tax settings, first employee, first pay run (the activation definition in strategy).
4. No `error.tsx` means a failed `createOrgWithSettings` has no designed recovery.

## 7. Not checked in this run

No browser session, no signed-in render, no role other than owner, nothing on a phone. Claims about wording on screens are from source or earlier findings and are marked. Clover and Toast screens are in flux and were not read.
