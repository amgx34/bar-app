# Critique summary: six screens, two independent reviewers each (2026-11-25)

Plan 2, Task 3, narrowed by the general manager to the six screens most likely to score lowest or to hold money. Method: each screen was reviewed twice by separate reviewer agents (design review only: neither saw the other's review nor any detector output, and neither was told a target), plus one measurement agent for detector and browser evidence (`measured-evidence.md`). All reviews are read-only; demo-org data is thin (no POS agent, one voided shipment, an already-approved pay run), so populated, pending and error states were judged from source where noted in each file.

Scores are out of 40, all ten heuristics applicable. The spread between each pair was 3 points or fewer, so no third review was needed.

| Screen | Reviewer 1 | Reviewer 2 | Average | Spread | P0 / P1 flagged |
|---|---|---|---|---|---|
| Payroll Review (`/app/payroll/review`) | 21 | 22 | **21.5** | 1 | 2 P0, 2 to 3 P1 |
| Books (`/app/books`) | 21 | 23 | **22.0** | 2 | 1 P0, 2 P1 |
| Inventory (`/app/inventory`) | 24 | 21 | **22.5** | 3 | 0 P0, 2 to 3 P1 |
| Shipments (`/app/inventory/shipments`) | 25 | 24 | **24.5** | 1 | 0 P0, 3 P1 |
| Sales (`/app/sales`) | 24 | 25 | **24.5** | 1 | 0 P0, 3 P1 |
| Payroll Pay Period (`/app/payroll`, week and day) | 26 | 26 | **26.0** | 0 | 0 P0, 3 P1 |

All six land in "Acceptable: significant improvements needed" (20 to 27). Mean 23.5. For comparison the dashboard, which was redesigned over four rounds, scored 28 (best 31). Do not read a difference of under about 3 points between screens as meaningful; the reviewer-to-reviewer spread is that large.

## Issues that recur on three or more screens (design-system problems)

1. **A zero or an empty result is presented as a measured fact.** Books shows $0 COGS as 0.0% pour cost in green, a 100% gross margin and 87.4% pure profit with no "no cost data" warning. Sales shows $0.00, "0 items" and every stocked item "Never sold" for periods with no data. Inventory answers a search with no matches by saying "No items yet, create your first item" and reports $0.00 of stock. This is the failure PRODUCT.md principle 4 names ("say what is missing"), on three of the six screens.
2. **The primary task is buried under duplicate summary cards.** Inventory's item list starts 1,100 to 1,400px down on a phone beneath four analytics cards. Payroll week leads with an unlabelled chart above the pay run. Books and Sales repeat the same figures in six equal cards. Hierarchy is flat on all four.
3. **Phone layout collisions and clipping.** Payroll day rows overlap and the Opener switch renders as a large circle; Sales "slow movers" rows overprint at 390px; Shipments' Total, Invoice total and Void are clipped in an inner scroller and its line table needs 64px inputs; Inventory's adjust dialog has clipped mode tabs. (The measurement agent found no page-level horizontal overflow; these are inside-component problems.)
4. **No "what changed" or "what drove it".** Books and Sales have no prior-period comparison; Payroll Review's diff only runs while a run is pending.
5. **Raw or inconsistent formatting.** ISO dates in Sales and Books; `$1212.00` next to `$24.0k` on Payroll; a raw `delivery` slug in Inventory's reason list.
6. **Hidden assumptions on money screens.** Books' cost-price fallback and unset-tax caveat; Payroll day labels that do not state their base; Shipments' "Total" vs "Invoice total".
7. **Heuristics 7 (flexibility) and 10 (help) score 1 to 2 on nearly every screen.** These are product gaps (no period picker, no inline explanation of par, tip bands, "provisional"), not visual defects; no amount of restyling lifts them.
8. **Chart accessibility.** No text alternative or legend on the Books and Payroll charts, and a Recharts `width(-1) height(-1)` console warning on both.
9. **Controls without an accessible name**, measured: two Z-report paste textareas on Payroll week, the day date input on Payroll day, and the Inventory search box.

## Money-integrity findings (need the owner; not fixed overnight)

- **Payroll Review, P0 (both reviewers):** a "Confirm Payroll" button that only sets local state and a toast, persists nothing, and sits beside the real approval and the NACHA download, so it reads as an approval state.
- **Payroll Review, P0/P1:** the Approved badge sits over live recomputed figures; the diff against the frozen snapshot runs only while a run is pending, so a change after approval is invisible while the ACH export stays unlocked. The Approved panel shows no approver, date or approved total, and Approve is one click with no summary of the amount.
- **Books, P0/P1:** the zero-COGS presentation above; and COGS valuation (`unit_cost ?? cost_price`), the labor basis and an even per-month labor spread are invisible assumptions behind the headline profit.
- **Inventory, P1:** the Low / In Stock filter chips write `?stock=` that the page never reads, so a chip lights up while the list does not change.
- **Shipments, P1:** a voided row keeps a bold live-looking total at 60% opacity, so a reversed cost can read as a live charge.
- **Payroll day, P1 (consequence of the tips fix):** after what individual staff keep is carved out, the barback pool reads "15% of tips" (of the remaining pool) while the bartender line reads "58% of tips" (of the total), and a "Night total" includes tips staff keep themselves. Queued as part of N9.

## Measured evidence, headline (`measured-evidence.md`)

- No console errors; the only messages are the Recharts width warnings on Payroll week and Books. CLS 0 everywhere (0.0001 to 0.0005 on Payroll day).
- Every screen has one `<main>` and one `<h1>`; Payroll Review skips from h1 to h3.
- Every one of the first 12 Tab stops shows a focus ring on every screen.
- Worst contrast: Books COGS 2.15:1, Payroll Review "Voided" 2.44:1 and a name at 2.82:1, amber 14px text 2.92 to 3.06:1, the white-on-green "Confirm Payroll" at 3.65:1, plus muted grey and pink on Inventory and Shipments.
- Detector: 15 advisory findings (a `side-tab` at `day-split-tab.tsx:435,440`, 10px off-ramp text in about eight places, one off-palette `#e11d48` in Books' chart); none in Sales.
- Dev-server load times, three loads each: most 520 to 1,000ms; Sales slowest at about 1.4 to 2.3s because it rewrites its URL to a specific night before it renders.

## What not to conclude

- These are model reviewers working from a thin demo org. Treat a P0/P1 as "look at this", and confirm it against the code and real data before changing anything on a money screen.
- Scores are not a target. The earlier dashboard loop showed that chasing a number rewrites a page for noise.
