# Development cycle plan: sign-up first, then the value backlog, each piece audited (2026-11-25)

Branch `rebuild/foundation`. This merges three documents into one ordered plan. Read them for the reasoning; this file is the order of work and the gates.

- Value backlog: `docs/superpowers/findings/2026-11-25-value-backlog.md` (called "backlog" below).
- Sign-up design: `docs/superpowers/specs/2026-11-25-signup-flow.md` (called "signup spec"; its section 10 steps are quoted as SU1 to SU13).
- Journey inventory and audit procedure: `docs/superpowers/findings/2026-11-25-journey-inventory.md` (called "inventory"; journeys J1 to J14, procedure in its section 5).

Labels: UNVERIFIED means not confirmed from code or a live call. Dollar figures in the backlog are estimates from the backlog's own assumptions, not measurements. Nothing in this plan was built or run.

Facts the owner has decided: no direct deposit work (keep the free bank-file export); Stripe billing exists but is not live; first customers are independent single-location bars on 2Touch (Clover and Toast being added) around Cincinnati and Northern Kentucky; one founder, no legal entity yet.

## 0. How the cycle works

### One building agent at a time

Only one Sonnet implementer works in the tree at any moment. The pieces below are strictly sequential. Reason: the tree already carries uncommitted work from the Clover and Toast workflow, and several pieces edit shared files (`proxy.ts`, `next.config.ts`, `lib/org.ts`, `lib/notifications/*`, `app/(app)/app/layout.tsx`). Two agents editing those at once is the merge conflict this plan exists to avoid.

### Clover and Toast: already in flight, do not duplicate

The other workflow owns: provider adapters, `lib/pos/providers/*`, the Clover and Toast setup screens (`/setup/pos/clover`, Toast connect), the OAuth callback, credentials storage, **scheduling of Clover and Toast syncs, and their setup UI**. Nothing in this plan builds those. Where a piece depends on their output (cash and card split for the tie-out, sync health fields for the feed alert, the POS step of setup), the piece says so and either waits or degrades to "not reported". Before touching any file under `lib/pos/` or `app/(app)/setup/pos/`, the implementer runs `git status` and `git log -3 -- <path>`; if the other workflow has uncommitted changes there, the piece stops and the orchestrator reorders.

### Models and who does what

- **Sonnet generates.** One Sonnet agent per piece writes the failing test, the code and the commit(s).
- **Opus only debugs a failing gate.** It is called when a piece's gate command fails twice, or a UX audit gate fails round 1 with a finding the Sonnet agent cannot explain. Opus does not build pieces.
- **Fable or the orchestrator reviews.** After each piece it reads the diff against the "must not touch" list, confirms the failing-test commit came first, runs the gates and the audit. The reviewer is never the agent that built the piece.
- The audit reviewers (two isolated Impeccable reviewers, a third on a spread over 3) are separate agents that see only PRODUCT.md, DESIGN.md, the screenshots and the step list, per inventory section 5.

### Rules every piece inherits

1. Money, tips, stock and tenancy logic: the failing test is written first, run, seen to fail, and committed **on its own** with message `Test: <piece> (failing)` before any implementation commit. The implementation commit then makes it pass. Pure display work does not need this, but still needs its tests where logic exists.
2. AGENTS.md applies in full: every `createAdminClient()` query filters `.eq('organization_id', org.id)` or carries an `// admin-scope-ok:` justification; stock units vs drink units; `unit_cost ?? cost_price`; two tables joined on the key, never on a date; `pos_config` writers return what they stored.
3. Read the relevant guide in `node_modules/next/dist/docs/` before writing any Next.js code (this is not the Next.js the model knows). `components/ui` is Base UI: no `asChild`.
4. Never `git stash`, `reset`, `checkout` or `add -A`. Stage by path. Commit only files the piece names. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
5. Never POST `/api/demo` (3 per hour per IP). Audits reuse the demo cookie jar or a throwaway org; if the jar has expired, say so and judge from source.
6. Migrations are written, never applied, by the agent. The owner applies them (dev, then live).

### Gates after every piece (all must pass before the next piece starts)

Run in this order, from the repo root:

1. `npm run typecheck` (this is `next typegen && tsc --noEmit`)
2. `npm test`
3. `npm run audit:scope` (exit 0)
4. `npm run lint` at or below **44 problems and 12 errors** (the current ceiling; a piece must not raise either number, and a new error is a fail even if the total is under 44)
5. `npm run build`

A piece that adds a screen then goes through its UX audit gate. A piece is "done" only when the five commands pass **and** the UX gate passes (or the piece is on the owner's list after two failed rounds).

### The UX audit gate (same shape for every piece)

- **Journeys:** named per piece, from the inventory.
- **Procedure:** inventory section 5, scoped to the screens the piece touched. Screenshots at 390x844 and 1440x900, light and dark, every state the piece created (empty, loading, error, success) and every dialog at 390 with the keyboard height simulated. Two isolated Impeccable reviewers score /40 each; a third if they differ by more than 3; the score is the average. The detector run, keyboard-only completion, labels on every money input, contrast, tap targets, error recovery, and the "one h1, one main" structure check.
- **Pass bar:** an average of at least **32/40** on any screen that shows or edits money, tips, stock or pay (the inventory's general bar is 28; this plan raises it for money screens). **Zero open P0 and zero open P1** on a money screen. On a non-money screen: at least 28/40, zero P0, every P1 has an owner decision. No accessibility fail in the inventory's four listed checks.
- **On a fail:** the piece's implementer fixes the findings, then the audit is re-run (round 2). At most **two rounds**. After a second failure the piece stays merged only if it has no P0; the remaining findings go on the owner's list in section 4 with the evidence, and the next piece proceeds. If a P0 is open after round 2, the piece's feature flag stays off (every user-visible piece below ships behind a flag or is unreachable until the owner opts in) and the owner decides.
- Money-related findings stop for the owner before and after any fix (AGENTS.md and OVERNIGHT-LOG practice).
- Output: `docs/superpowers/findings/journeys/<piece>-audit.md` per run.

The audit cannot run a populated state it cannot produce. Where a piece needs data the demo does not have (a pending pay run, a sign-up in a second browser), the audit says so and judges that state from source, labelled UNVERIFIED, rather than claiming it passed.

---

## 1. Order of work

| # | Piece | Source | Est. build days | Flag or owner step |
|---|---|---|---|---|
| S1 | Safe redirects, auth error codes, confirm route, login error display | SU1, SU2, SU5 | 1.5 | owner edits email templates after merge |
| S2 | Gate `/setup`; harden create-bar | SU3, SU6, SU7 | 2.5 | none |
| S3 | `/signup` page and magic-link change | SU4 | 2 | `NEXT_PUBLIC_SIGNUP_OPEN` off |
| S4 | BotID on sign-up, create-bar, demo | SU8 | 0.5 | owner enables BotID in Vercel |
| S5 | POS step honesty, pairing code, dashboard checklist | SU9, SU10 | 2.5 | waits on Clover/Toast for the POS step |
| S6 | Demo conversion and demo banner | SU11 | 1.5 | none |
| V1 | "POS feed went quiet" alert | backlog A | 1.5 | none |
| V2 | Night tie-out close screen | backlog 2 | 4 | needs migration applied |
| V3 | Weekly owner summary | backlog 6 | 3 | none |
| V4 | Fast count session | backlog B | 5 | none |
| V5 | Prior-period comparison (Sales only) | backlog 3 | 2.5 | none |
| D1 | Data export and account deletion | backlog 10a | 5 | counsel on retention |
| T1 | App-side 30-night trial and billing hand-off | SU12 | 3 | blocked on owner decisions and legal entity |
| F | Final end-to-end audit of all 14 journeys | inventory | 2 to 3 | none |

Deferred, not scheduled (reasons in the backlog): suggested orders (6d, weak until V4 data is trusted), variance alerts (10d, ship a plain "counted versus expected" report only after V4 has two clean weeks, never push alerts), invoice photo (6d, text-only parser, privacy issue), QuickBooks/Xero export (3.5d, import formats unverified), payroll CSV for Gusto/Square/QuickBooks (one plain CSV, 1d, then stop), native app, self-serve trial beyond T1, status page (hosted page, no code).

**Why this order.**
- Sign-up goes first because there is no public owner path and every sale passes through J2, the highest-risk journey (inventory section 4).
- Inside sign-up: redirects and the confirm route (S1) fix live security and silent-failure bugs and are needed by everything after them. S2 hardens org creation, which is the real gate because Supabase's sign-up endpoint can be called directly. S3 exposes the page only after S1 and S2 exist. BotID (S4) follows because it edits `next.config.ts`. S5 waits last among the sign-up pieces because it touches POS setup files the other workflow owns. S6 is independent and low risk.
- Backlog pieces follow rank by value per day: V1 (protects the subscription, 1.5d), V2 (the demo moment), V3, V4, V5. V3 comes after V1 because the weekly email should be able to say the feed is stale. V4 comes before any ordering or variance work.
- D1 is placed after the five value pieces but before any paying bar: the site claim A34 ("export it at any time, delete within 30 days") is UNSUPPORTED in code today.
- T1 is last among builds because the first ten bars are founder-led and need no trial clock; it is blocked on owner decisions and a legal entity.

---

## 2. Pieces

Each piece lists: goal, files, test first, must not touch, owner-only prerequisites, UX audit gate. "Create" means a new file. File paths come from the three source documents; names not read in source are marked UNVERIFIED and the implementer confirms them with the graph report (`graphify-out/GRAPH_REPORT.md`) before editing.

### S1. Safe redirects, auth error codes, confirm route, login errors

**Goal.** No open redirect on the email link. A link opened in another browser, an expired link or a used link says what happened and offers a new one. A cross-browser `token_hash` confirm route exists.

**Files.**
- Create `lib/auth/safe-next.ts` and `lib/auth/safe-next.test.ts`.
- Create `lib/auth/errors.ts` and `lib/auth/errors.test.ts` (`authErrorCode` maps to `link_expired | link_used | wrong_browser | auth_callback_failed`).
- Create `app/auth/confirm/route.ts` (GET: `token_hash`, `type`, `next`; `verifyOtp`; redirect via `safeNext` after a memberships check).
- Edit `app/auth/callback/route.ts`, `app/(app)/accept-terms/actions.ts` (replace its inline check with the shared one), `app/(auth)/login/login-form.tsx` (read `?error=`, `role="alert"`, "send me a new link" reusing `sendMagicLink`).
- Edit `lib/rate-limit.ts` to add rule shapes `signup` (5/hour), `signupResend` (3/hour), `createOrg` (2/day), so later pieces only consume them. Whether a test file for `rate-limit.ts` exists is UNVERIFIED; if one exists, extend it.

**Test first (own commit).** `safe-next.test.ts` rejects `@evil.example`, `//evil.example`, `/\evil`, `https://x`, `javascript:`, empty and control characters; accepts `/app/dashboard?x=1`. `errors.test.ts` maps each Supabase message and status to the four codes. Both fail before the helpers exist. This is a security rule rather than money, but it takes the same failing-test-first form.

**Must not touch.** `proxy.ts` (S2), `app/(app)/setup/*`, anything under `lib/pos/`, `supabase/`, billing code, the existing password sign-in behaviour, `/join` staff sign-up.

**Owner-only prerequisites.** None before merge. After merge, and only then: change the Supabase "Confirm signup" and "Magic Link" email templates to link to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/setup` and `...type=magiclink&next=/app/dashboard` (signup spec section 9, step 4; the target must exist first). Set Site URL and redirect URLs (step 2).

**UX audit gate.**
- Journeys: J2 (steps 3 and 4 only: link click and failure), J12 (error recovery).
- Procedure: force each of `?error=link_expired`, `link_used`, `wrong_browser`, `auth_callback_failed` and view `/login` at 390 and 1440, light and dark; keyboard-only; the alert is announced; the "new link" action works and is rate limited.
- Pass bar: not a money screen, so at least 28/40, zero P0, P1s owner-decided; the error text names what happened and the next step, and shows no raw or developer text.
- On fail: fix, re-audit, two rounds, then owner's list.

### S2. Gate `/setup`; harden create-bar

**Goal.** A signed-out visitor never sees the create-bar form. A signed-in owner cannot create a second bar by accident. Org creation is verified-only, rate limited, idempotent and cleans up after itself. Pay defaults stop being silently pre-filled.

**Files.**
- Create `lib/auth/gated-path.ts` and `gated-path.test.ts`; edit `proxy.ts` to use it (covers `/app`, `/me`, `/setup`; `/apple-icon` and `/setup-guide` stay public).
- Edit `app/(app)/setup/actions.ts` (`createOrgWithSettings`): require `user.email_confirmed_at`; return the existing owned non-demo org instead of creating; `checkRateLimit(RATE_LIMITS.createOrg, ip)`; delete the org just created if the membership insert fails (with `// admin-scope-ok:` reason); write `timezone` into `bar_settings`; stop seeding the two placeholder reps (owner decision 8, default taken); make money fields absent unless supplied.
- Edit `lib/org.ts` (`BarSettings.timezone?: string`).
- Create `lib/setup/create-bar.ts` and `create-bar.test.ts` (`buildBarSettings`, `inferTimezone`, safe slug); create `lib/setup/prefill.ts` and `prefill.test.ts` (zod schema, hostile metadata).
- Edit `app/(app)/setup/page.tsx` to a server component wrapping a client form with the three-question layout of signup spec section 4.5; signed-out redirects to `/login?next=/setup`; owner with a bar redirects to the dashboard.

**Test first (own commit; tenancy and money-default logic).** `create-bar.test.ts`: Ohio and Kentucky infer `America/New_York`; an unknown state yields none and asks; absent money fields stay absent; prefill never overrides explicit input; a unicode or empty name gives a safe slug (today it can start with `-`). `gated-path.test.ts` boundaries. Idempotency and unverified-email refusal are tested on the pure decision helper, with the action a thin wrapper (the repo has no harness for server actions). Failing commit first, then implementation.

**Must not touch.** `lib/pos/*`, `app/(app)/setup/pos/*` (S5 and the other workflow), `lib/supabase/admin.ts`, existing orgs' data, any migration, billing, `next.config.ts`.

**Owner-only prerequisites.** Decisions 2 (one owned bar per account), 8 (placeholder reps) and 9 (pay defaults) in section 4. Send the output of `select schemaname, tablename, policyname, cmd from pg_policies where tablename in ('organizations','memberships');` from the live SQL editor, to confirm a signed-in user cannot insert an org or membership with the anon key (signup spec section 9, step 9). Until that answer arrives the gate is code-side only, and this is said in the audit file.

**UX audit gate.**
- Journeys: J2 (steps 5 and 6), J12.
- Procedure: signed-out `/setup`, signed-in new user, signed-in owner with a bar, double submit, unverified user, server error mid-create; at 390 with the keyboard up; every field labelled; tax and pay inputs checked on a phone number keyboard (`step=0.25` untested per inventory).
- Pass bar: setup writes pay and tip defaults that feed payroll, so treat it as a **money screen**: at least 32/40, zero P0 and zero P1. A visible, plain error for each refusal; no raw JSON.
- On fail: fix, re-audit, two rounds, then owner's list. A second org-creation bug is a P0 and keeps S3 unlinked.

### S3. `/signup` page and the magic-link change

**Goal.** A real "create account" path: email and password, a check-your-email state, resend, and magic link that no longer creates accounts. Ships dark behind a flag.

**Files.**
- Create `app/(auth)/signup/page.tsx`, `signup-form.tsx`, `check-email.tsx`, `actions.ts` (`signUpOwner`, `resendSignup`): normalised address, honeypot silent success, rate limits keyed `signup-ip:` and `signup-acct:`, one `{ ok: true }` answer for every outcome so an address cannot be probed.
- Create `lib/auth/password.ts` and `password.test.ts` (minimum 10, rejects the email as password).
- Edit `app/(auth)/login/actions.ts` (`shouldCreateUser: false`, honest copy), `login-form.tsx` (link to `/signup`).
- Flag: `NEXT_PUBLIC_SIGNUP_OPEN`. Unset renders "Rail is invite only right now. Book an install" and the action refuses.
- Add `/signup` links on the landing nav, `app/page.tsx` hero and `/pricing` ("Create an account to subscribe"). Landing copy waits on `claims-register.md` decisions: if undecided, link only, no new claims.

**Test first.** `password.test.ts`. The "same answer for every outcome" rule gets a test on the pure result-builder, not the action. Failing commit first.

**Must not touch.** S2's files, `proxy.ts`, billing, `lib/pos/*`, landing claims about Toast or figures `claims-register.md` marks for review, `/join`.

**Owner-only prerequisites.** Custom SMTP and a from address on a domain the owner owns (decision 3, signup spec section 9 step 3); password minimum length 10 in Supabase (step 5); read the live "Allow new users to sign up" and "Confirm email" values and report both (step 1). If sign-ups are open before S2 is deployed, turn "Allow new users to sign up" off until it is. Flag turned on by the owner only (decision 1).

**UX audit gate.**
- Journeys: J2 (steps 1 to 4), J1 (the CTA path from `/` and `/pricing`).
- Procedure: the signup spec section 11 test matrix, rows for new address, other-browser link, double open, expired link, existing address, weak password, honeypot and rate limit; flag off and on; 390 and 1440, light and dark; landing sticky CTA tap target.
- Pass bar: first screen every customer sees, but it holds no money: at least 28/40 and zero P0; the first-impression bar is raised to 32/40 by this plan because it blocks every sale. P1s owner-decided.
- On fail: fix, re-audit, two rounds, then owner's list.

### S4. BotID on sign-up, create-bar and demo

**Goal.** A first filter on our own entry points. It does not protect Supabase's direct endpoint, which is why S2 is the real gate.

**Files.** `package.json` (`npm i botid`); edit `next.config.ts` (`withBotId`), create `instrumentation-client.ts` if absent; `checkBotId()` in `signUpOwner`, `createOrgWithSettings`, `app/api/demo/route.ts`. Whether BotID needs a CSP change is UNVERIFIED; check `next.config.ts` headers first.

**Test first.** With the module mocked: a bot result returns the generic throttle error and creates nothing. Failing commit first (this guards org creation, so it is a tenancy-adjacent rule).

**Must not touch.** `vercel.json`, cron routes, the 2Touch ingest route (HMAC-authenticated, must never sit behind BotID), `/api/agent/manifest`, `/api/billing/webhook`.

**Owner-only prerequisites.** Enable BotID (Basic) in the Vercel project **after** merge (signup spec section 9, step 10). Collision check: the Clover/Toast workflow may be editing `next.config.ts`; confirm a clean file first.

**UX audit gate.**
- Journeys: J2, J1 (the demo button path).
- Procedure: a signed-in human completes sign-up, create-bar and the demo button once each without a challenge; the throttle message reads plainly. Never POST `/api/demo` beyond one call; if the cookie jar is valid, use it and report.
- Pass bar: 28/40 on the touched screens, zero P0. A false positive that blocks a real owner is a P0.
- On fail: fix, re-audit, two rounds, then owner's list. A P0 means BotID is turned off in Vercel and S2's limits carry the load.

### S5. POS step honesty, pairing code, dashboard checklist

**Goal.** Fix "No setup required" (false: no agent token exists until Settings), show the pairing code at the step where it is needed, and give a new bar a derived four-item checklist on the dashboard.

**Files.**
- Edit `app/(app)/setup/pos/_components/pos-selector.tsx` and its action (call the existing agent-token creator near `settings/actions.ts` line 242 when 2Touch is chosen; show the pairing code). **COLLISION: the Clover/Toast workflow owns POS setup files. This file is edited only after that workflow's changes there are committed.** If they are not, S5 splits: checklist first, POS step later.
- Create `lib/onboarding/checklist.ts` and `checklist.test.ts` (`buildChecklist({ posProvider, posConfig, employeeCount, itemCount, liveZCount })`: four items; a backfill-only bar is not "first night"; `last_sync_errors` shows as a problem, not done).
- Create `app/(app)/app/dashboard/_components/setup-checklist.tsx`; edit `app/(app)/app/dashboard/page.tsx` to render it; dismiss action writes `bar_settings.onboarding_dismissed_at`, reading the org first and spreading the latest `bar_settings` (the same rule AGENTS.md gives `pos_config`).
- Count queries through `createClient()`, or `createAdminClient()` with `.eq('organization_id', org.id)`.

**Test first (own commit; tenancy-scoped counts and a settings writer).** `checklist.test.ts`, plus a test that the dismiss builder returns the full latest settings object with the key added (mirrors `pos-config.test.ts` ordering). Failing commit first.

**Must not touch.** `lib/pos/providers/*`, `lib/pos/pos-config.ts`, `lib/pos/sync-health.ts` (modified and uncommitted in the tree at planning time; leave it to its owner), the Clover/Toast setup pages and callbacks, the 2Touch ingest route, `2touch-agent-dotnet/`. The Toast card wording waits on what the other workflow ships; do not invent a claim.

**Owner-only prerequisites.** Decision 6 (is the 2Touch installer self-serve or "book it"; default "book it"). Nothing else.

**UX audit gate.**
- Journeys: J2 (steps 7 to 9), J3 (first-time empty dashboard), J13 only after the other workflow lands (inventory: defer).
- Procedure: empty org at 0 of 4, partway, all done, dismissed; backfill-only org; 390 and 1440, light and dark; the pairing code is copyable on a phone.
- Pass bar: not a money screen: at least 28/40, zero P0. It must say what is missing and why (PRODUCT.md P4). An amber "no-data" must read as guidance, not alarm.
- On fail: fix, re-audit, two rounds, then owner's list.

### S6. Demo conversion and demo banner

**Goal.** A demo visitor can keep their settings: "Make this my bar" carries tip split, barback share, rates, pour size, tax rate, overtime and POS pick into sign-up as validated defaults, never fake sales or staff. Expiry stops being silent.

**Files.** Create `lib/demo/prefill.ts` and `prefill.test.ts` (`pickDemoPrefill`); create `app/(app)/app/_components/demo-banner.tsx`; edit `app/(app)/app/layout.tsx` (render for `isDemoOrg(org.slug)`; reuse `lib/demo/constants.ts` slug prefix, never re-inline it), `app/(auth)/signup/page.tsx` (read prefill when `from=demo`), `app/(auth)/login/page.tsx` (`demo=expired` message).

**Test first (own commit).** `prefill.test.ts`: only allowed keys come out; address and bank keys never do; hostile metadata is rejected by the schema (user metadata is user-writable). Failing commit first.

**Must not touch.** `lib/demo/purge.ts` and the slug-based sweep, `app/api/demo/route.ts` beyond what S4 already did, seeded demo data, the landing demo button.

**Owner-only prerequisites.** Decision 7 (settings only, not items or staff the visitor added).

**UX audit gate.**
- Journeys: J1 (demo), J2 (from demo into sign-up).
- Procedure: from a demo org, edit a setting, click through to `/signup`, confirm the carry-over line; `demo=expired` login message; banner at 390 does not cover bottom nav or the floating action button.
- Pass bar: the banner sits on money screens but does not show money: 28/40, zero P0; the carry-over must never import fake sales (P0 if it does).
- On fail: fix, re-audit, two rounds, then owner's list.

### V1. "POS feed went quiet" alert

**Goal.** Tell the owner when the POS has been silent, once per episode, so a month of lost sales cannot go unseen again.

**Files.**
- Edit `lib/notifications/types.ts` (new event type `pos.feed_stale`, `ROLE_DEFAULTS` for owner and manager; a missing preference row means role default).
- Edit `lib/notifications/detect.ts` with a pure detector over `assessSyncHealth` output (provider-neutral health object), plus `detect.test.ts` cases.
- Edit `lib/notifications/run-daily.ts` and `deliver.ts` to run it from the existing daily cron; dedupe key per stale episode (the date the episode began), so it fires once.
- Edit the Settings notifications tab component to list the event (path UNVERIFIED; locate via the graph).

**Test first (own commit; tenancy in a cross-org cron).** Pure detector cases: `no-data` is amber and not an alarm; an absent `last_sync_summary` means "cannot say" and never fires; a healthy sync never fires; one episode gives one key; recovery then a new stall gives a new key. Failing commit first. The cron loop must carry `admin-scope-ok` justifications (`npm run audit:scope` must pass).

**Must not touch.** `lib/pos/sync-health.ts` and `sync-health.test.ts` (modified and uncommitted in the tree at planning time; this piece reads `assessSyncHealth`, it does not edit it unless that change is committed first), `lib/pos/pos-config.ts`, the ingest route, the agent code, Clover/Toast adapters and scheduling.

**Owner-only prerequisites.** None. Unverified until the other workflow lands: whether Clover and Toast write `last_sync_*` the same way; if not, add up to one day after they land.

**UX audit gate.**
- Journeys: J3 (bell and sync strip), J14 (notifications tab), J12.
- Procedure: seed a stale org in a throwaway database; view the bell item, the notification wording at 390, the preference toggle, the push opt-out; confirm a closed bar reads amber and calm.
- Pass bar: not a money screen: 28/40, zero P0. The wording must say "no sales since <date>" and what to do, never blame.
- On fail: fix, re-audit, two rounds, then owner's list.

### V2. Night tie-out close screen

**Goal.** Let a manager enter the cash they counted and see the gap in dollars, at the night level, owner and manager only. When the POS did not send the cash split, say so; never claim a match.

**Files.**
- Create `lib/pos/tie-out.ts` and `tie-out.test.ts`: pure function of `cash_sales`, `card_sales`, `cash_tips`, counted cash, tips paid out. Returns a state of `balanced | over | short | cannot-tie-out`.
- Migration: `supabase/migrations/<timestamp>_add_counted_cash.sql` adding a nullable `counted_cash` on `z_report_days`, no default. Written, not applied.
- Edit `app/(app)/app/payroll/cash-actions.ts` (or a sibling action) with a `canEdit` gate from `lib/permissions.tsx`, scoped by `organization_id`; set `cash_tips_source = 'manual'` only on the cash-tip figure, never on this one.
- Move or reuse the "Expected in drawer" computation from `app/(app)/app/payroll/_components/cash-tips-card.tsx`; render the result in `app/(app)/app/sales/_components/night-view.tsx` or a Today card. Tolerate the column being absent, like `lib/billing/store.ts` does.

**Test first (own commit; money).** `tie-out.test.ts`: NULL `cash_sales` gives `cannot-tie-out` and never `balanced`; NULL is not zero; a one-cent gap is named; a sub-cent difference follows the payout-tolerance convention already in the repo (read it; do not invent a second rule); expected = cash sales less cash tips; tips owed counts card tips plus cash tips. Failing commit first.

**Must not touch.** `lib/2touch/poll-emails.ts`, the ingest route, the Clover sync and every POS writer of `cash_tips` (they must keep honouring `cash_tips_source = 'manual'`), `lib/payroll/*` pay maths, payout and NACHA code, the Z feed columns' meaning. No per-person gap, ever.

**Owner-only prerequisites.** Apply the migration to dev, then live. Real-data check: compare against one real 2Touch Z report before the audit; the backlog flags this as the feature most likely to embarrass Rail if the POS cash figure is wrong. Dependency: Clover/Toast filling `cash_sales` and `card_sales` through `applyNormalized`; until then those bars see "not reported".

**UX audit gate.**
- Journeys: J4 (manager close), J3.
- Procedure: states `balanced`, `over`, `short`, `cannot-tie-out`, and a night with no Z report; enter a count on a phone, keyboard open; offline submit; every money input labelled; the gap is announced.
- Pass bar: **money screen**: at least 32/40, zero P0 and zero P1. The Opener switch collision and overlapping day rows at 390 (critique issue 3, J4) are in this journey; if they remain, they count against it.
- On fail: fix, re-audit, two rounds, then owner's list. A wrong "balanced" is a P0 and the screen is hidden behind its flag until fixed.

### V3. Weekly owner summary

**Goal.** One email a week to owners: sales, change on the prior week, tips per hour, labour hours, low-stock count, anything awaiting approval. COGS and profit are left out.

**Files.** `lib/notifications/types.ts` (`weekly.summary`, owner default), `detect.ts` (pure week builder, uses the same delta helper V5 will later share: build `lib/pos/deltas.ts` here with its test, V5 reuses it), `run-daily.ts` (weekday gate inside the single daily cron), `deliver.ts`, a template under `lib/email` (path UNVERIFIED), dedupe key on the week start date.

**Test first (own commit; money figures leaving the app).** The builder: week boundaries, a week with a missing Z report says "incomplete", never a drop; percent suppressed below a base floor; no employee names or pay in the output; low-stock count agrees with the existing digest; stale feed text from V1 appears when the feed is stale. Failing commit first.

**Must not touch.** `lib/payroll/*`, `lib/books/*` and COGS code, per-employee data, the push path, the V1 detector internals.

**Owner-only prerequisites.** None to build. Before sending to more than a few dozen owners: check the Gmail send limit on the shared app password (UNVERIFIED), which is also one point of failure.

**UX audit gate.**
- Journeys: J3, J14 (the preference row), the email itself.
- Procedure: render the email in light and dark at phone width in a mail client or a rendered HTML file; read every figure against the dashboard for the same week; notification toggle.
- Pass bar: the email carries money figures: at least 32/40, zero P0 and zero P1. Every figure must match the screen it links to (P1, one source of truth); a mismatch is a P0.
- On fail: fix, re-audit, two rounds, then owner's list. Sending stays off until the owner turns it on.

### V4. Fast count session

**Goal.** One screen with a stepper per item and "items left", saving one batch of count adjustments with reason `recount`, so a monthly count of 200 items takes about 2 taps each, and a count is never logged as a delivery.

**Files.** Create a count page under `app/(app)/app/inventory/` (route name for the implementer, for example `count/`) with `_components/`; create `lib/inventory/count.ts` and `count.test.ts` (pure: given counted and expected stock in stock units, produce the adjustment rows); create one server action doing a single transactional batch; reuse `stock-adjust-dialog.tsx` logic where possible without editing its Add/Delivery default (a separate bug); link from the inventory page.

**Test first (own commit; stock and tenancy).** `count.test.ts`: every row has reason `recount`, never `delivery`; quantities are stock units; a negative result is refused with a message, not a 500; the batch refuses any item not in the caller's org (use the `assertItemInOrg` pattern, `weigh/actions.ts`); all rows apply or none do. Failing commit first.

**Must not touch.** `pos_apply_item_sales()` and `pos_stock_applications` (delta-based depletion), `lib/pos/pour.ts`, `lib/pos/bundles.ts`, `usage_logs.unit_cost` and `shipment_id` semantics, `inventory/weigh/*` logic, shipments, the existing adjust dialog's defaults.

**Owner-only prerequisites.** None. A real count by a real manager on a phone in a stockroom is the decisive test; the owner or a first bar does this once.

**UX audit gate.**
- Journeys: J6 (inventory count), J7 only as a neighbour (do not regress the shipment dialog).
- Procedure: 390 in dark with the keyboard open; a 200-item list; resume after leaving; bad input; a count that hits zero; one-handed reach; stepper tap targets at least 44px.
- Pass bar: **stock is money**: at least 32/40, zero P0 and zero P1. The J6 defects (silent 500 on below-zero, clipped mode tabs, search saying "create your first item" with $0.00) must not appear on the new screen.
- On fail: fix, re-audit, two rounds, then owner's list. A count that mislabels itself as a delivery is a P0.

### V5. Prior-period comparison (Sales only)

**Goal.** Delta chips next to the Sales headline figures ("up 8 percent on last week"). Books comparison is not in this piece: it waits on the open COGS checks (`critique/summary.md` money-integrity list).

**Files.** Reuse `lib/pos/deltas.ts` and its test from V3; edit `app/(app)/app/sales/page.tsx` and the headline component under `app/(app)/app/sales/_components/`. Period logic follows the existing previous/next period navigation.

**Test first (own commit; money).** A period with a missing Z report says "incomplete"; percent suppressed under the base floor; division by zero; a partial current period is compared to the same elapsed span, not the whole prior period. Failing commit first (extend V3's test file).

**Must not touch.** `app/(app)/app/books/*`, `getBooksData`, COGS code, `lib/pos/baselines.ts` anomaly maths, the sales URL-rewrite behaviour at 390 (known defect left for the owner).

**Owner-only prerequisites.** None.

**UX audit gate.**
- Journeys: J3, J4.
- Procedure: day, week and month views; an incomplete period; a brand-new bar with no prior period; 390 and 1440, light and dark.
- Pass bar: money screen: at least 32/40, zero P0 and zero P1. Sales scored an average of 24.5 on its earlier critique, so the pre-existing P1s on that screen (for example `$0.00 / 0 items / Never sold` for no-data periods) must be fixed or owner-decided for this gate to pass; the implementer is allowed to fix those inside this piece's two rounds.
- On fail: fix, re-audit, two rounds, then owner's list.

### D1. Data export and account deletion

**Goal.** Make the site's promise true: an owner can download their data and delete the account, without orphaned memberships and without destroying records that must be kept.

**Files.** A zip-of-CSVs export route built from `createClient()` (RLS applies) under `app/api/`; a deletion action in Settings (owner only, typed confirmation) with a pure `lib/account/deletion-plan.ts` and test listing every org-scoped table and the retention rule; extend the Settings page. Table list: the implementer enumerates from `supabase/migrations/` (about 30 tables; the base org tables are outside the repo, UNVERIFIED).

**Test first (own commit; tenancy and money records).** `deletion-plan.test.ts`: every org-scoped table appears; tables that inherit tenancy through a parent (`weigh_report_items`) are deleted via their parent; retained tax and payroll records follow a configured rule; memberships are removed last; deletion refuses for a non-owner and for an org the caller does not own. Export test: the zip contains only the caller's org. Failing commit first.

**Must not touch.** `lib/demo/purge.ts` and the demo sweep, Stripe code (cancelling a subscription is the owner's call in the portal), payroll maths, NACHA code.

**Owner-only prerequisites.** Counsel decides tax-record retention (no legal entity yet; the retention rule defaults to "keep payroll and tax records, say so plainly" until counsel answers). Or soften the site wording per claim A34 instead. Before the first paid bar.

**UX audit gate.**
- Journeys: J14 (Settings), J11 (the end of the customer lifecycle), J12.
- Procedure: export on a populated demo org; a deletion rehearsal on a throwaway org only (never the demo); the confirmation text; what the owner sees after; undo and retention wording.
- Pass bar: destructive and money-adjacent: at least 32/40, zero P0 and zero P1.
- On fail: fix, re-audit, two rounds, then owner's list; deletion stays disabled until it passes.

### T1. App-side 30-night trial and billing hand-off (blocked)

**Goal.** A trial clock that starts at the first non-backfill Z report, no card, and hands the remaining days to Stripe Checkout as `trial_end`.

**Status: do not start until** owner decisions 4, 5, 11 and 12 are made and a legal entity exists. The first ten bars are founder-led and do not need it.

**Files.** Migration `supabase/migrations/<timestamp>_org_trial.sql` (`organizations.trial_started_at`, nullable, additive, no-op until used; the code tolerates it being absent); `lib/billing/trial.ts` and `trial.test.ts`; edit `lib/billing/access.ts` and `access.test.ts`; `app/api/billing/checkout/route.ts` (`trial_end`; Stripe's minimum is UNVERIFIED); `markTrialStarted` called from the ingest route, the manual Z import action and `lib/2touch/poll-emails.ts` (COLLISION: all three are shared with the POS workflow, so only after it lands); `trial-banner.tsx`.

**Test first (own commit; money and access).** Not started; day 1; night 30; night 31; the 60-day backstop; a backfill-only org has not started; a demo org never starts; a running trial is allowed under `BILLING_ENFORCE`; an ended trial falls to `none`; comped and demo are unchanged. Failing commit first.

**Must not touch.** `BILLING_ENFORCE` (stays unset), Stripe webhook handling, price IDs, `docs/billing/README.md` steps, the ingest route's HMAC check and `pos_config` writers.

**Owner-only prerequisites.** Decisions above; apply the migration; Stripe account steps in `docs/billing/README.md`; `claims-register.md` entry before the page says "first 30 nights free, no card".

**UX audit gate.**
- Journeys: J11, J2, J3 (the banner).
- Procedure: trial day 1, day 29, day 31, past due, paid; billing tab; Stripe-hosted pages are out of scope.
- Pass bar: money: at least 32/40, zero P0 and zero P1; the copy after night 30 with enforcement off must not read as a threat or a lie.
- On fail: fix, re-audit, two rounds, then owner's list.

---

## 3. Final end-to-end audit (piece F)

After the last built piece, one audit of **all 14 journeys** in the inventory, in the inventory's risk order (J2, J5, J12, J9, J7, J4, J6, J3, J13, J8, J10, J14, J1, J11), using the procedure in its section 5 unchanged.

- Fresh agents. Reviewers are not the ones who audited any piece. Two isolated Impeccable reviewers per journey, a third on a spread over 3.
- Populated states the earlier audits could not see: a pending pay run (J5), a signed-in staff user (J9, never rendered signed in), an accountant (J10, role never walked), a manager (J4), a real second browser for sign-up (J2), a phone for every primary journey. If a role cannot be provisioned, say so and mark the journey UNVERIFIED rather than passing it. Add these to the owner's list.
- J13 (POS connect) is audited only if the Clover/Toast workflow has merged; otherwise it is listed as deferred with the reason.
- Pass bar: 32/40 average on money journeys (J4, J5, J6, J7, and the tie-out, count and billing screens), 28/40 on the rest; zero P0 anywhere; zero P1 on money journeys; the two P0s already on record for Payroll Review (the local-only "Confirm Payroll" button beside the real approval, and the post-approval change invisible while the ACH export stays unlocked) must be fixed or explicitly accepted by the owner before the cycle closes. They are not in any piece above because they are payroll approval logic, a separate piece the owner must authorise.
- Cross-cutting items to check once: no `error.tsx` or `global-error.tsx` exists under `app/` (inventory, J12). Adding one is cheap and affects every journey; it is **not** scheduled as a piece here, so this audit will keep failing J12 until the owner approves it. Raise it as the first item on the owner's list.
- Failing journeys get one fix round and one re-audit. Anything still failing goes to the owner's list with its evidence. Output: `docs/superpowers/findings/journeys/final-audit.md` with one row per journey (score A, score B, average, spread, P0, P1, pass or fail).

---

## 4. Owner decision list, in priority order

Everything below is the owner's to decide or do. Items 1 to 6 block sales; the rest unblock later pieces.

1. **Read the live Supabase auth settings and tell the agent both values** ("Allow new users to sign up", "Confirm email"). If sign-ups are open and S2 has not shipped, turn sign-ups off until it has; the founder creates early owners in the dashboard with "Auto confirm". This also blocks `/join` staff sign-ups and magic-link sign-ups for new people while it is off. (Signup spec section 9, step 1.)
2. **Run the `pg_policies` query** for `organizations` and `memberships` on the live project and send the output. (Section 9, step 9.)
3. **Choose the email sender**: which service, which from address, on a domain you own. Without it, confirmation mail comes from a generic address and may land in spam. (Decision 3; UNVERIFIED whether a domain is owned.)
4. **Public sign-up or invite-only for the first ten?** Default: ship `/signup` behind `NEXT_PUBLIC_SIGNUP_OPEN`, flag off. (Decision 1.)
5. **After merging S1: edit the two Supabase email templates** to the `/auth/confirm` link, and set Site URL and redirect URLs. **After merging S4: enable BotID.** (Section 9, steps 2, 4 and 10.)
6. **Is the 2Touch installer "book it" (founder-led) or self-serve?** Default: book it; self-serve means a public Windows binary that SmartScreen may flag (UNVERIFIED) and strangers to support. (Decision 6.)
7. **One owned bar per account for now?** Default yes. (Decision 2.)
8. **Setup defaults**: stop seeding the two placeholder reps (default), and remove pre-filled pay and tip defaults because they feed payroll (recommended). (Decisions 8 and 9.)
9. **Demo conversion carries settings only**, not items or staff the visitor added. Acceptable? (Decision 7.)
10. **Apply the V2 migration** (`counted_cash`) to dev then live, and compare the tie-out with one real 2Touch Z report. Confirm a first bar is willing to count a drawer for the audit.
11. **Authorise an error boundary piece** (`error.tsx` and `global-error.tsx`) and the two payroll-approval P0s from the Payroll Review critique. Neither is in this cycle unless you say so; the final audit cannot pass J5 or J12 without them.
12. **Counsel on retention for D1**, or soften the site's export and deletion wording (claims register A34). Before the first paid bar.
13. **Gmail daily send limit** for the weekly summary before it goes to more than a few dozen owners. (UNVERIFIED.)
14. **Trial terms** (T1): what a "night" is (recommendation: distinct Z dates with a 60 calendar-day backstop), whether a manually imported Z report starts the clock, whether the page may say "first 30 nights free, no card" (a claims-register entry), whether the founder's own bar takes one of the ten places and one of the three $99 places (needs a `comped` row), and whether `BILLING_ENFORCE` is ever turned on before the first ten pay. (Decisions 4, 5, 11, 12.) Needs a legal entity.
15. **Google sign-in**: not now (default), or build it. (Decision 10.)
16. **Provide the roles the final audit cannot reach**: a staff login, an accountant login, a manager login on a throwaway org, and a phone for the on-device checks.
17. **Real-bar numbers.** Replace the backlog's assumptions ($25 an hour, $8k to $15k monthly beverage spend, $99 to $199 a month) with answers from three or four first-bar owners about what their close and ordering actually take.

## 5. What this plan did not check

- No code was run and no test, build or lint was executed. The lint ceiling (44 problems, 12 errors) is the figure given in the task; it was not re-measured.
- Estimates (build days, dollar value) are the three source documents' own, not re-derived.
- File paths not named in the source documents are marked UNVERIFIED and must be located with the graph report before editing.
- The Clover and Toast work, and the uncommitted changes to `lib/pos/sync-health.ts` and `sync-health.test.ts`, were not read. Pieces that touch their files carry an explicit collision check.
- No browser was driven; the demo cookie jar was not tested; Supabase dashboard screen names are from the signup spec's memory and may have moved.
