# Universal read-only demo, results, 2026-11-27

Branch rebuild/foundation. Nothing pushed or deployed, and no migrations applied. Written only from the workflow step reports (diagnosis, D1 to D3, images, leftovers, two audits, gates). The commands in "Putting it on the live project" were also checked against the scripts in the repo; they have never been run on live. "Not in the data" marks anything the reports did not say.

## Read this first

- **Not ready to show an owner** (first auditor's verdict). Entry is fast, but pay runs, Sales Week and Month, Books and the Count "Matches" button are wrong. None of the audit findings was fixed afterwards: the gates step fixed only lint and restored a migration file.
- **Do not open the demo to the public on live yet.** The write guard lives only in the app's server and admin clients. The database trigger and `is_read_only` column the design calls the guarantee were not built. From code only, not attempted: the session cookie is readable by page scripts and the anon key is public, so a visitor could call Supabase REST or Auth directly. Writes would then depend on RLS (not inspected), and an Auth password change could break demo entry for everyone.
- **Anonymous visitors may be able to spend Groq quota.** "Read invoice" has no demo check (HTTP 500 in the audit; whether Groq was reached is unverified). AI Import was not run.
- **Refusal messages may not survive a production build.** Many come from thrown server-action errors (HTTP 500), which production is expected to mask. Only the dev server was tested.
- **Disclosure:** the diagnosis step queried the `.env.local` project before confirming it is the live one, against the task rules. Only counts were read; no rows, emails or ids were printed or saved. It found 3 demo orgs of 9 and 1 demo user there.

## What was built

| Step | Result | Commits |
|---|---|---|
| Design | `docs/superpowers/specs/2026-11-27-universal-demo.md` | f3f66dd |
| Write guard | The app's Supabase clients refuse writes, auth changes, storage writes and most RPCs for the shared visitor; the proxy returns 403 for non-GET `/api/*` except `/api/demo`; email, SMS and OTP senders refuse; notification dispatch sends nothing. Fails closed. | 8338377, b82e22e |
| Seed | `npm run demo:seed` (idempotent, refuses anything but dev unless `--allow-remote`), three bars (rail-demo-tavern, -lounge, -corner), shared user `shared-visitor@demo.example`, refresh in the daily cron (20 s cap). Seeded on dev; a second run gave identical counts. | 1ed3528, a14992d |
| Entry | One sign-in, no per-visitor user or org; limit 300 per address per hour (was 3); banner "Sample bar, nothing here changes."; sign-out is local; expiry removed; old sweep excludes the new bars; `npm run demo:retire` (dry run by default). | 4070f31, 6ab579b |
| Inventory icons | 33 SVG placeholders, 15 more demo items | 6aa7777, eae4d70 |
| Fix-pass leftovers | Copy, 44px targets, contrast, staff error home, `SUPPORT_EMAIL` | 305f486, 5bf8d3b |
| Gates | Lint back to baseline; emptied `20261125000300_inventory_apply_count.sql` restored from HEAD (cause not found) | 6578b93 |

Final gates: typecheck pass; test 127 files, 1774 tests pass; audit:scope pass; lint 42 problems (12 errors, 30 warnings), the known baseline. Build and audit:tokens were not rerun (the 2 known token failures remain).

## Load time

**Before: not measured end to end** (running the old flow would have created a user and three orgs). Estimate: about 185 sequential database calls per visitor, about 40 s from this Mac (0.22 to 0.35 s per call), and 6 to 18 s of waiting on Vercel before cold start.

**After, local dev server against the dev project, already warm:**

| Source | Samples | Result |
|---|---|---|
| Build step | 5 runs, 390 and 1440, light and dark | API 0.38 to 0.67 s; navigation committed 0.88 to 1.25 s; banner visible 0.94 to 1.32 s |
| Audit 1 | 3 entries | Dashboard heading 2.14, 1.34, 2.09 s (median 2.14); network idle 2.68 to 3.14 s |
| Audit 2 | 1 entry | Dashboard URL 1.4 s; settled 2.7 s |

The build step met its 1.5 s target; two of audit 1's three entries did not. Cold-start and production times are unverified.

## Putting it on the live project (owner only, never an agent)

**Before running anything**

1. Close the direct-to-Supabase write path (database trigger from the design, or a checked RLS answer). Fix or accept the blockers below.
2. Live needs every table and column the seed writes. Whether live has them is not in the data. The seed is not one transaction, so a failure can leave a sample bar half filled; it can be rerun.
3. The daily cron calls the same refresh, so once this is deployed it creates or rewrites the `rail-demo-` bars on that project even if you never run the command. If `DEMO_USER_PASSWORD` is not set there when it first creates the user, the password is random.
4. Set `DEMO_USER_PASSWORD` in the Vercel production environment, to the same value you use below. Without it and a seeded bar, Try the demo says "The sample bar is unavailable right now."

**Terminal setup.** The scripts also load `.env.development.local`. Values already set in your shell win, so set all three. If you skip the password, a dev password in that file would be applied to the live demo user. `read -s` keeps secrets out of shell history. These are zsh commands.

```bash
cd /Users/xavierdichiara/bar-app
read "NEXT_PUBLIC_SUPABASE_URL?Live Supabase URL: "
read -s "SUPABASE_SERVICE_ROLE_KEY?Live service role key: "; echo
read -s "DEMO_USER_PASSWORD?Demo password (same as on Vercel): "; echo
export NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY DEMO_USER_PASSWORD
```

`--allow-remote` switches off the dev-only check completely: the script writes to whatever URL is set. Check the URL. The design's separate `--i-understand-this-is-live` flag was not built.

**Seed, dry run first.** The seed dry run only lists planned row counts. It does not read or write the database, so it does not prove live is ready.

```bash
npm run demo:seed -- --dry-run --allow-remote
npm run demo:seed -- --allow-remote
```

Then deploy (your decision) and try the button once.

**Retire the old demo orgs, dry run first, and only after the new demo works.** This dry run reads live and deletes nothing.

```bash
npm run demo:retire -- --allow-remote
```

Check `mode` says DRY RUN, and compare `orgsToDelete`, `usersToDelete`, `protectedOrgsSkipped` and the totals with what you expect (the diagnosis counted 3 demo orgs of 9 and 1 demo user on live; that may have changed). It prints counts, not names. Orgs with a member who is not an old demo user are skipped. Deleting cannot be undone.

```bash
npm run demo:retire -- --apply --allow-remote
unset NEXT_PUBLIC_SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY DEMO_USER_PASSWORD
```

On dev, only the dry run has run: 22 orgs and 12 users would be deleted, 0 protected, of 25 orgs and 13 users. `--apply` has never run anywhere.

## Audit blockers (open)

**P0**
- Pay runs show false changes. Tavern pending: $2,637.50 to $6,702.00 (+$4,064.50). Lounge approved: $2,444.25 to $10,053.90 (+$7,609.65), with $0.00 tips in the frozen view and ACH export unlocked. Cause: `lib/demo/universal.ts` builds the snapshot with no tips; audit 2 also found an overtime split the live figure does not have.
- Count "Matches" blocks saving the whole count ("enter zero or more"). This is product code (`count-session.tsx`), so it affects real bars. Reproduced.

**High**
- Sales Week and Month show $0.00 and 0 items on all three bars: the seed writes no `pos_item_sales`.
- Books is not believable: Tavern cost of goods $361, pour cost 0.9%, gross margin 99.1%; Corner Pour $0 and 0.0% (no shipments).
- The export zip's `inventory_items.csv` and `weigh_report_items.csv` are empty despite data (audit 2; RLS is an inference). README shows raw "Could not find the table" errors for 5 tables. Treat as P0 if it happens on live.
- POS status contradicts itself: header "connected", checklist "Connect your POS, to do", Settings "authorization required".
- A Sales night with no report shows $0.00 tips owed and blames the POS provider.
- Light-mode contrast failures on Tips flags (as low as 1.56:1), Inventory Analytics, Payroll week and month, and the 404 pages.
- At 390 the More drawer does not take focus or close on Escape.
- The Billing tab logs an `org_billing` console error (the dev error badge can show).
- Refusals that mislead: count save, send order, staff sign-up, Hide for now. Silent: notification preference, Mark all read.
- Add item with only a name does nothing (cause read from code; would affect real bars).

**Lower:** data one day stale on dev (no cron there); every bar's headline night is 51 to 63% below average; `shared-visitor@demo.example` shows in Team and as approver; at 390 the bar name is cut to one letter and the notification panel is clipped; many targets under 44px; em dashes on several screens; "Latest Shipment" (entry date) and Shipments (invoice date) show different unlabeled dates; "Make this my bar" leads to invite-only sign-up.

**Report differences:** on the 390 sideways scroll, the demo-entry and icon steps saw 5px, the leftovers step says it fixed it, and audit 1 found none on 68 loads. Separately, audit 1 saw the drawer card say counting is not switched on (Nov 21). Audit 2 saw an hour-by-hour curve on the Day view from seeded hourly data.

## Journey scores

Audit 2, 40-point scale, one auditor (differences under about 3 points mean nothing). Not comparable with certainty to the 2026-11-26 scores.

| J1 | J2 | J3 | J4 | J5 | J6 | J7 | J8 | J9 | J10 | J11 | J12 | J13 | J14 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 33 | 28 | 23 | 25 | 16 | 17 | 27 | 29 | 23 | 21 | 22 | 24 | 19 | 21 |

Audit 1, out of 10: verdict 4; entry 9; screen sweep 7 (17 routes, 68 loads, all 200, no load-time console errors); dashboard 6; Sales 3; payroll week 6; payroll review 2; tips 7; inventory list 7; count 2; weigh 7; shipments 5; reps 6; Books 3; tax 6; settings 5; bar switcher 8; write guard in the UI 5.

## Safe to demo

Replaces the 2026-11-26 list. Local dev; see the production caveat above. "Safe" means no known blocker on what is listed, not fully tested.

- Landing page and Try the demo.
- Bar switcher with three bars (works, different data; at 390 the bar name shows one letter, so use the laptop).
- Inventory list and its icons (look only).
- Weigh: the seeded report.
- Reps list and the order dialog, to look at only.
- Tips Totals, in dark mode or on a short look (flag colours fail contrast in light; leave Well Performance closed).
- Payroll week, stepped back to the previous week (7 people, $6,813 when audited). Do not open Review.
- Sales Day view on a night that has a total (totals, hours and servers). Top movers and What sold are empty, so stay at the top.

## Avoid

- Payroll Review, both pay runs, NACHA.
- Sales Week and Month, today, and nights with no report; Sales "Tonight".
- Books.
- Count: do not tap Matches or Save.
- Read invoice, AI Import, Log a shipment; Corner Pour shipments and Books.
- Send order, mark paid or any other save. Hide for now, notification settings, Mark all read, staff sign-up.
- Settings POS, Billing, Data export, Team.
- Dashboard setup checklist ("Connect your POS, to do"). Check the Last night date first.
- Inventory Analytics in light mode; Add item.
- The More drawer by keyboard.
- /me, /join, accountant view, paywall, Clover and Toast. Do not claim Clover or Toast work.
- Make this my bar.

## Not done or not verified

- Database trigger, `is_read_only` column, refresh-when-stale-on-view, `friendlyDbError` sweep.
- Writes not driven: Pay remaining, shift adjust and add, post shipment, edit item and rep, well assignment, AI import, data import parsers, POS update, disconnect and report check, push enable, deletes, Inventory settings, deal create.
- Not walkable from the demo: sign-up and setup, accept-terms, join, staff and accountant views, billing checkout and paywall, real POS connections.
- No axe or screen reader run; keyboard barely tested. Demo not tested over time; the cron refresh was not run. NACHA and CSV not downloaded; tax forms not generated.
- Supabase's own sign-in rate limit under heavy traffic (visitors would get "unavailable").
- Seed gaps: department, register and card-type sales not seeded; tax has no separate settings table.
- Icons: no "only when there is no real image" branch (no image field found); Weigh icons use the name only.
- Leftovers: /setup, error screens, /me, Tax printouts and connected POS cards not viewed; some owner-facing AI, email and SMS errors still name env vars; production build not run. Set `SUPPORT_EMAIL` and redeploy (users still see the gmail address).
- Older owner steps in `2026-11-26-fix-pass-results.md` and `2026-11-25-cycle-results.md` were not re-checked; its "start a fresh 24 hour demo" step no longer applies.
