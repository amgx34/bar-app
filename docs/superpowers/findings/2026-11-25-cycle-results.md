# Value cycle results, 2026-11-25

Branch `rebuild/foundation`. Nothing was pushed, deployed or applied. Plan: `docs/superpowers/plans/2026-11-25-value-cycle.md`.

**Truncation notice.** The data handed to this write-up was cut off in four places: the V1 entry (and any pieces after it), Final Audit A after J3's note and J5 (J6, J7 and the rest are missing), Final Audit B after J13's first blocker, and the journeys beyond J13. Those rows are marked "not in the data". Nothing was invented to fill them. Re-run the final audit summary to complete them.

## Pieces

| Piece | Audit score (of 40) | Fix rounds | Result |
|---|---|---|---|
| S1 Auth redirects, error codes, confirm route | 33 | 1 | Pass |
| S2 Gate /setup, harden create-bar, three-question form | 33 | 1 | Pass |
| S3 Sign-up page behind NEXT_PUBLIC_SIGNUP_OPEN | 33 | 1 | Pass |
| S4 BotID on sign-up, create-bar, demo | 33 | 0 | Pass |
| S5 Setup checklist and 2Touch pairing step | 33 | 2 | **Open** (one blocker, below) |
| S6 Demo conversion banner and prefill | 33 | 0 | Pass |
| V1 POS feed went quiet alert (pos.feed_stale) | 33 | 1 | Pass |
| Later pieces after V1 | not in the data | not in the data | not in the data |

Commits (test first, then change): S1 `c107621`, `609e8dc`. S3 `be5441a`, `80ec0d9`. S4 `cc299eb`, `a3c3aeb`. S5 `c6abf35`, `c651546`. S6 `824081c`, `9138b24`. S2 and V1 commit hashes were not in the data.

## Final gates

Typecheck pass. Tests pass (115 files, 1611 tests). `audit:scope` pass (277 chains scanned, 29 justified, 0 unscoped). Build pass. Lint exits non-zero with 42 problems (12 errors, 30 warnings), which is the known baseline. `audit:tokens` fails on the 2 known light-mode pairs (border-strong and input on background, both 3.00:1 against a 3:1 requirement); light is 26/28, dark 28/28. Working tree clean.

Reviewed in the log since `12ddf89` (about 45 commits, 120 files): only two migrations added; sign-up is closed unless `NEXT_PUBLIC_SIGNUP_OPEN` equals `true`; no billing files touched; 2Touch ingest auth untouched; no new secret logging.

## Final journey scores

Scores are single-auditor estimates, not two-reviewer averages. Pass bar for money screens is 32.

| Journey | Score | Main blocker |
|---|---|---|
| J1 First-time visitor | 30 | Sign-up closed by design, so no "become a customer" path; small inline links |
| J2 New owner sign-up and setup | 29 | Happy path never run end to end; /setup has no page title and 3 unlabeled hidden inputs |
| J3 Daily owner | 30 | Sales URL rewrites on first load at 390; demo Sales page mostly explanatory text |
| J4 Manager close | 28 | Tie-out card ("Did the drawer tie out?") not exercised |
| J5 Payroll run | 30 | No error boundary; approve, diff, NACHA gate and Pay remaining dialog not driven |
| J6, J7 | not in the data | not in the data |
| J8 Rep ordering | 21 | Developer wording in a failed-email toast; unlabeled order inputs; email failure only a toast |
| J9 Staff portal | 24 | No h1 on /me; tiny Sign out; staff sign-up off looks like a typo |
| J10 Accountant | 22 | Role never walked; shared temporary password onboarding; unlabeled money inputs on Tax |
| J11 Billing and cancelling | 27 | Paywall hides Settings Data (export, close bar) |
| J12 Support and error recovery | 15 | No error.tsx or global-error.tsx anywhere |
| J13 POS connect and monitor | 24 | Settings POS tab prints a Clover env var name to owners (rest of the entry truncated) |
| J14 onward | not in the data | not in the data |

## Open blockers

1. **S5 (fails the audit).** `/setup/pos` chooser cards, Continue, and the pairing step (textarea, Copy code, Go to dashboard) in `app/(app)/setup/pos/_components/pos-selector.tsx`. On the always-dark sidebar the global focus outline uses `--ring`, which is `#1E40AF` in light mode: 2.05:1 against the sidebar and 1.64:1 against the selected tint, under the 3:1 minimum. Keyboard focus is nearly invisible on a light-mode device. Dark mode (`#7EA6FF`) is fine. Computed from tokens, not rendered.
2. **J12/J5/J8 (P0/P1).** No `error.tsx` or `global-error.tsx` under `app/`. The plan holds this for owner approval.
3. **J8.** `order-dialog.tsx` tells owners "Check GMAIL_APP_PASSWORD in settings" (no such setting); order inputs and trash button unnamed; 5-column grid too tight at 390; inputs h-8.
4. **J12.** Raw server-action messages in toasts; no help or contact route in the app shell.
5. **J9.** No h1 on `/me`; Sign out is text-xs; staff sign-up off reads as "code not recognised".
6. **J10.** Unlabeled inputs on `/app/tax` (3), `/app/payroll/employees` (1), settings tabs (1 to 2 each); shared temporary password in Team tab; accountant role not walked.
7. **J11.** The paywall in `app/(app)/app/layout.tsx` replaces Settings Data, so a blocked owner cannot export or close. No support email shown.
8. **J13.** Clover card prints `CLOVER_CLIENT_ID` to owners (remainder truncated).
9. **J2.** `/setup` lacks a page title and has 3 unlabeled hidden inputs. `/pricing` copy bug: missing space before the ternary sentence ("money.Sign up", "money.Rail is invite only"); fix before the flag goes on. Duplicated "Settings, Billing" sentence; flag-off shows two buttons to `/#contact`.
10. **S4.** A human wrongly flagged as a bot has no way out (message says retry, no contact line).
11. **J3.** Sales URL rewrite at 390 (smoke defect 6).
12. **J4/J5.** Tie-out and payroll approval paths unexercised; CSV and NACHA buttons shown before approval.
13. Minor contrast and copy items per piece (e.g. login "or" divider white/40, setup placeholders white/55, em dashes in "Signed in — taking you...", "You are already signed in — taking you...", and "Step 2 of 2 — this determines..."). Full lists are in each piece's audit.
14. Pre-existing lint baseline and the 2 light-mode token pairs.

## Owner steps, in order

**A. Before anything is deployed**
1. Merge the branch yourself (nothing was pushed).
2. Supabase SQL editor: `select schemaname, tablename, policyname, cmd from pg_policies where tablename in ('organizations','memberships');` and send the output (shows whether a signed-in user could insert an org or membership with the anon key; until then the gate is code-side only).
3. Supabase dashboard: report the live values of "Allow new users to sign up" and "Confirm email". If S2 is not deployed yet, turn "Allow new users to sign up" off. If "Confirm email" is off, the verified-email gate does nothing.

**B. Migrations (written, not applied; code works without them), in this order**
1. `20261125000000_employees_archived_at.sql` (archive; apply to dev first, then live, then test archive and restore)
2. `20261125000050_pos_credentials.sql`
3. `20261125000100_org_billing.sql`
4. `20261125000200_add_counted_cash.sql`
5. `20261125000300_inventory_apply_count.sql`

Items 2 and 3 are listed from the migrations folder; this cycle's data did not say whether they belong to the cycle. No migration is needed for S2, S5 (`onboarding_dismissed_at` is a new JSON key) or V1. Optional later: a unique index for one non-demo owner membership per user, to close the double-submit race.

**C. Supabase dashboard**
1. Set Site URL and redirect URLs (signup spec section 9, step 2).
2. After S1 is merged and only then: edit "Confirm signup" template to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/setup`.
3. Edit "Magic Link" template to `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=magiclink&next=/app/dashboard`.
4. Custom SMTP with a from address on a domain you own (decision 3); minimum password length 10.

**D. Env vars and Vercel**
1. Deploy. Then Vercel project, Firewall, Configure, enable BotID (Basic; Deep Analysis optional). Smoke test as a human: demo button, sign-up (once the flag is on), create-bar. If a real owner is blocked, turn BotID off. Check the console and CSP report-only output on first deploy.
2. Set `NEXT_PUBLIC_SIGNUP_OPEN=true` only when you want public sign-up, and only after A to C are live. It is inlined at build, so redeploy after setting it. Leave it unset in production until then.

**E. Decisions and copy to approve**
1. Decisions taken by default, say if any should change: one owned bar per account (2), no placeholder reps (8), no pre-filled pay defaults (9), settings-only demo carry-over (7).
2. Decision 6: is the 2Touch installer self-serve or "book it"? Add a booking line to the pairing screen once decided.
3. Approve: sign-up subtitle (does not say free), landing hero copy after the claims-register decisions, checklist and pairing wording.
4. Fix `/pricing` spacing before the flag goes on.
5. Run one real demo to sign-up to email verify to `/setup` pass with an inbox you control.

Not repeated here: the earlier owner list in `OVERNIGHT-LOG.md` (claims, key rotation, counsel, Apple, etc.) still stands.

## Unverified

- No sign-up or magic-link was submitted, so email delivery, the confirm link, token_hash verify with the membership redirect, and the post-confirm redirect to `/setup` are untested. Create-bar (verified check, rate limit, insert, rollback, race re-check, terms record, seeding) is untested end to end.
- `options.data.prefill` surviving the email link into `/setup` is untested. Behaviour of `signUp` with a demo cookie present is untested.
- Server action wrappers (flag-off refusal, honeypot, create-bar) have no tests; read only. The repo has no server-action harness.
- Supabase error wording is matched by regex (pkce, flow state, already used, expired) and may differ by version; a used link may show as expired. "Send me a new link" from login still sends a same-browser link until the template edits.
- Whether Supabase returns `identities: []` for a registered address is assumed from the spec.
- RLS on `memberships` (own-owner-rows read) is assumed. Live "Confirm email" value is unknown.
- BotID: only the mocked bot path is tested; dev always returns human. Whether Server Actions are covered by the client-side protect paths is assumed and must be checked on a preview deployment.
- S5: the pairing step and the Hide write were not exercised. The 7-day "live night" window is a judgement call. A paired agent that never checks in shows as waiting, not broken. The S5 focus-ring ratio was computed, not rendered.
- S1, S2, S3, S6: mostly not viewed at 390 and 1440, dark mode or with a screen reader; the flag-ON form and check-email state were never rendered. Dev overlay "script tag while rendering ThemeProvider" (next-themes with React 19) hid some states.
- J4 tie-out, J5 approval flow, J9 /me and /me/pending (no staff session), J10 accountant role, J11 paywall and Stripe, J8 order dialog send were judged from source or not reached.
- Final gates: integrations were reviewed in source, not run with env vars unset. The `NEXT_PUBLIC_SIGNUP_OPEN=true` path has not been exercised. Migrations were not run against a database; `audit:scope` is a static scan.
- Demo cookie jar state was not checked in the final gates run.
- Not in the data: V1 details beyond its pass, later pieces, J6, J7, J13 remainder, J14 onward.
