# Fix pass results, 2026-11-26

Branch rebuild/foundation. Nothing pushed, deployed or applied. Built only from the fix-pass, demo-walk, audit and gate reports. Anything the reports did not say is marked "not in the data".

## Fixes

| ID | What changed | Commits | Not verified |
|---|---|---|---|
| F1 | Error boundaries (`app/global-error.tsx`, `app/error.tsx`, `app/(app)/app/error.tsx`, shared `error-panel.tsx`). Calm copy, 44px Try again and Back to dashboard, support email, digest shown as a reference code, never `error.message`. Retry uses `unstable_retry()` per the Next 16 docs (deliberate change from the task text). | 1fc1430 | (app) boundary at 390 came back empty and was not re-run; global-error never rendered; dark contrast by eye; audit:scope not run |
| F2 | Focus ring on always-dark surfaces, /setup title and labels, placeholder and divider contrast, em dashes removed from named strings, sidebar-ring pair added to audit:tokens. | 43557e4 | /setup and /setup/pos not rendered; em dashes remain in join/actions.ts and clover/toast setup pages; no CSS test |
| F3 | Rep order: failed send now shows a plain "Saved, not sent" panel and saves as draft (amber badge in history), SMS failures reported, raw errors hidden, inputs labelled and 44px, 7 unit tests failing first. | 5a78eb2, 2a36677, 3fcca6f | Not checked in a browser; desktop column headers removed (placeholders only); lint errors in order-history-sheet.tsx left alone |
| F4 | Paywall keeps Data and Billing open for a blocked owner, plain POS copy (no env var or cron wording), bot-block message with support email, NACHA button disabled before approval with a visible reason. | Test: paywall access mapping (failing first); Owner dead ends commit (hashes ad26db8, 0f0c764 per git log) | Paywall screen never rendered (BILLING_ENFORCE off); 2Touch reports address no longer shown in-app |
| F5 | Labelled selects, Base UI nativeButton console error fixed, /me h1 and 44px sign out, /join bad-code copy, payroll review title, /pricing copy, small link targets, Latest Shipment joined by shipment_id with a pure tested helper. | f4d08ba, 7c86e5e | /me not viewed (no staff session); shipment card not seen with real void data; whole-repo lint not run |
| Demo prep | Migration prefix made unique (20261125000050), bare /app redirects to /app/dashboard, Sales night view gets a labelled "Sales for the night" headline, walkthrough written at `docs/demo/bar-owner-walkthrough.md`. | aff7eb3 | Org switcher with three bars not driven; dark screenshots not individually inspected; headline card has no test |

## Final gates

- typecheck: pass. test: 118 files, 1626 tests, pass. build: pass.
- audit:scope: pass (278 chains, 29 justified, 0 unscoped).
- lint: 42 problems (12 errors, 30 warnings), equal to the known baseline, exit 1.
- audit:tokens: light 27/29, dark 29/29; only the two known fails (border-strong and input on background, 3.00:1 against 3:1).
- No code changed in the gate step.

## Journey scores (40-point scale, single auditor, not a two-reviewer average)

| Journey | Score | Remaining blockers |
|---|---|---|
| J1 First-time visitor | 31 | Sign-up closed by design, so only Request a demo or Try Demo; 8 em dashes on the landing page; footer and Back to Rail links 24px high at 390 |
| J2 New owner sign-up and setup | 30 | Happy path never run end to end; Terms checkbox 20px and selects about 40px on /setup; /join inputs 32px; email confirmation, bot check and /setup/pos unverified |
| J3 Daily owner | 26 | Demo session expired (banner on every screen); dashboard reads as a dead bar on stale data; Sales URL rewrite at 390 (by design); Sales today mostly empty and mentions the agent; floating + overlaps cards; Sales tabs 32px; no h1 on Sales at 1440 dark |
| J4 Manager close | 25 | Close flow and tie-out never exercised, money path unverified; Log cash tips button 32px |
| J5 Payroll run | 28 | Approve, diff, Pay remaining and NACHA download not driven; Payroll opens on a day with no shift data; employee checkboxes 13px, some fields under 44px; payroll sub-pages share one h1 |
| J6 Inventory count | 29 | Saving a count and its stock and COGS effect not driven; search, filter and chips 36px; save bar covers the last row at 390 |
| J7 Delivery logging | 25 | Shipments empty on the demo, so the shipment_id fix cannot be shown; dialog has no visible manual entry and needs the AI parse; textarea has no visible label; em dash in placeholder; review, post and tie-out unverified |
| J8 Rep ordering | 31 | PO number, date and notes inputs have no programmatic label and are 36px; six blank rows on open; failure state not exercised |
| J9 Staff portal | 24 | /me not rendered (no staff login); /join inputs 32px; root error boundary sends staff to /app, which they cannot use |
| J10 Accountant | 22 | Accountant role never walked; unnamed inputs on /app/tax, payroll employees and Team (the F5 fix is reported after this audit, so recheck); AA failures on Books COGS and Labor; em dashes on Tax, Books, payroll review |
| J11 Billing and cancelling | 24 | Checkout, cancel, portal and paywall cannot be exercised (demo exempt); org_billing lookup error on the Billing tab because that migration is not applied |
| J12 Support and error recovery | 26 | Error boundaries not rendered in the audit; /app/no-access shows the demo email and vague copy; support address is a personal-looking gmail address; no in-app help route |
| J13 POS connect and monitor | 22 | /setup/clover still prints env var names; Clover card text overlaps and is garbled at 390; Toast fields 32px and a missing space; pale skip link on the gradient; em dashes in Clover copy; real connect and sync states unseen |
| J14 Data export and close | 27 | Zip download, export states and close dialog not exercised; expired-demo banner on every screen |

Caveats on the table: J1 to J7 were audited before some F-fixes landed, and J8 to J14 were audited after F1 to F4 but the audit reports and fix reports do not say in what order they ran. Treat items already fixed above (for example J10 unlabeled inputs, J13 Settings copy) as needing a recheck. Which audit saw which fix is not in the data.

## Safe to demo

- Landing page, Request a demo path, and the honest "invite only" signup card.
- Dashboard, Tips, Books, Settings Data tab and Pricing: clean at 390 and 1440 in light and dark, no console errors, no horizontal scroll (on a fresh demo).
- Inventory count (/app/inventory/count): clear, 44px controls.
- Payroll review page for reading, with the NACHA button visibly disabled and explained.
- Sales: use the Day tab and arrows to the day with data; the "Sales for the night" headline shows there.
- Rep order dialog for looking at the form only, not sending.
- 404 page.
- Follow `docs/demo/bar-owner-walkthrough.md` (script, do-not-click list, questions, checklist).

## Avoid in the demo

- The expired demo in the cookie jar. Every screen shows "This demo has ended".
- Sales Tonight (no number for today in the seed) and Payroll opening on today (dead end; step back a week).
- Sending a rep order, Read invoice / shipments, saving a count, submitting or approving a pay run, NACHA download, export download: none were driven, and the money path is unverified.
- /setup/clover and Settings POS Clover card at 390 (env var names, garbled text), Toast connect.
- Billing tab (org_billing error overlay in dev) and the paywall.
- /me, /join, accountant view, staff flows (never rendered).
- Forcing an error to show the error boundaries (only rendered via a temporary route at 390 light and 1440 dark; (app) boundary at 390 and global-error unseen).
- Org switcher with three bars (not driven).
- Do not claim Clover or Toast work: fixtures only.

## Owner steps outstanding

1. Start a fresh demo right before the meeting (the demo lives 24 hours). The fix pass was not allowed to POST /api/demo. Then check the dashboard "Last night" text on the fresh data.
2. Apply the pending migrations, including the org_billing one and the renamed pos_credentials migration `20261125000050`. Not applied by this pass. Whether other migrations are pending is not in the data.
3. Walk the unverified paths with real accounts: staff login for /me, an accountant login, a flow-on signup (`NEXT_PUBLIC_SIGNUP_OPEN=true`) with email confirmation, a pay run submit and approve, a count save, a shipment post, and Billing with enforcement on.
4. Replace the personal-looking support address shown to owners with a proper one (the audit flagged it; where it is configured is not in the data).
5. Remaining copy and target cleanup listed above: em dashes (landing, Books, Tax, Clover), 44px targets on /join, /setup selects, Sales and Payroll tabs, Toast fields.
6. The full ordered owner-step list is in `docs/superpowers/findings/2026-11-25-cycle-results.md`; its contents are not in this pass's data. Public sign-up stays off, and Clover and Toast stay off the front page until a sandbox run.
