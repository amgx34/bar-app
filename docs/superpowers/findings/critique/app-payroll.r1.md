# Payroll (Pay Period) design review, Assessment A, run 1

Screens: `/app/payroll?view=week` and `?view=day&date=2026-11-19`, 1280x800 and 390x844, demo org, Operate mode. Screenshots in the scratchpad `pw/r1payroll/`.

## Heuristic scores

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 3 | Payout bar ("Paid out 0 of 2 ... still owed $507.00") is good. The week view has no "this week is still open / hours not final" cue (today is Nov 25 mid-period), and the day-view "Loading..." fallback is a bare div. |
| 2 | Match with real world | 3 | Bar vocabulary (tip pool, opener, barbacks, keeps own tips) is right. "Eff. /hr", "Reg. Hrs" and "Go" are terse. |
| 3 | User control and freedom | 3 | Day/Week/Month, prev/next, date inputs and per-row "x" exclusions. Mark paid has an adjust control, but no visible undo of a payment. |
| 4 | Consistency and standards | 2 | Money formatting is inconsistent: "$1212.00" and "$1865.00" in the day view against "$24.0k" on the chart axis. Week cards carry a coloured left border while the day cards mostly don't. The week and day views also order their controls differently. |
| 5 | Error prevention | 3 | Balance-based settle with a cap, "Pay remaining N" goes through a dialog, and the opener switch is a deliberate toggle. The date range accepts any pair with a separate "Go". |
| 6 | Recognition over recall | 3 | Labelled controls and a persistent subnav. Wages-vs-overtime is explained in a footnote. The chart series are not labelled. |
| 7 | Flexibility and efficiency | 3 | One-action bulk pay, a month view, expandable employee rows. No keyboard or quick "last period" shortcuts. |
| 8 | Aesthetic and minimalist | 2 | A 3-week revenue chart sits above the pay table and pushes the task below the fold. Day view stacks 8 stat cards. Five coloured-edge stat cards for a 2-person table is heavy. |
| 9 | Error recovery | 2 | Chart renders width(-1) console errors, so the chart can fail silently. No visible empty or error state for the week view was reachable. |
| 10 | Help and documentation | 2 | Good inline explanations ("Their hours are still paid ..."). No definition of Eff./hr, and none of how pool percentages are set. |

**Total: 26 / 40**

## Specificity verdict

Moderately specific. The tip-pool split (bartender pool 58%, barback pool 15%, opener bonus, "keeps their own tips") and the Rail mono and navy language could not be lifted into a generic payroll product. The week table and stat row, however, is a stock payroll pattern (hours, regular, OT, total) with decorative icon chips; the five stat cards add little over the table's own Totals row. The tip logic is the product's identity and the week view hides it: tips show as one column, and the pool breakdown lives only on the day view.

## Cognitive load

Failures (of 8): single focus (revenue chart competes with pay), chunking (8 cards in the day view, 5 in the week view), visual hierarchy (every card has equal weight except an inconspicuous "Total Pay"), progressive disclosure (the chart is expanded by default). Score: **4 failures, high load**. Working memory is hurt by tips split across three views: the Day view reconciles $1212 as 703.80 + 124.20 + 384.00 kept, but nothing states that sum.

## Strengths

- The payout progress bar with a "still owed" figure answers the primary question ("who is owed what") in one line.
- The figures check out: 105 + 148.50 = 253.50, 36.21 effective hourly rate, day pools sum to the tip total, hours 46.0 = sum of rows.
- Explicit explanation that day wages are at base rate with OT computed weekly, which prevents a misread of the night total.
- Mobile reflows the table into per-employee cards with a full-width Mark paid button.
- Navy and mono language, tabular figures, and the amber accent used for one action (Log cash tips).

## Priority issues

1. **P1, Week view leads with a chart instead of the pay run.** The 3-week revenue chart takes about 260px (and a full screen on mobile) before the period, totals or payout bar. Revenue is not what this screen settles, and the chart has no series legend (green/cyan unlabelled) and logs width(-1) errors. Fix: remove it from the top, or collapse it below the table with a legend. Command: `/impeccable distill`.
2. **P1, Possible mislead: Day "Night total $1865.00" = wages + all tips, including $384.00 Danny keeps in his own tips.** The Total Tips card says "kept by staff on their own tips", but "Night total" reads as owed. Nobody is owed $1865 from the till. Also "Tips $1212.00" and the pools do not add on screen. Fix: rename to "Labour + tips for the night" or show owed vs kept, and state the sum line under the pool cards. Command: `/impeccable clarify`.
3. **P1, Mobile Opener toggle breaks at 44px.** The switch renders as a large grey circle without a visible track. In the Day table, "Danny Rivera (Bartender)" overlaps the "7.50 hrs" in the Not-in-pool rows. Fix: scope the 44px minimum to the row/hit area, not the switch glyph, and let those rows wrap. Command: `/impeccable adapt`.
4. **P2, Money formatting inconsistent.** Day figures are "$1212.00", the chart uses "$24.0k", and the week has "$0.00" in orange for zero OT. Fix: one currency formatter with grouping. Command: `/impeccable polish`.
5. **P2, Total pay is not emphasised.** "Total Pay" on week is a faint tinted card among five equally weighted ones, and the table's Totals row is as dense as the rows. The settle button "Pay remaining 2" is the only primary actionable, and "still owed $507.00" is small. Fix: promote "still owed" with the button as the page anchor and reduce stat cards to Hours / Pay / Tips. Command: `/impeccable layout`.
6. **P3, "Run Payroll" (top right) sits beside "Pay remaining 2" with no stated difference.** Two payment-adjacent primaries one scroll apart, with an unclear relationship (snapshot approval versus payout). Fix: add a one-line status, e.g. "Pay run not submitted". Command: `/impeccable clarify`.

## Persona red flags

- **Owner closing the night:** has to scroll past a revenue chart to see who is owed; "Night total" could be read as cash needed; on a phone the Mark paid taps work but the Opener switch does not look like a switch.
- **Manager on shift (phone, one-handed):** 2671px week page, five stat cards stacked at full width before any employee; the Run Payroll button is at the top (out of thumb reach); the Opener circle is ambiguous.
- **Sam (accessibility):** per-row icon-only "adjust" control (tune icon) looks unlabelled in the screenshot; the zero-OT orange text on white should be checked at 4.5:1; the dashed-underline hours are an edit affordance with no cue except the underline.

## Minor observations

- Subtitle "Calculate wages, tips, and manage staff pay" is generic filler.
- Date inputs plus "Go" sit beside the prev/next arrows: two ways to change the period; Go is low-emphasis.
- Day view loads client-side with a persistent request (never reached network idle, 30s timeout), so a slow network shows only "Loading...".
- The `Totals` row also repeats the Bartenders subtotal when there is one group.

## Could not verify

Dark theme, print layout, the empty (no employees) and error states, role-restricted views (manager without approve rights), the effect of Mark paid / Pay dialogs (read-only run), keyboard focus order, and screen-reader names. Contrast was judged by eye only; no computed ratios for the OT orange. Date logic (the Nov 23-29 period with today Nov 25) was not tested against pay-day data.
