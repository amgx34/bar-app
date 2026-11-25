# Walk: stock routes (2026-11-25)

Slice: `/app/inventory/*`, `/app/analytics`. Viewports 1280x800 and 390x844, Playwright + system Chrome, seeded demo-org cookie.
Dev check: `.env.development.local` Supabase host (uzmn...) differs from `.env.local` (nmis...); dev server log confirms it uses the uzmn host. All writes went to the dev project.
Screenshots: `/private/tmp/claude-501/-Users-xavierdichiara-bar-app/8527d075-902d-4b6f-bdad-682e3b56664f/scratchpad/walk-shots/` (`d_*` desktop, `m_*` mobile). Scripts: `.../scratchpad/pw/stock_*.mjs`.

## Route outcomes (both viewports unless noted)

| route | final URL | HTTP | console / network | primary content |
|---|---|---|---|---|
| /app/inventory | same | 200 | clean | yes (overview cards + item table; cards on mobile) |
| /app/inventory/analytics | same | 200 | clean | yes |
| /app/inventory/loss | redirects to /app/inventory | 200 | desktop clean; mobile once logged "Rendered more hooks" | yes (it is a redirect page, not a screen) |
| /app/inventory/setup | same | 200 | clean | yes (empty state: nothing sold via POS, no deals) |
| /app/inventory/shipments | same | 200 | clean | yes (empty state) |
| /app/inventory/weigh | same | 200 | clean | yes (empty state) |
| /app/analytics | redirects to /app/inventory/analytics | 200 | PAGEERR "Rendered more hooks than during the previous render." | yes |

No horizontal page scroll at either width on any route. No param routes in this slice (no detail pages).

## Findings

| route | viewport | what happened | severity | suspected cause |
|---|---|---|---|---|
| /app/analytics | both | Uncaught React error "Rendered more hooks than during the previous render" on every load (4 of 4 repeats). Page still renders. /app/inventory/loss showed it on 1 of 5 loads. Direct load of /app/inventory/analytics is clean. | P2 | Redirect page plus sibling `loading.tsx` Suspense boundary; hook-count mismatch between loading and final tree on redirect. Not confirmed. |
| /app/inventory (adjust stock) | desktop | Removing more than on hand (-50 from 8) is refused, stock stays 8 (guard works), but it is an unhandled server throw: POST returns 500, dialog stays open, no visible message to the user. | P2 (stock) | `adjustStock` throws `Error('Stock cannot go negative')` (actions.ts:171) and the dialog has no error handling for it. |
| /app/inventory/weigh | desktop | Add bottle with opening 3 / closing -1 returns 500 from a DB check constraint (`weigh_report_items_closing_level_check`); form stays open, no message. Server-side range validation is missing; DB is the only guard. | P2 | `addWeighItem` (weigh/actions.ts:317) rethrows the raw DB error; no zod range check on 0-1 levels. |
| /app/inventory | desktop | "Latest Shipment" card, after voiding the test shipment, listed the voided item (+2) and my manual delivery-reason adjustments (+3, +4, +2) as shipment lines. Before the void it showed the shipment correctly ("1 item", $25.00). So the card reads delivery `usage_logs`, not shipments, and does not exclude voided reversals or manual adjustments. | P2 (stock) | Card is built from delivery usage_logs by date rather than by `shipment_id` (CLAUDE.md warns about this class of bug). Owner to review. |
| /app/inventory vs /app/inventory/shipments | desktop | Items page "Latest Shipment" shows seeded Nov 24 deliveries with +N per item while Shipments page says "No shipments logged yet". Expected for pre-shipments seed data, but the two screens disagree. | P3 (stock) | Seed deliveries have no `inventory_shipments` row. |
| /app/inventory | desktop | "Top Sellers" and "Biggest Losses" charts show identical bar values and names, on a 0 to 1 axis (0, 0.25 ... 1). Looks like the same series or placeholder values. | P2 (stock) | Data source or chart wiring; not investigated. |
| /app/inventory/analytics | desktop | Par Compliance 0.0%, 28 of 28 items below par, Fast Movers show tiny rates (0.00-0.10). Stock alerts read "~1000d left" style runways. Probably seed data, but runway values over 500 days are unhelpful. Setup page says nothing sold through the POS in 30 days while Fast Movers lists POS velocity. | P3 (stock) | Seed data; velocity source differs between the two pages. Unverified. |
| /app/inventory/analytics | desktop | Value by Category donut and Shrinkage by Reason pie rendered as partial arcs / clipped wedge in the screenshot taken at ~0.8s after network idle. May be mid-animation. | P3 | Recharts animation timing; not re-checked after a longer wait. |
| /app/inventory/shipments | both | After "Post shipment" the dialog stays open and resets to the paste step (toast "Posted 1 line" shown). Easy to double-post. | P3 | Dialog not closed on success. |
| /app/inventory/shipments | desktop 1280 | Reviewed-line table in the Log dialog is wider than the dialog: Unit, Unit cost, Line total and Price change columns are cut off and need horizontal scroll inside the dialog. At 390 the same table is cut after the Unit column. | P2 (money) | Table in `max-w` dialog with no responsive layout. Post still works. |
| /app/inventory/shipments | desktop | Invoice line "Tito 750ml" was labelled NEW ITEM although "Tito's Handmade Vodka 750ml" exists. (A later test line for an inactive item also showed NEW ITEM, which is plausible.) | P3 (stock) | Fuzzy match is name-exact-ish; could create duplicates. |
| /app/inventory/weigh | desktop | Report header still reads "No items" right after adding a bottle; correct ("1 items") after reload. | P3 | Local state not updated after add. |
| /app/inventory | desktop | Price column shows "-" for every seeded item. | P3 | Seed has no sale_price. |

## Actions exercised on dev (all succeeded unless noted)

- Items: add item (cost 10, price 20, par 5, stock 7), adjust +3 (10), -2 (8), -50 (refused, see above), set exact count 4, edit name/cost/par (persisted after reload), deactivate (hidden, shown under Show inactive as Inactive). No hard delete exists.
- Shipments: Read invoice (AI parser) worked, so a Groq key IS configured in the dev env, contrary to the note that third-party keys are blank; no email/SMS/payment was triggered. Posted shipment: item created with stock 2 at $12.50, Cost of Product on Hand rose $2,623.89 to $2,648.89 (+25.00, consistent). Voided it: stock back to 0, cost back to $2,623.89, row marked Voided.
- Weigh: create report, add bottle (750ml, 1.0 to 0.5, $20/bottle: 12.7 oz, $10.00, 8.5 pours; Pour Analysis shows $0.789/oz, matches), delete report (cascades).
- Setup: "Add a deal" not exercised.
- Mobile 390: Add item dialog, Log shipment dialog (Read invoice flow), weigh create and add-bottle form all open and fit without page scroll.

## Test data left behind in dev

Two inactive inventory items named "ZZ Walk Test Item..." (one edited, one created by shipment), a voided shipment ZW-1 (vendor ZZ Walk Dist), and usage_logs rows from the adjustments and void. Weigh report removed.

## Not done

- Setup page "Add a deal" create/edit/delete and Items "AI Import" and "Categories" dialogs not exercised.
- Weigh "Pour Analysis" with a populated date range beyond one test row; weigh item edit not exercised.
- Mobile checks were not repeated for edit/adjust/deactivate dialogs.
- Analytics chart clipping not re-checked after a longer settle time.
