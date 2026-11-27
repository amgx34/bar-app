# Books (/app/books), design review, run 2

Mode: Operate. Evidence: source of page.tsx and _components, screenshots at 1280x800 and 390x844 (demo org, YTD default, This Month), extracted page text. Read-only.

## Heuristics (0-4)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Period shown as raw ISO range only on one chart; no "as of / data through" or sync freshness; presets lack a visible date range. |
| 2 | Match with real world | 3 | Owner language (Pure Profit, Pour Cost, held for the state) is good; "Pure Profit" is non-standard accounting vocabulary and "Pour Cost" shows 0.0% green. |
| 3 | User control and freedom | 2 | Four presets only; `start`/`end` params exist but no custom range or month picker, so "last month" is impossible. |
| 4 | Consistency and standards | 2 | Revenue/COGS/Labor/Gross appear in band, KPI grid, chart and P&L (four restatements); sign convention mixed (`− Labor` label plus red `($5,352)` and `− Beverage cost $0` in grey). |
| 5 | Error prevention | 2 | $0 COGS is presented as a result (100% margin, 87.4% pure margin, green pour cost) rather than "no cost data". |
| 6 | Recognition vs recall | 3 | Derivation chips show how profit is built; tax and settings links are inline. |
| 7 | Flexibility and efficiency | 2 | No drill-down from any figure to its source (COGS to shipments/usage, labor to payroll); no export/print for an accountant. |
| 8 | Aesthetic and minimal design | 2 | Same numbers four times; KPI grid orphans two cards in a 4-col layout; low-info Losses card all zeros. |
| 9 | Error recovery / diagnosis | 3 | Missing tax config is called out plainly twice with a link; no-sales empty state names the fix, though it points at "Payroll tab" rather than the POS agent. |
| 10 | Help and documentation | 2 | A permanent "this used to read higher/lower" changelog paragraph is shown to users; no explanation of how COGS or pour cost is derived. |

**Total: 23 / 40** (typical).

## Design specificity verdict
Specific in intent (the pure-profit-first band, the tax-liability slot, the note about arithmetic), but the visual layer is generic: stock shadcn card grid, icon-top-right KPI tiles, default recharts. It reads as a dashboard template with sound copy, not the "night manager's clipboard" ledger the system describes. The P&L is the most native element and is buried fifth.

## Cognitive load
Checklist fails: chunking (band + 6 KPIs + 2 charts + 2 cards + expenses = 12+ blocks), single focus is compromised by duplicate figures, minimal choices passes (4 presets). Fails about 3 of 8: moderate. Extraneous load comes from restating the same five numbers and from tax-warning text appearing twice in the first screenful and again in the P&L card.

## Strengths
- Answer-first: Pure Profit band with visible derivation, correct negative state styling and null margin handling.
- Sales tax treated as a liability, with its own slot and honest "not configured" warning.
- Tabular figures, parenthesised negatives, aria-labelledby on the band, loading skeleton matching layout.
- Zero deductions are hidden from chips instead of showing a row of zeros.

## Priority issues

1. **P1 - Zero COGS reads as a real result.** Demo shows Pour Cost 0.0% in green "good", Gross margin 100.0%, pure margin 87.4%, beverage cost $0, with no hint that no purchases/usage were recorded. On a money screen this overstates profit. Fix: when COGS is 0 but revenue > 0, replace pour cost with "No cost data" (neutral), add a band warning "No stock cost recorded for this period; profit is overstated", and state the cost-basis (recorded unit_cost, else item cost price). Command: `/impeccable harden`.
2. **P1 - Hidden assumptions behind the profit figure.** Tips excluded (shown only as small text), cost price fallback, and whether Losses (voids/comps/discounts) are really deducted from revenue already (they are subtracted again in the chain) are never explained. Possible double count or false confidence. Fix: a short "How this is calculated" disclosure under the band listing included/excluded items; verify discounts/comps are not already netted from POS revenue. Command: `/impeccable clarify`.
3. **P2 - "What moved it" is not answerable.** Only a monthly bar chart; YTD default with one month of data yields a single bar and a single dot (Margin Trend meaningless). No period-over-period delta on any figure. Fix: default to This Month with deltas vs prior month on band and KPIs; hide Margin Trend under 3 data points; add a month picker. Command: `/impeccable layout`.
4. **P2 - Redundancy and weak hierarchy below the band.** Six KPI cards repeat what the band chips and P&L state; the P&L statement (the accountant's artefact) sits fifth. Fix: collapse KPIs to the 3 ratios not in the statement (pour cost, labor %, tax), move P&L up beside the band, delete the duplicate tax paragraph. Command: `/impeccable distill`.
5. **P2 - Chart accessibility and encoding.** Bars use hardcoded #f59e0b/#e11d48 beside token blue; no text alternative or data table; legend order differs from bar order; ISO date range string as subtitle. Dark mode unchecked. Fix: tokens, labelled table fallback, formatted "Jan 1 - Nov 25". Command: `/impeccable polish`.
6. **P3 - Stale permanent changelog copy and Losses card.** The "used to read X lower" note shows to every user indefinitely; Losses card is five zero rows with a dead half-card of whitespace. Fix: time-box or remove the note; fold losses into P&L or show "None recorded". Command: `/impeccable clarify`.

P0: 0. P1: 2.

## Persona red flags
- Owner (is the bar making money?): sees $37,048 and 87.4% margin that are implausible for a bar and has no way to learn COGS is simply missing; cannot pick last month; on phone must scroll past six single-column KPI cards (~800px) to reach charts and the P&L.
- Accountant: no export, no drill to source documents, tips off the statement without a line, "Pure Profit" and labor "(5,352)" red-coloured as if an error; cannot reconcile against Sales or Tax screens by link.
- Distracted first-timer (rubric): two amber/blue warnings plus "tax not configured" subtext repeated in three places; unsure which to act on first.

## Minor observations
- KPI grid leaves an empty half row at 1280 (6 cards in 4 columns).
- Preset active state is correct, but the "YTD" default on a demo with one month hides the preset most owners want.
- Revenue label in the first KPI says "tips +$8,428" as sub-text, easy to read as included in revenue.
- Mobile: FAB and bottom nav overlay content (full-page capture shows them mid-page; likely a capture artefact), chart bars did not paint in the mobile capture (likely recharts animation timing).
- Expenses panel empty state is clear and says what belongs there.

## Could not verify
Dark mode and contrast values on this page; non-empty expenses list and add dialog (read-only); behaviour with tax configured; a month with real COGS; the Margin chart with several months; whether discounts/comps are already netted from POS revenue (needs lib/books source check); whether mobile chart bars render after animation.
