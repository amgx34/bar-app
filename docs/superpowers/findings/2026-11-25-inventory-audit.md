# Inventory audit against competitors (2026-11-25)

Sources: `competitors/matrix.md` and the per-product records for MarginEdge, BevSpot, WISK, MarketMan and Bar Cop (public pages and snippets, read earlier today; I did not re-fetch them), plus the two inventory critiques (`critique/app-inventory.r2.md`, `app-inventory-shipments.r2.md`). Rail was walked in a browser at 390 and 1440px on the demo org. Competitor cells marked `?` in the matrix stay unverified here; absence on a marketing page is weak evidence.

## How each product presents the five jobs

| Job | Rail now | Competitors (as the records state them) |
|---|---|---|
| Counting | Per-item "Adjust stock" (kebab, menu, dialog, mode, reason). Weigh screen for partial bottles. Pack calculator. | BevSpot: counts on any device, offline, shelf-to-sheet ordering, custom storage areas. WISK: split counts among users, Bluetooth scale, offline claimed. Bar Cop: count on any device. MarketMan: phone counting apps. |
| Par levels | One number per item, shown as a bare figure beside stock. | BevSpot and Bar Cop turn par into auto order sheets / Smart Cart. MarketMan and WISK use par and sales for suggested orders. |
| Low stock | Amber triangle per row; the Low chip was dead. | Competitors surface low stock as an order list, not a row marker (BevSpot ordering, Bar Cop order sheets). |
| Ordering | Reps and messages live outside inventory. | Ordering sits inside inventory everywhere it exists (matrix: not a top-level area anywhere). One-click or par-driven. |
| Variance | Loss and analytics screens; dashboard top sellers and losses. | BevSpot, WISK, MarketMan: automated variance and actual-vs-theoretical as headline reports (several gated to higher tiers). |

## Ranked gap list

1. Low / In Stock chips wrote `?stock=` that nothing read. **Fixed.**
2. Search with no matches said "No items yet" and the dashboard reported $0. **Fixed.**
3. Item list buried under four analytics cards on a phone. **Fixed** (list first, analytics after).
4. Unlabelled search, unpressed-state chips, unlabelled below-par icon. **Fixed.**
5. Raw "delivery" slug in the Reason trigger. **Fixed.**
6. Voided shipment kept a live-looking total at 60% opacity. **Fixed in code, not seen live** (demo has no shipments).
7. Contrast: `/60` vendor text, amber-500 icon (about 2.1:1 on white), whole-row opacity on shipments. **Fixed** for the first two and shipments.
8. Counting takes about six taps per item; no tap-to-count or +/- control, no count session with "items left". Open. Biggest competitor gap.
9. Par is not turned into an order list or a suggested order. Open. Competitors treat this as the payoff of par.
10. Stock vs par shown as two numbers, not a ratio or bar; every demo item is under par so the signal is flat. Open.
11. Adjust dialog defaults to Add with reason Delivery, so a physical count saved with defaults logs as a delivery. Open (changes stock semantics, left alone on purpose).
12. Shipments: mobile hides Invoice total and Void in an inner scroller; line review table is not phone-usable; only paste-text entry. Open.
13. Dashboard cards: Cost on Hand is mostly empty, desktop chart labels truncate. Open.
14. No offline counting, native app, or distributor/accounting integrations (matrix). Out of scope.

## What changed

- `page.tsx`: reads `stock`; Low = par set and stock below par, In Stock = stock above 0, applied after the query because it compares two columns. Dashboard totals now come from their own org-scoped query over all active items, so a filter no longer zeroes them. Dashboard moved below the list on phones with CSS order only.
- `inventory-header.tsx`: search has an accessible name; chips are `type=button` with `aria-pressed` and a 36px minimum height; active state comes from the page, not a second read of the URL.
- `inventory-table.tsx`: filtered-empty state ("No items match ..." with a clear link) separate from the true empty state; vendor text and below-par icon contrast; icon has a text alternative.
- `stock-adjust-dialog.tsx`: Reason trigger shows the label.
- `shipments/_components/shipment-list.tsx`: voided rows show struck-through totals with "Reversed", at full contrast, and no "off" delta.

Stock and cost calculation were not touched.

## Verified

Browser at 390 and 1440 (system Chrome, demo session): search has a label; `?stock=low_stock` marks Low pressed; `in_stock` returns one fewer row than All (a zero-stock item), so the param now filters; `?q=zzzzqq` shows the no-match state; the adjust dialog trigger reads "Delivery received"; at 390 the search is at 137px and the dashboard is below the list.

Not verified: the voided shipment row (no shipments in the demo org, and I did not write data); measured contrast ratios (estimated from tokens: amber-700 on white about 5:1, muted-foreground 6.5:1); dark theme; the shipments empty state at 390 is wider than the viewport (510px full-page capture), which I did not investigate.
