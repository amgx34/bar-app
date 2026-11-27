# Walk findings, merged (2026-11-25)

Sources: walk-stock, walk-people, walk-rest (all 2026-11-25), plus the run's structured findings. Spec: `docs/superpowers/specs/2026-11-24-rail-rebuild-design.md`. Dev project only; nothing fixed, staged or committed. Where a finding says "unconfirmed", the walk did not verify the cause.

Counts: P0 0, P1 5, P2 17, P3 17. No P0 was confirmed; the tips discrepancy (#2) becomes P0 if it is not a seed artifact.

## Findings (P0 first)

| # | Sev | Route | Viewport | What happened | Suspected cause | Money/tips/stock/tenancy |
|---|---|---|---|---|---|---|
| 1 | P1 | `/app/payroll (week, Pay remaining)` | both | After "Pay remaining 6" (toast Paid 6 people $6,899.75) the payout bar says Paid out 5 of 7, advanced $3,046.11, still owed $0.01; Wes Berns and Jordan Park show amber "$X of $X" instead of paid. Dialog then says 7 already settled. Persists after reload. | summarizePayouts in lib/payroll/payouts.ts uses balance <= 0 with no tolerance; planBulkPayout uses <= 0.005, so sub-cent residue splits the two. | YES |
| 2 | P1 | `/app/payroll (day/week), /app/tax` | both | Tips distributed in payroll exceed Z-reported tips: 11-19 day $1,596 vs $1,212; week 11-16..22 $5,349 vs $4,389 (diff $960); November $10,208 vs $8,416 (diff $1,792 = Danny Rivera total tips). Tax Report year tips $8,428.34 is less than one month of payroll tips. Possibly individual-mode tips added on top of Z total; may be a demo seed artifact. | Unconfirmed: payroll tip allocation vs z_report_days.cash_tips+cc_tips. Owner to review (P0 if not a seed artifact). | YES |
| 3 | P1 | `/app/payroll/employees` | both | Delete employee: confirm accepted, toast "removed", but row remains after hard reload; no error. | deleteEmployee uses RLS client; a delete filtered to zero rows returns no error and UI treats it as success (possibly no DELETE policy). | YES |
| 4 | P1 | `/app/settings (General)` | both | Bank routing number accepts any digits (12345 saved with "Saved" toast and persisted); required marker yet blank also saves. Feeds NACHA. | No length/checksum validation client or server side. | YES |
| 5 | P1 | `dev environment` | n/a | Blank GMAIL/TWILIO/GROQ in .env.development.local do not override .env.local; dev server uses live third-party keys. Secrets from .env.local were printed to a walk session terminal by a grep; consider rotating. | Next env loading: a blank value does not override an earlier-loaded .env.local. | no |
| 6 | P2 | `/app/analytics` | both | Uncaught "Rendered more hooks than during the previous render" on every load (4/4); /app/inventory/loss redirect showed it 1 of 5 loads. Page still renders. | Redirect page plus loading.tsx Suspense boundary; unconfirmed. | no |
| 7 | P2 | `/app/inventory` | 1280x800 | Adjust stock below zero is refused (stock unchanged) but as an unhandled 500 with no message in the dialog. | adjustStock throws, dialog has no error handling. | YES |
| 8 | P2 | `/app/inventory/weigh` | 1280x800 | Add bottle with levels outside 0-1 returns 500 from DB check constraint; form stays open, no message; no server-side validation. | addWeighItem rethrows raw DB error. | no |
| 9 | P2 | `/app/inventory` | 1280x800 | Latest Shipment card after a void lists the voided item and manual delivery adjustments as shipment lines. | Card built from usage_logs by date rather than shipment_id. | YES |
| 10 | P2 | `/app/inventory` | 1280x800 | Top Sellers and Biggest Losses charts show identical bars and names on a 0-1 axis. | Data source or chart wiring, not investigated. | YES |
| 11 | P2 | `/app/inventory/shipments` | both | Log-shipment dialog line table is wider than the dialog; unit cost, line total, price change columns cut off at 1280 and 390. | Non-responsive table in dialog. | YES |
| 12 | P2 | `/app/tax (Tax Report)` | both | FUTA estimate is flat $42 per employee ($336 for 8) regardless of wages, counting a $0-wage and a $288-wage employee the same. | futaEstimate = count*7000*0.006 in app/(app)/app/tax/actions.ts, no min(wages, base). | YES |
| 13 | P2 | `/app/tax (W-2, 1099)` | 1280 | W-2s generate with blank EIN/address/state, include a $0-wage employee; 1099 Load Workers lists staff despite W-2 warning while all employees are Unclassified. | No employer-field validation, no zero-wage filter, 1099 list not filtered on classification. | YES |
| 14 | P2 | `/app/payroll, /app/payroll/direct-deposit, /app/tax` | both | Warning body text is pale yellow on cream, very low contrast. | Warning token colour used for body text on tinted background. | no |
| 15 | P2 | `/app/tips?tab=well` | 390 | Page scrolls sideways (436 vs 390); Options button clipped at right edge. | Date row does not wrap at phone width. | no |
| 16 | P2 | `/app/payroll/direct-deposit and other server actions` | both | Validation and SMS failures are thrown from server actions: 500 plus console error; toast shows message in dev. SMS send fails safely (Twilio blank), nothing sent. Production masks thrown messages. | saveAdminPhone/sendOTPSms throw Error rather than return a result. | no |
| 17 | P2 | `/app/books vs /app/sales` | both | Books shows $42,400 revenue for Nov; Sales shows $0.00 / 0 items for the same month with a misleading "no cost price" message. Books also shows COGS $0, 100% gross margin. | Different sources (z_report_days vs pos_item_sales); seed has no item sales. | YES |
| 18 | P2 | `/app/books` | both | Add expense with empty/negative amount returns HTTP 500 and shows raw Zod JSON array as the error. | Action throws ZodError instead of returning a message. | YES |
| 19 | P2 | `/app/settings, /app/books` | both | Placeholders (tax rate 8.25, routing, EIN) look like saved values while Books says tax not configured. | Placeholder styling. | YES |
| 20 | P2 | `/app/sales` | both | Default "The night" is 2026-11-24 but the Tonight tab goes to 2026-11-25. | Business-date cutoff vs calendar date mismatch. | YES |
| 21 | P2 | `/setup` | both | Setup form renders to signed-out visitors; submit gives "Not authenticated" toast and 500. | proxy.ts gates only /app and /me. | no |
| 22 | P2 | `/app/no-access` | both | Base UI nativeButton console warning; support link is mailto:support@yourdomain.com placeholder. | Button render=Link without nativeButton=false; placeholder. | no |
| 23 | P3 | `/app/inventory/shipments` | both | After Post shipment the dialog stays open reset to paste step; easy to double-post. | Dialog not closed on success. | YES |
| 24 | P3 | `/app/inventory vs /app/inventory/shipments` | 1280x800 | Items page Latest Shipment shows seeded deliveries while Shipments page says none logged. | Seed deliveries have no inventory_shipments row. | YES |
| 25 | P3 | `/app/inventory/analytics` | 1280x800 | Par compliance 0%, runways of ~1000 days, Setup says no POS sales while Fast Movers shows velocity; donut and shrinkage pie looked clipped at 0.8s (maybe animation). | Seed data and velocity source differences; animation timing. | YES |
| 26 | P3 | `/app/inventory/shipments` | 1280x800 | Invoice line "Tito 750ml" labelled NEW ITEM though Tito's Handmade Vodka 750ml exists. | Strict name matching. | YES |
| 27 | P3 | `/app/inventory/weigh` | 1280x800 | Report header says "No items" after adding a bottle until reload. | Local state not refreshed. | no |
| 28 | P3 | `/app/inventory` | 1280x800 | Price column is a dash for every seeded item. | Seed has no sale_price. | no |
| 29 | P3 | `/app/payroll (week)` | 1280 | Undo on a recorded payout deletes it immediately with no confirmation. | One-click delete of a money record. | YES |
| 30 | P3 | `/app/payroll (week)` | 1280 | "Mark paid" offered on a $0.00 row. | No zero-balance guard in row control. | YES |
| 31 | P3 | `/app/payroll (day)` | both | Run Payroll from a past day opens the current week, not that day's week. | RunPayrollLink reads only startDate/endDate; day view uses date. | no |
| 32 | P3 | `/app/payroll/review` | both | Duplicated chrome: two back links, two headings, CSV/NACHA buttons top and bottom. | Layout header and page header both render. | no |
| 33 | P3 | `/app/payroll (banner, dialogs, toasts)` | both | ISO dates in copy (banner, Pay everyone title, toasts); banner total "$507" without cents. | Raw strings interpolated. | no |
| 34 | P3 | `/app/payroll (day), /app/tips` | 1280 | Cash tips dialog stays open after save; tips-only night shows 0.0% and plots a 0% cliff on the chart; chart y-axis starts at 18%; Well tab flashes $0.00 expected before loading. | Dialog not closed on success; zero-sales nights not excluded; auto y domain; no loading state. | no |
| 35 | P3 | `/app/payroll/review` | 1280 | NACHA download with no bank settings returns 422 (clear toast, console error). After Resubmit the status read stale for 3s (reload showed it worked; unconfirmed). | Fails safely; possible missing refresh after resubmit. | no |
| 36 | P3 | `/app/books` | both | Pure profit drifted $37,048 to $37,023 once (two $12.34 expenses, likely other agents), not reproduced; new expense date defaults to period start; Recharts width(-1) warning on each load. | Unknown/shared demo org; default date from range start; ResponsiveContainer first render. | YES |
| 37 | P3 | `/app/reps` | both | Remove uses native confirm(); mobile drops Contact column. | reps-table.tsx:45; responsive columns. | no |
| 38 | P3 | `/login` | both | Bad-credentials error shown twice (toast and inline); signed-in user not redirected away from /login. | Duplicate messaging. | no |
| 39 | P3 | `/app/settings` | 390x844 | Tab strip clips Import Data with no scroll cue; FAB overlaps content. | overflow-x tab list. | no |

## Screens that fail the spec's laws on sight

Quick read from the walk notes only. These were not checked against the spec text line by line; Plan 2 does the full audit.

- `/app/payroll/review`: two headings, two back links and doubled export buttons (one screen, one job).
- `/app/payroll`, `/app/payroll/direct-deposit`, `/app/tax`: warning body text fails contrast.
- `/app/tips?tab=well` at 390: sideways scroll, clipped Options button.
- `/app/inventory/shipments` log dialog: money columns cut off at 1280 and 390.
- `/app/payroll` and `/app/payroll/review`: ISO dates and "$507" without cents in copy.
- `/app/books`, `/app/inventory`, `/app/inventory/weigh`: errors surface as raw Zod JSON, a silent 500, or nothing at all.
- `/app/settings` and `/app/books`: placeholders styled like saved values.
- `/app/settings` at 390: clipped tab strip with no scroll cue.
- `/app/sales` vs `/app/books`: two screens give opposite answers about the same month with no explanation.
- `/app/no-access`: placeholder support address.

## Not checked

- Setup page Add a deal create/edit/delete not exercised
- Items AI Import and Categories dialogs not exercised
- Weigh item edit and populated Pour Analysis ranges not exercised
- Mobile not rerun for edit/adjust/deactivate dialogs
- Analytics chart clipping not rechecked after longer settle
- Groq key is configured in dev (invoice AI read worked), contrary to the task note that third-party keys are blank; no email/SMS/payment triggered
- Set all tips bulk change (rewrites every employee's tip mode)
- W-2 and 1099 Print popups, 1099 selection, Tax Report with a state
- Adjust tabs other than Remove (Hours, Move tips, Opener, Cash out, Unlock), day hours dialog
- CSV and Z-report upload/Parse in Import panel
- Well assignment, Tip Totals date navigation, employee tax-classification editing
- Direct deposit beyond SMS step (Twilio blank in dev)
- Could not tell from UI whether the tips discrepancy is a seed artifact or allocation logic
- /me and /me/pending as a staff user: demo user redirects to /login; a staff account created via /join cannot sign in and an unmatched name records no claim
- Send Order, magic link, Try Demo, Clover/Toast connect, Import Data parse (Groq), Add teammate, signed-in /setup submit skipped (third-party or state risk)
- Settings Inventory, Notifications, POS tabs viewed only; saves not exercised; Tip & Pay save with valid changes not run
- Sales populated data states not seen (seed has no item sales)
- /app/dashboard: not covered by any walk file this run (it has uncommitted edits in the working tree)
- API routes: not walked by design

## Test data left in dev

- Two inactive 'ZZ Walk Test Item' rows, a voided shipment ZW-1 (vendor ZZ Walk Dist), related usage_logs
- Employee 'Walk Test' (delete broken), a shift-removal adjustment on 2026-11-17, approved/confirmed payroll run 11-23..29, cash payouts for week 11-16..22, $12.34 manual cash tips on 11-25, pay frequency Weekly, DD admin phone +15555550100, payroll notifications
- Auth user qa-walk-staff@example.invalid

## Status at close-out (Task 11, 2026-11-25)

Task 10 fixes have not started, so nothing below is fixed. Every P0 and P1 is "needs owner" because the owner has not yet seen the list.

| # | Sev | Status | Reason |
|---|---|---|---|
| 1 | P1 | needs owner | Money: payout summary vs bulk-pay tolerance. |
| 2 | P1 | needs owner | Tips: owner must say whether this is a seed artifact (P0 if not). |
| 3 | P1 | needs owner | Employee delete silently no-ops. |
| 4 | P1 | needs owner | Routing number validation feeds NACHA. |
| 5 | P1 | needs owner | Dev env uses live third-party keys; rotation is the owner's call. |
| 6, 8, 14-16, 21, 22 | P2 | deferred | Non-money; awaiting go-ahead for Task 10 / Plan 2. |
| 7, 9-13, 17-20 | P2 | deferred | Touch money/stock/tenancy; need owner review before and after any fix. |
| 23-39 | P3 | deferred | Low severity; carry to Plan 2. Money-flagged ones (23-26, 29, 30, 36) also need owner review. |

Fixed: none.
