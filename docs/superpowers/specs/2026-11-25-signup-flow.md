# Sign-up flow: from landing page to a bar with data

Date: 2026-11-25. Branch `rebuild/foundation`. Status: design only. Nothing in `app/`, `lib/`, `components/`, `supabase/` or `scripts/` was changed. The Clover and Toast work is in the same tree, so every file below that it might touch is marked COLLISION.

Labels: UNVERIFIED means not confirmed from code or a live call. HYPOTHESIS means a belief nobody has measured. OWNER means only the owner can decide or do it.

## 0. The short version

1. A new owner cannot create an account from the product. The landing page links only to `/login` (`app/page.tsx` line 239, the footer, `mobile-nav.tsx`) and the demo button. `/login` has no "create account" link. `/join` is staff only. `/setup` needs a signed-in user.
2. The only way a stranger becomes an owner today is the magic link, because `signInWithOtp` defaults to `shouldCreateUser: true`. That is an unplanned public sign-up with no terms step, no bot check beyond the login rate limit, and no cap on what the new user can then create.
3. The Supabase project that `.env.local` points to has open sign-ups. Verified today with a read-only GET to `/auth/v1/settings` using the public anon key: `disable_signup: false`, `mailer_autoconfirm: false` (email confirmation is required), Google and every other OAuth provider off, email on. UNVERIFIED which project that is (dev or live). The owner must read the live project's own setting (section 9, step 1).
4. Anyone can also call Supabase's sign-up endpoint directly with the public anon key, skipping our server actions, our rate limits and any bot check we add. So the real gates must sit where a user acts on our data: creating an organization. Today `createOrgWithSettings` has no such gate: no verified-email check, no limit on how many orgs one person creates, no rate limit.
5. Recommended build: `/signup` (email and password, verified by a link that works in any browser), then `/setup` cut to three questions, then a data-derived checklist on the dashboard, a 30-night trial clock that starts at the first live Z report, and a demo banner that carries a visitor's choices into a real account. Google sign-in is cheap in code but not cheap to set up; defer it.
6. Honest limit: a self-serve account does not give a 2Touch bar data. The agent is a Windows install on the POS PC that needs an administrator and, per `onboarding-checklist.md`, the founder in person for the first ten. Sign-up removes the "founder creates the user in the Supabase dashboard" step. It does not remove the install.

## 1. The path today, step by step

| # | Step | Route or code | What it does | What is missing or fails |
|---|---|---|---|---|
| 1 | Owner reads landing page | `app/page.tsx`, `app/_components/landing/*` | Marketing. CTAs are "Sign in" and "Try Demo Account" (`DemoButton`, POST `/api/demo`). | No "Start" or "Create account" CTA. The front page claims a Toast integration and some figures that `claims-register.md` says to review. |
| 2 | Clicks Sign in | `app/(auth)/login/page.tsx`, `login-form.tsx`, `actions.ts` | Password sign-in (`signInWithPassword`, rate limited 10 per 15 minutes by IP and by address) or magic link (`sendMagicLink`, same limit). Both return one generic message. | No link to sign up. A brand new owner has no account, so the password form fails with "not recognised". The magic link says "If that email has an account", which is wrong for a new person and gives no hint they should look in their email. |
| 3 | Magic link email | Supabase sends it. Redirect is `${origin}/auth/callback?next=...` | Creates the account if sign-ups are open (they are on the project checked today). | Email wording and sender are Supabase defaults (UNVERIFIED on live). Built-in Supabase mail has a low hourly cap (UNVERIFIED current figure). PKCE: the link only works in the browser that asked for it. |
| 4 | Link click | `app/auth/callback/route.ts` | `exchangeCodeForSession(code)`. No memberships: redirect `/setup`. Else redirect `next`. | (a) Wrong browser or a link opened from a phone mail app: no PKCE verifier, so it redirects to `/login?error=auth_callback_failed`. (b) `login-form.tsx` never reads `?error=`, so the person sees a blank login form and no reason. (c) `next` is not validated: `${origin}${next}` with `next=@evil.example` becomes `https://our-host@evil.example`, an open redirect on an email link. (d) A `token_hash` style link (the cross-browser kind) is not handled at all. |
| 5 | `/setup` | `app/(app)/setup/page.tsx` (client component), `actions.ts` | One long form: name, type, state, city, tip pool split, barback allocation, six hourly rates, pour size, terms checkbox. Calls `createOrgWithSettings`. | `/setup` is not gated by `proxy.ts` (it only gates `/app` and `/me`), so a signed-out visitor sees the form, fills it, and only then gets a toast saying "Not authenticated". An owner who already has a bar can open it and create another (the smoke test notes `/setup` is reachable by an owner with an org). Step count says "1 of 2"; the claim "Takes about a minute" is the page's own and unmeasured. |
| 6 | `createOrgWithSettings` | `app/(app)/setup/actions.ts` | Checks a session and the terms box. Inserts `organizations` (slug = name + 5 random characters, `pos_provider: null`, `bar_settings` inline), inserts the owner `memberships` row, calls `recordTermsAcceptance`, seeds 7 inventory categories and 2 placeholder reps. Uses the admin client, so RLS does not apply. | No email-verified check. No per-user or per-IP limit, so one login can make unlimited orgs. Not idempotent: two tabs or a retry after a slow response make two bars. Not atomic: if the membership insert fails the org stays, orphaned. No timezone anywhere in the form or `BarSettings` (only Clover keeps `pos_config.timezone`). The two seeded reps are placeholders ("Your Spirits Rep") that read as data in a real bar. Money defaults (15 percent tip split, $15 an hour) are pre-filled, so an owner who skims submits numbers they never chose, and they feed payroll. |
| 7 | `/setup/pos` | `app/(app)/setup/pos/page.tsx`, `_components/pos-selector.tsx`, `actions.ts` | Three cards. `selectPOSProvider` sets `organizations.pos_provider`. Clover goes to `/setup/pos/clover`; others go to `/app/dashboard`. | The 2Touch card says "No setup required" and "Ready to use right now". False for the agent path: no `agent_token` exists until the owner opens Settings, POS and saves (`settings/actions.ts` line 242), and the pairing code appears only there. The Toast card says "Available now" and "Manual import workflow"; check against `claims-register.md` and the Toast adapter now being built. Choosing a POS is permanent from this screen (the page redirects to the dashboard once set); changing it later is a Settings job. COLLISION: the other workflow is editing `lib/pos/providers/*` and the Clover and Toast setup. |
| 8 | First `/app` render | `app/(app)/app/layout.tsx` | `getCurrentOrg()`, then the terms gate (`hasAcceptedCurrentTerms`, fails open), then billing (`getOrgAccess`, off unless `BILLING_ENFORCE=true`). | Terms are already recorded at step 6, so the gate passes. No welcome state. |
| 9 | Dashboard | `app/(app)/app/dashboard/page.tsx` | Heavy page built for a bar with data. | No setup checklist exists anywhere (searched `app/` and `components/` for checklist and getting started: nothing for onboarding). An empty bar sees empty charts. The sync strip says "no-data" or amber, which is correct but is not guidance. |
| 10 | First data | `POST /api/2touch/ingest` (agent), manual Z import (POS selector says "Z report import (text and CSV)"), Clover sync, or cron email fallback | `applyNormalized` writes `z_report_days`, `usage_logs`, and so on. | Nothing starts a trial clock, records "first night arrived", or tells the owner. |
| 11 | Demo path | `POST /api/demo` | Creates an `@rail.demo` auth user (confirmed, random password), three seeded orgs with `demo-tipsy-tavern-*` slugs, records terms, signs in. 3 per hour per IP, 750 live orgs cap, 24 hour TTL purge. | No way out. Nothing in the app says "this is sample data" or offers "make this my bar". When the 24 hours pass the user and orgs are deleted and the visitor lands on the login screen with no explanation. `lib/demo/expired.ts` exists; UNVERIFIED how it is surfaced to the person. |
| 12 | Billing | `/pricing`, `/api/billing/*`, `lib/billing/*` | Stripe Checkout code, `trialing` handled in `accessFor`. Not live. Migration `20261125000100_org_billing.sql` not applied. | No trial concept tied to the first Z report. `/pricing` sends people to `/login` ("Sign in to subscribe"), which cannot create an account. |

### Every dead end, in one list

1. Landing to login to nothing (no create-account path).
2. Magic link for a new email works only by accident, with copy that implies an existing account.
3. Link opened in another browser or on a phone: silent failure to a login form with no message.
4. Expired or already-used link: same silent failure.
5. `/setup` open to signed-out visitors; error only after filling the form.
6. Signed-in owner can create unlimited extra bars from `/setup`.
7. Double submit makes two bars; a failed membership insert strands an org.
8. 2Touch "No setup required" then an empty dashboard with no pairing code in sight.
9. Demo user has no way to keep anything; demo expiry is silent.
10. `/pricing` "Sign in to subscribe" for someone with no account.
11. Open redirect in `/auth/callback?next=`; `login-form.tsx` pushes `next` to the client router unvalidated (relative values only matter, but `//host` is worth refusing). `accept-terms/actions.ts` already has the right check (starts with `/`, not `//`); it is duplicated, not shared.
12. Staff `/join` is a second public `signUp` path; it keeps working, but turning email confirmation on or off changes it (see section 5).

## 2. Supabase auth assumptions in the code

| Question | What the code assumes | Verified |
|---|---|---|
| Email confirmation | Nothing explicit. Demo and team creation use `admin.createUser({ email_confirm: true })`, so they skip it. Staff `/join` and magic link go through the normal path. | Project checked today: confirmation required (`mailer_autoconfirm: false`). Local `supabase/config.toml` says `enable_confirmations = false` (local dev only, not authoritative). |
| Open sign-ups | `/join` calls `signUp` and the onboarding checklist already suspected it. `sendMagicLink` creates users. | Open on the project checked today. Live: OWNER. |
| Who may create an organization | Any signed-in user. `createOrgWithSettings` uses the service-role client, so it does not depend on RLS for `organizations` or `memberships` inserts. There is no policy or code stopping a second org. | Code read. RLS for those two tables is outside this repo (AGENTS.md: base tables were created elsewhere), so I did not verify what a signed-in user could insert directly with the anon key. OWNER or a follow-up: run the policy list from the dashboard SQL editor on the live project. |
| Default settings for a new org | None in the database. Defaults are written by the action: `bar_settings` keys, 7 categories, 2 placeholder reps. Everything else (tax rate, pay frequency, hours cutoff, notification preferences) is absent on purpose; AGENTS.md says a missing notification row means "use the role default". | Code read. |
| What stops unlimited orgs | Nothing. | Code read. |
| Terms | Recorded once per user and version in `terms_acceptances` (`lib/terms.ts`), at `/setup` submit (checkbox required, enforced server side), at demo creation, and by the `/accept-terms` gate for teammates. | Code read. |
| Rate limits | Postgres counters via `rate_limit_hit` RPC, fail open. Limits exist for demo (3 per hour), contact, login (10 per 15 minutes), AI parse. None for sign-up or org creation. | Code read. |
| Bot protection | None. `botid` is not in `package.json`. Supabase captcha is not configured. | Code read. |

## 3. Design decisions made here (reasons)

1. **Account first, then bar.** Email and password on `/signup`, verify by link, then `/setup`. It matches what `getCurrentOrg` already does (no membership goes to `/setup`) so almost nothing in the app changes.
2. **Verification link must work in any browser.** Use the `token_hash` plus `verifyOtp` pattern in a new `/auth/confirm` route, with the Supabase email templates changed to point at it. PKCE links break when a bar owner opens email on their phone after typing on a laptop, which is the normal case. `/auth/callback` stays for password-reset and any future OAuth.
3. **Magic link stays on `/login` but must not create accounts.** Pass `shouldCreateUser: false`. Sign-up is explicit. The generic "if that email has an account" answer then becomes true.
4. **Google: defer.** Code is about 15 lines (`signInWithOAuth`, the callback already exchanges codes), but it needs a Google Cloud project, a consent screen with a verified domain and the privacy and terms URLs, and a person who owns that project. With no legal entity yet, that account would be a personal one. Revisit at the first request. If the owner wants it anyway: the button goes on `/signup` and `/login` only when `NEXT_PUBLIC_GOOGLE_AUTH=true`.
5. **Terms: keep the existing checkbox at the create-bar step.** That is the moment a business relationship starts and the code already records and enforces it. `/signup` shows the sentence "You will agree to the Terms when you create your bar" with links, no second checkbox. Fewer records, no new failure mode.
6. **The real gates are at org creation, not at sign-up** (because sign-up can be called directly): verified email required, one owned non-demo bar per user for now, per-IP limit, idempotent and cleaned up on failure.
7. **BotID on our own entry points** (sign-up action, create-bar action, demo route) as a first filter; it does not protect the direct Supabase endpoint, which is why item 6 matters more. Supabase's own captcha would cover the direct endpoint but then every auth call (login, magic link, join, resend) needs a token and the form needs a widget: not recommended now.
8. **Demo conversion carries settings, not seeded data.** The demo bars are fictional (Chicago, fake employees, fake sales). Copying that into a real bar would contaminate payroll and the books. A visitor's choices (tip split, barback share, hourly rates, pour size, sales tax rate, overtime settings, POS pick) are what they would otherwise retype. Mechanism: pass them in the sign-up call as user metadata (`options.data`), which travels with the account through the email link, so it survives the wrong-browser case a cookie would not. The server validates it with a schema because user metadata is user-writable; it only ever supplies defaults.
9. **Trial: app-side clock, no card.** Details in section 8. Stripe's own trial starts when the owner starts Checkout; it cannot start at the first Z report. So Rail keeps the clock and only sends the owner to Checkout when they choose to pay, passing the remaining days as the Stripe trial end.
10. **Checklist is derived from data, not stored.** Four items computed from counts, so it can never disagree with reality and needs no table.

## 4. Screens

Voice follows `PRODUCT.md` and `DESIGN.md` (read them before writing final copy; the copy below is an outline, not final). Plain language, no em dashes, no promises about time until section 14 of the onboarding checklist has real figures.

### 4.1 `/signup` (new, `app/(auth)/signup/`)

- Heading (visually hidden h1 "Create your Rail account", visible card title "Create your account"). Subcopy: "Payroll, tips and stock for your bar. The first 30 nights of data are free." Only say "free" once the owner approves the claim (OWNER decision 5).
- Fields: Email, Password (show/hide, hint "At least 10 characters"), a honeypot hidden field. Button "Create account". Under it: "You will agree to our Terms and Privacy Policy when you create your bar." Link "Already have an account? Log in". Link "Just looking? Try the demo".
- When `?from=demo` and the visitor is a demo user: a line above the form, "We will carry over the tip, pay and pour settings you chose in the demo. Sample sales and staff are not copied."
- Loading: button shows "Creating account..." and is disabled.
- Errors (inline `FormStatus`, not only a toast, same reason as the login form): weak password ("Use at least 10 characters"), invalid email, throttled ("Too many attempts. Try again in N minutes."), bot suspected ("We could not verify this request. Try again, or email us."), network. Never reveal whether the address is registered.
- Already registered: show the same "Check your email" screen. Supabase returns a fake user for a confirmed address and sends nothing (UNVERIFIED current behavior; test it). The screen therefore always includes "Already have an account? Log in" and "Forgot password?".
- Signed in as a real user: redirect to `/app/dashboard`. Signed in as a demo user: allow.

### 4.2 Check your email (state of `/signup`, component `check-email.tsx`)

- "Check your email. We sent a link to a@b.com. Open it on this device or any other." "It can take a minute. Look in spam." Buttons: "Send it again" (disabled for 60 seconds, then rate limited: 3 per hour per address and per IP), "Use a different email".
- States: sent, resending, resend throttled, resend failed.

### 4.3 `/auth/confirm` (new route, no screen unless it fails)

Success: verified, signed in, redirect to `safeNext(next)` which defaults to `/setup` (the setup page itself bounces an owner who already has a bar to `/app/dashboard`).
Failure goes to `/login?error=<code>` where the login form now shows a message and a recovery action:

| Code | Message | Action |
|---|---|---|
| `link_expired` | "That link has expired. Links last one hour." (Supabase default OTP expiry, set in dashboard) | "Email me a new one" (prefills email if present) |
| `link_used` | "That link was already used. You may already be signed in." | "Log in" |
| `wrong_browser` (callback only, missing PKCE verifier) | "Open the link in the same browser you asked from, or request a new one." | "Email me a new one" |
| `auth_callback_failed` / unknown | "We could not sign you in from that link." | "Log in" or "Sign up" |

### 4.4 `/login` (changed)

Add "New to Rail? Create an account" under the card, show the `?error=` message with `role="alert"`, keep the demo button. Magic link copy: "If that email has an account, a login link is on its way." (now true).

### 4.5 `/setup`, create your bar (changed, `app/(app)/setup/`)

Three questions, one screen, "Step 1 of 3" (steps: bar, POS, checklist):
- Bar name (required, autofocus). Placeholder "The Tipsy Tavern" is fine.
- City and state (state required). Time zone is inferred from the state (OH, KY, IN east: America/New_York; the first customers are Cincinnati and Northern Kentucky, so one default covers them) and shown as an editable select below, labelled "Time zone, used for your nightly close".
- Bar type (select, default Bar / Tavern).
- Terms checkbox (existing text and links), required, with server enforcement kept.
- Button "Create my bar". Subcopy under it: "Tip rules and pay rates come next, from your checklist. Nothing here is final."

Moved out of this screen: tip split, barback allocation, hourly rates, pour size. They become blank until the owner enters them at the "Add staff" step (section 4.8); the pre-filled 15 percent and $15 values are removed because they feed pay. If the visitor came from the demo, these four are filled from the carried settings and marked "From your demo choices".

States: loading ("Creating your bar..."), name missing, terms unticked, create failed ("We could not create your bar. Nothing was charged. Try again."), rate limited, unverified email ("Verify your email first" with resend), already has a bar (redirect to dashboard, no error), signed out (redirect to `/login?next=/setup`).

### 4.6 `/setup/pos`, choose your POS (changed)

Same three cards, honest copy:
- 2Touch: "Rail reads your 2Touch sales and shifts every five minutes through a small program on the POS computer." Badge: "Needs an install on the POS computer". Primary action "Choose 2Touch". Next screen shows how to get it installed (4.7).
- Clover: "Connect your Clover account." (existing flow).
- Toast: wording must match whatever the Toast adapter supports when it ships (COLLISION, wait for that workflow).
- Footer: "Not sure, or something else? Choose later" sets nothing and goes to the dashboard checklist with "Connect your POS" open.

States: already chosen (redirect, as now), save failed (toast plus inline), loading.

### 4.7 Connect POS, 2Touch (new screen or a checklist panel; reuse Settings pairing code)

Shows the pairing code (created when 2Touch is chosen, by calling the existing config-save function so `agent_token` exists), and two paths: "I will do it myself" (download link and steps, only if the owner hosts the installer, OWNER decision 6) and "Book my install" (founder contact). Plus "Import last night's Z report by hand" for a first look without the agent. States: waiting for first sync (polls the existing sync health), connected but no data (the existing `no-data` status), error from `last_sync_errors`.

### 4.8 Dashboard setup checklist (new, `SetupChecklist`)

Shown on `/app/dashboard` until all four are done or the owner dismisses it. Dismiss stored as `bar_settings.onboarding_dismissed_at` (a plain write, no table). Items, each with a one-line why, a status, and a link:

1. Connect your POS. Done when `pos_provider` is set and (agent: `last_sync_at` present; Clover: connected; manual: any Z report).
2. Add your staff. Done when `employees` count is above zero. Link goes to payroll employees; this is where tip mode, hourly rate, pay frequency and the barback cut get answered (they are deliberately not defaulted).
3. Add your inventory. Done when `inventory_items` count is above zero (inventory setup page exists). Empty-state copy: "Start with your top 20 sellers. You can add the rest later."
4. See your first night. Done when a non-backfill Z report exists. This is when the 30 free nights start. Copy: "Your first night closes tomorrow morning. Your 30 free nights start when it arrives."

Beyond the four, one line at the bottom, not a checklist item: "To see your first pay run, approve it on Payroll Review" (the strategy's activation is the first approved pay run, `strategy.md` sections 1 and 7).

States: nothing done, partial, all done (collapses to "You are set up"), POS connected but zero rows after 24 hours (amber, "Your POS connected but sent no sales. A bar closed for two days looks the same as a broken feed." copying the `no-data` logic), dismissed.

### 4.9 Demo banner (new, `DemoBanner` in the app layout)

For orgs with `isDemoOrg(org.slug)`: a slim bar, "You are looking at sample data. It is deleted after 24 hours." Button "Make this my bar" goes to `/signup?from=demo`. Expiry states: more than 2 hours left (quiet), under 2 hours (stronger wording with the time). After expiry, `/login?demo=expired` shows "Your demo ended. Start again or create your account."

### 4.10 Trial banner (new, last)

Owner only, on the dashboard. "Day 12 of 30 free nights" from the first live Z report; from night 25 "5 nights left. Subscribe to keep going" with the existing Checkout button; after the trial with enforcement off: a persistent line, no block. Enforcement stays off until the owner decides (section 7).

## 5. Staff sign-up and email confirmation

`/join` calls `signUp` and files a pending claim. With confirmation required (as on the project checked), the staff member must verify their email, then a manager must approve, and `claimEmployeeAccount` never tells them either. Add one line to the `/join` success message: "Check your email to confirm your address, then wait for approval." If the owner decides to turn confirmation off for faster installs, owner sign-up loses its verified-email gate; do not do that. Test the join flow after changing email templates, because the new template must also work for staff.

## 6. Abuse limits

| Surface | Limit | Where |
|---|---|---|
| Sign-up action | 5 per hour per IP, 3 per hour per address (`RATE_LIMITS.signup`) | server action, before calling Supabase |
| Resend verification | 3 per hour per address and per IP (`RATE_LIMITS.signupResend`) | server action |
| Create bar | 2 per day per IP (`RATE_LIMITS.createOrg`), and 1 owned non-demo bar per user for now | `createOrgWithSettings`, fail closed (see below) |
| Demo | unchanged (3 per hour per IP, 750 org cap) | `/api/demo` |
| BotID | `checkBotId()` in sign-up, create-bar and demo | server actions and route |
| Email | Supabase per-hour email limit and a custom SMTP sender | dashboard |

`checkRateLimit` fails open by design ("nothing behind these limits is destructive"). Creating an org is more durable than a login attempt, so the one-bar-per-user check and the verified-email check must be plain database reads that fail closed (throw), while the IP limit may fail open. Say that in the code comment.

BotID (Vercel): UNVERIFIED details, check the `vercel:botid` skill and docs at install time. Expected shape: `npm i botid`, wrap `next.config.ts` with `withBotId`, call `initBotId({ protect: [{ path: '/signup', method: 'POST' }, ...] })` from `instrumentation-client.ts`, and call `checkBotId()` in the server action, returning the generic throttle error when `isBot`. Server actions post to the page path, so protect the page path with `POST`. It only works on Vercel deployments; locally it reports not a bot. Deep Analysis is a paid tier, leave it off. The existing `next.config.ts` has a Report-Only Content-Security-Policy, so check BotID's script is not reported as a violation (COLLISION: the other workflow may edit `next.config.ts`).

## 7. The 30-night trial and Stripe

What `docs/go-to-market/pricing-and-packaging.md` says: first 30 nights free, counted from the first synced Z report, no card taken before night 31, prices are hypotheses ($99 and $199), first ten bars hand-invoiced.

Design:
- `organizations.trial_started_at timestamptz null`, set once by an idempotent `update ... where trial_started_at is null`, when the first Z night arrives that is not a backfill. A backfill carries `backfill: true` (AGENTS.md) and brings a year of history; counting the earliest business date would have the trial end the day it started. Use the arrival time, not `business_date`, for the start. Demo orgs never start one.
- A night counts when a Z report exists for a distinct business date on or after the start. The trial is over after 30 such nights or 60 calendar days, whichever first (so a bar that closes Mondays is not charged for a closed night, and a bar that stops syncing does not get free service forever). OWNER decision 4.
- Pure function `trialState({ startedAt, nightsCounted, now })` in `lib/billing/trial.ts` returning `not_started | running(n of 30) | ended`. `accessFor` gets an optional `trial` input so `running` is allowed and `ended` falls through to the existing `none` rule. `BILLING_ENFORCE` stays off, so nobody is blocked until the owner turns it on and gives non-paying bars `comped` (billing README step 9).
- Subscribing early: `/api/billing/checkout` passes `subscription_data.trial_end` equal to the remaining trial end so the first charge is not early. UNVERIFIED Stripe minimum lead time for `trial_end` (I believe it must be well in the future; check Stripe docs); if too close, charge from now.
- No card up front. Argument for: the first ten are founder-installed 2Touch bars sold in person; asking for a card at sign-up is a wall at the one moment trust is lowest, and the strategy's measure of success is "do they pay without bargaining on night 31", which needs the free period to be free. Argument against: some free-riders. At ten hand-picked bars that cost is zero. Revisit if sign-ups ever come from strangers at volume.
- Where to call `markTrialStarted(orgId)`: the one shared place after Z rows are written. That is `applyNormalized` (extracted in commit `5f9d6c4`) which the Clover and Toast workflow is also editing. COLLISION: add the call after that workflow lands, or call it from the ingest route and the manual import actions instead. The cron email fallback (`lib/2touch/poll-emails.ts`) is a third writer.

## 8. Demo conversion, in detail

1. `DemoBanner` links to `/signup?from=demo`.
2. The signup page server component, when the viewer is a demo user (`email` ends with `DEMO_EMAIL_SUFFIX`), reads the active demo org's `bar_settings` and builds a prefill with `pickDemoPrefill(settings)` (pure, in `lib/demo/prefill.ts`): only `tip_split_percent`, `barback_tip_pct`, `barback_split_method`, `barback_tiers_enabled`, `barback_tip_tiers`, `default_hourly_rate`, `hourly_rates`, `default_pour_oz`, `bottle_sizes_ml`, `overtime_enabled`, `overtime_multiplier`, `opener_bonus_type`, `opener_bonus_value`, `sales_tax_rate`, `pos_prices_include_tax`. Never name, address, city, state, bar type, phone, or any `nacha_*` key.
3. Sign-up passes it as `options.data.prefill`. It rides on the account to `/setup`, which reads `user.user_metadata.prefill`, validates with a zod schema (`lib/setup/prefill.ts`), and fills the defaults.
4. The demo session is replaced when the new user verifies. The old demo user and its three orgs are purged by the existing sweep (`lib/demo/purge.ts`) by slug and age; nothing needs to be deleted by hand.
5. Rejected alternative: convert the demo user in place (`admin.auth.admin.updateUserById` with a real email and password). It keeps the user id but also keeps three fictional orgs with fake sales, and the org slugs begin with the demo prefix, so the purge would delete the real account's bars at 24 hours unless every slug is renamed. Not worth it.
6. The demo visitor's possible loss: anything they typed that is not in the settings list (for example items they added). OWNER decision 7 asks whether that matters; I expect not.

## 9. Owner steps in the Supabase and Vercel dashboards, in order

Do these before the code ships. Items marked (code first) need the code deployed before the setting is changed.

1. Authentication, Sign In / Providers (UNVERIFIED label for the screen name, it moves): read "Allow new users to sign up" and "Confirm email" on the LIVE project and tell me both values. Today's reading of the dev project: sign-ups on, confirmation on. If sign-ups are on and you do not want strangers creating accounts before the code in section 10 ships, turn "Allow new users to sign up" off now; the founder creates early owners from Authentication, Users (Add user, "Auto confirm" ticked) until launch. Note this also blocks `/join` staff sign-ups and the magic link for new people.
2. Authentication, URL Configuration: Site URL = the production origin. Redirect URLs: production origin with `/**`, `http://localhost:3000/**`, and the Vercel preview pattern if previews are used.
3. Project Settings, Authentication, SMTP: set custom SMTP (code first not needed). The built-in sender is rate limited and shows a generic from address. OWNER decision 3 picks the provider and a from address on a domain you own. Then raise Authentication, Rate Limits, "emails sent per hour" to something sane for launch.
4. Authentication, Emails, Templates (code first, because the link target `/auth/confirm` must exist): change "Confirm signup" and "Magic Link" to link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/setup` and `...&type=magiclink&next=/app/dashboard` respectively. Keep "Reset password" as is until a reset flow is built (there is none today; `/login` has no "forgot password", which is a gap, add it in phase 2). Check that the template language is plain and names Rail.
5. Authentication, Providers, Email: set minimum password length to 10 (Supabase minimum 6; the `/signup` form enforces the same). Leaked password protection is a paid-plan feature (UNVERIFIED which plan); skip if unavailable.
6. Authentication, Sessions or Email OTP expiry: leave link expiry at the 3600 seconds default; the copy above says "one hour". If you change it, change the copy.
7. Authentication, Attack Protection, captcha: leave OFF (see section 3, item 7).
8. Authentication, Providers, Google: leave OFF until the owner decides on Google.
9. Run the policy check: SQL editor, `select schemaname, tablename, policyname, cmd from pg_policies where tablename in ('organizations','memberships');` on the live project and send me the output, to confirm a signed-in user cannot insert an org or a membership directly with the anon key. (Today's code uses the service role, so this is a defence in depth check, but the answer matters for point 4 of section 0.)
10. Vercel, project settings: enable BotID (Basic) after the code is merged; add env var `NEXT_PUBLIC_SIGNUP_OPEN=true` (the flag in section 10, step 4) only when you want the public page live.
11. Billing, later: follow `docs/billing/README.md` steps, apply the `org_billing` migration, keep `BILLING_ENFORCE` unset until a decision on enforcement.

## 10. Build order, with files and tests

Each step is shippable and leaves the app working. Tests are vitest, pure functions first (the repo's pattern: `lib/**/*.test.ts` via `npm test`). Route handlers and server actions get thin wrappers around pure helpers, because the repo has no harness for them.

0. Pre-work: run `npm test` and `npx tsc --noEmit` on a clean tree for a baseline (not run by this task).

1. **Safe redirects.** Create `lib/auth/safe-next.ts` (`safeNext(value, fallback)`: starts with one `/`, not `//`, not `/\`, no scheme, no control characters) and `lib/auth/safe-next.test.ts` (rejects `@evil.example`, `//evil.example`, `/\evil`, `https://x`, `javascript:`, empty; accepts `/app/dashboard?x=1`). Use it in `app/auth/callback/route.ts`, `app/(app)/accept-terms/actions.ts` (replace its inline check) and `app/(auth)/login/login-form.tsx`.

2. **Auth error codes and the confirm route.** Create `lib/auth/errors.ts` (`authErrorCode(error)` maps Supabase error messages and statuses to `link_expired | link_used | wrong_browser | auth_callback_failed`) with `errors.test.ts`. Create `app/auth/confirm/route.ts` (GET: read `token_hash`, `type`, `next`; `verifyOtp`; on success redirect via `safeNext` after a memberships check like the callback; on failure redirect to `/login?error=<code>`). Edit `app/auth/callback/route.ts` to use the same helpers. Edit `login-form.tsx` to read and show `?error=` with `role="alert"` and a "send me a new link" action (reuse `sendMagicLink`). Tests: the helpers; plus a manual check of both browsers.

3. **Rate limit rules.** Edit `lib/rate-limit.ts`: add `signup` (5 per hour), `signupResend` (3 per hour), `createOrg` (2 per day). Extend the existing rate-limit tests if any exist for rule shape (UNVERIFIED whether `rate-limit.ts` has a test file).

4. **`/signup`.** Create `app/(auth)/signup/page.tsx`, `signup-form.tsx`, `check-email.tsx`, `actions.ts`. Actions: `signUpOwner(email, password, honeypot, prefill?)` (normalise address, honeypot trips a silent success, BotID check, rate limits keyed `signup-ip:` and `signup-acct:`, `supabase.auth.signUp` with `emailRedirectTo` to `/auth/confirm` is not needed because the email template carries the link, always return the same `{ ok: true }`), and `resendSignup(email)`. Put password policy in `lib/auth/password.ts` with a test (length 10 minimum, rejects the email as password). Behind `NEXT_PUBLIC_SIGNUP_OPEN`: when unset the page renders "Rail is invite only right now. Book an install" and the action refuses, so the code can merge before the owner is ready. Add `/signup` links on `/login`, the landing nav, `app/page.tsx` hero and `/pricing` ("Create an account to subscribe"). COLLISION: none known; landing copy must wait on `claims-register.md` decisions.

5. **Magic link stops creating accounts.** Edit `app/(auth)/login/actions.ts`: `signInWithOtp({ ..., options: { shouldCreateUser: false, emailRedirectTo } })`. Edit its copy as above.

6. **Gate `/setup`.** Extract the path test from `proxy.ts` into `lib/auth/gated-path.ts` (`isGatedPath(pathname)` covering `/app`, `/me`, `/setup` with boundary care, the existing comment explains why) with `gated-path.test.ts` (`/apple-icon` and `/setup-guide` are not gated; `/setup`, `/setup/pos` are). Edit `proxy.ts` to use it.

7. **Harden create-bar.** Edit `app/(app)/setup/actions.ts`:
   - require `user.email_confirmed_at`;
   - if the user already owns a non-demo org, return it instead of creating (idempotent);
   - `checkRateLimit(RATE_LIMITS.createOrg, ip)`;
   - if the membership insert fails, delete the org just created (comment `admin-scope-ok:` with the reason, `npm run audit:scope` must pass);
   - write `timezone` into `bar_settings` (add `timezone?: string` to `BarSettings` in `lib/org.ts`);
   - stop seeding the two placeholder reps (or seed none and rely on the empty state; OWNER decision 8);
   - make the money fields optional and absent unless supplied or prefilled.
   Create `lib/setup/create-bar.ts` with pure `buildBarSettings(input, prefill)` and `inferTimezone(state)` plus `create-bar.test.ts` (OH and KY give America/New_York; unknown gives none and asks; absent money fields stay absent; prefill never overrides explicit input; slug is stable and safe for unicode and empty names, which currently produce a slug starting with `-`). Create `lib/setup/prefill.ts` (zod schema, tested with hostile metadata). Edit `app/(app)/setup/page.tsx` down to the three-question form of 4.5, with the unsigned and already-has-a-bar redirects done server side (the page becomes a server component wrapping a client form).

8. **BotID.** `npm i botid`; edit `next.config.ts` (`withBotId`), create `instrumentation-client.ts` if absent, call `checkBotId()` in `signUpOwner`, `createOrgWithSettings` and `app/api/demo/route.ts`. Test with the module mocked: a bot result returns the generic throttle error and creates nothing. COLLISION: `next.config.ts`.

9. **POS step and the pairing code.** Edit `app/(app)/setup/pos/_components/pos-selector.tsx` copy as 4.6 and call the existing agent-token creator (`settings/actions.ts` near line 242) when 2Touch is chosen, then show 4.7. COLLISION: the Clover and Toast workflow owns POS setup files, wait for it. The Toast card wording waits on what that workflow ships.

10. **Checklist.** Create `lib/onboarding/checklist.ts` (`buildChecklist({ posProvider, posConfig, employeeCount, itemCount, liveZCount })` returning four items with state) and `checklist.test.ts` (each item done and not done; a backfill-only bar is not "first night"; `last_sync_errors` shows as a problem not as done). Create `app/(app)/app/dashboard/_components/setup-checklist.tsx`, a small server query for the counts (all through `createClient()` so RLS applies, or `createAdminClient()` with `.eq('organization_id', org.id)`, never without), and the dismiss action (writes `bar_settings.onboarding_dismissed_at`, reads the org first and spreads the latest `bar_settings`, the same rule AGENTS.md states for `pos_config`). Edit `dashboard/page.tsx` to render it above the content.

11. **Demo conversion.** Create `lib/demo/prefill.ts` (`pickDemoPrefill`) with `prefill.test.ts` (only the allowed keys come out, address and nacha keys never do). Create `app/(app)/app/_components/demo-banner.tsx`; edit `app/(app)/app/layout.tsx` to render it for `isDemoOrg(org.slug)`. Edit `signup/page.tsx` to read the prefill when `from=demo`. Edit `app/(auth)/login/page.tsx` for the `demo=expired` message. COLLISION: none known.

12. **Trial and billing hand-off.** Migration `supabase/migrations/2026MMDD..._org_trial.sql` adding `organizations.trial_started_at` (nullable, no default; additive, a no-op until used). OWNER applies it to dev then live; the code must tolerate it being absent, like `lib/billing/store.ts` does. Create `lib/billing/trial.ts` and `trial.test.ts` (not started; day 1; night 30; night 31; 60 day backstop; a backfill-only org has not started; a demo org never starts). Edit `lib/billing/access.ts` to accept the trial state (extend `access.test.ts`: running trial allowed under enforcement, ended falls to `none`, comped and demo unchanged). Edit `app/api/billing/checkout/route.ts` for `trial_end`. Call `markTrialStarted` in the ingest route, the manual Z import action and `lib/2touch/poll-emails.ts` after the COLLISION above clears. Add `trial-banner.tsx`.

13. **End to end.** A Playwright script in the scratchpad pattern already used for the smoke test (`playwright-core`, `chromium.launch({ channel: 'chrome' })`), against a dev Supabase with a throwaway address, reading the verification link from the project's email logs (local Supabase has Inbucket; hosted dev does not, so use a real inbox the owner controls). Cases in section 11. Never POST `/api/demo` more than the rate limit allows (3 per hour per IP).

## 11. Test matrix for the walk

| Case | Expected |
|---|---|
| New address, correct password, link opened in the same browser | `/setup`, then create bar, `/setup/pos`, dashboard with checklist 0 of 4 |
| Same, link opened on a phone (different browser) | Signed in on the phone, `/setup`; the laptop tab still shows "Check your email" and updates after a refresh |
| Link opened twice | Second time: `/login?error=link_used` with message |
| Link opened after expiry | `/login?error=link_expired`, "Email me a new one" works and is rate limited |
| Address already registered | Same "Check your email" screen; `/login` still works for them |
| Weak password, bad email | Inline message, no request to Supabase |
| 6th sign-up from one IP in an hour | Throttle message with minutes |
| Honeypot filled | Same success screen, no account |
| Create bar twice (two tabs) | One org; second returns the first |
| Create bar while unverified | Refused with a "verify first" message |
| Signed-in owner opens `/setup` | Redirect to dashboard |
| Signed-out opens `/setup` | `/login?next=/setup` |
| `next` with `@evil.example` or `//evil.example` | Falls back to the default path |
| Demo, edit settings, "Make this my bar" | Signup shows the carry-over line; after verify, `/setup` fields filled; no fake sales or staff in the new bar |
| Demo expires | `/login?demo=expired` message |
| Staff `/join` after the template change | Still creates a pending claim, success message mentions email confirmation |
| First live Z arrives | `trial_started_at` set once; backfill run before it does not set it |
| Mobile 390 wide, every screen | No horizontal scroll, labels visible, tap targets 44px (the smoke test checked 390 for existing routes) |

## 12. Decisions only the owner can make

1. Are sign-ups open to the public at launch, or invite only for the first ten (founder gives an invite link or creates the account)? Default taken: ship the page behind `NEXT_PUBLIC_SIGNUP_OPEN`, flag off until you decide. The page and gates are needed either way.
2. One owned bar per account for now? Default: yes. Multi-bar owners are outside the first customers; the org switcher stays for staff who work in more than one bar.
3. Email sender: which service and from address, on a domain you own. Without it verification mail comes from a generic Supabase address and may land in spam. UNVERIFIED whether a domain is owned (`lib/site.ts` not read for this).
4. What counts as a "night" in the free 30 (distinct Z dates, my recommendation, with a 60 calendar day backstop) and whether a manually imported Z report starts the clock.
5. Can the page say "first 30 nights free, no card"? It is a claim for `claims-register.md` and affects how you will be held to it.
6. Do you host the 2Touch installer for a bar to download itself, or is every install founder-led for now? Self-serve means a public Windows binary that SmartScreen may flag (UNVERIFIED, depends on code signing) and a support load of strangers. Default taken: install is "book it".
7. Demo conversion carries settings only, not items or staff the visitor added. Acceptable?
8. Placeholder reps: stop seeding them (default) or keep them as examples.
9. Remove the pre-filled pay defaults from setup (my recommendation, they feed payroll) or keep them as editable defaults.
10. Google sign-in: not now (default) or build it.
11. Does the founder's own bar take one of the ten places and one of the three $99 places? This is still open from `pricing-and-packaging.md` and decides whether it needs a `comped` billing row.
12. Whether to turn `BILLING_ENFORCE` on at all before the first ten pay, and the wording after night 30 when it is off.

## 13. What I did not do or could not check

- No code was run, no test run, no migration applied, no POST sent (no `/api/demo`). The one network call was a read-only GET of the Supabase `/auth/v1/settings` endpoint with the public anon key from `.env.local`. It tells which auth features that project has on; it does not say whether the project is the live one.
- The demo cookie jar was not used; this was a source read.
- Supabase dashboard screen names and the built-in email rate limit are from memory and may have moved (UNVERIFIED).
- Not read: RLS policies for `organizations` and `memberships` (outside the repo), `lib/demo/expired.ts` usage, `lib/site.ts`, how `lib/notifications/run-daily.ts` picks a business date (relevant to the timezone field: the new key is stored but nothing reads it until a follow-up wires it in), Stripe's `trial_end` minimum.
- The Clover and Toast setup screens and adapters are still moving; steps 9 and 12 should be re-read against that workflow's final shape before building.
