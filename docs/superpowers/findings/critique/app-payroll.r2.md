# Critique: Payroll (Pay Period), run 2

Screens: `/app/payroll?view=week` and `?view=day&date=2026-11-19`, 1280 and 390 wide, demo org. Mode: Operate. Source read: `page.tsx`, `day-split-tab.tsx`, `payout-controls.tsx`, `weekly-trend-chart.tsx`. Read-only; nothing was clicked.

## Heuristics

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | "Paid out 0 of 2 / still owed $507.00" is clear. The weekly chart has no legend. A partial week (Nov 23-29, today is the 25th) is not labelled as in progress. |
| 2 | Match with real world | 3 | Bar vocabulary is good (opener, pool, keeps own tips). "In" column header and "Eff. /hr" are cryptic. |
| 3 | User control and freedom | 3 | Day/Week/Month, arrows, remove-from-pool, undo-last-payment aria exists. Two parallel date mechanisms in week view. |
| 4 | Consistency and standards | 2 | Money formats differ: `$1212.00` (no thousands separator) vs `$24.0k` axis. Day view shows `$X` cards with no accent borders on the first row and accents on the second. Two identical blue primaries compete (Run Payroll, Pay remaining). |
| 5 | Error prevention | 2 | "Pay remaining 2" is a bulk money action sitting beside a partial-week period with no stated total at the button. Week is incomplete yet payable. Pool percentage labels do not reconcile (see P1). |
| 6 | Recognition over recall | 3 | Labels visible, row actions named. Cash tips entry is on the day view only; the week view does not show who keeps their own tips. |
| 7 | Flexibility and efficiency | 3 | Bulk pay, per-row mark paid, day stepping, direct date entry. No keyboard accelerator for day stepping seen. |
| 8 | Aesthetic and minimalist | 2 | Week view opens with a 3-week revenue chart that is not part of the pay task and pushes the owed figures below the fold. Subtotal and Totals rows are identical when there is one group. |
| 9 | Error recovery | 2 | Not exercised (read-only). Loading is a bare "Loading payroll…" div; no error or empty-period state could be seen. |
| 10 | Help and documentation | 3 | Good inline explanations (overtime note, "hours are still paid"). No explanation of how the pool percentages are derived. |
| | **Total** | **26 / 40** | |

## Specificity verdict
Mostly specific. Tip pools, openers, barbacks, "keeps their own tips" and the Fira Code ledger headings read as a bar tool. The week view's stat-card row (Total hours, Regular, Overtime, Tips, Total) and the revenue bar chart could belong to any payroll product. The accent-edged stat cards are the generic part.

## Cognitive load
Failed items: single focus (chart plus 5 stat cards plus add-to-shift plus pay bar plus table plus import all before the first settle action on mobile), chunking (day view shows 8 stat cards in 2 rows plus 3 tables), minimal choices (two date mechanisms, 3 view toggles, Run Payroll, Pay remaining, Add someone, Mark paid per row, adjust icon on each row). Visual hierarchy and grouping pass. Result: 3 failures, moderate.

## Strengths
- Paid-out bar with "still owed $507.00" answers the primary question in one line.
- Mobile week view turns the table into cards with Mark paid as a full-width, thumb-reachable button.
- Tabular mono figures, tinted total card, clear row grouping by role.
- Day view explains why wages are base-rate only and why excluded staff are excluded.
- Aria labels on payout actions include the name and amount.

## Priority issues

**P1. Tip-pool percentages do not add up and could mislead about amounts.** Day view: total tips $1212.00, bartender pool $703.80 labelled "58% of tips", barback pool $124.20 labelled "15% of tips". 124.20 / 1212 is 10%, not 15% (the 15% is the configured rate applied to the pool after the $384 kept by Danny, per code at `day-split-tab.tsx` ~L329 vs ~L445; the 58% is computed against all tips). Two different denominators sit under one label, and the section headings repeat them ("Barbacks — 15% split by hours"). An owner checking the maths will find it does not reconcile and may distrust the shares. Fix: state the base for each (for example "15% of the $828.00 shared pool") and show a one-line reconciliation: pooled + kept + opener = total tips. Command: `/impeccable clarify`.

**P1. Money formatting is inconsistent on a money screen.** `$1212.00`, `$1865.00` have no thousands separator, while the chart axis uses `$24.0k`. Larger bars will read poorly and tabular alignment suffers. Fix: one `formatMoney` with grouping for all card figures. Command: `/impeccable polish`.

**P1. Mobile day view layout collisions.** At 390px, "Not in the tip pool" rows overlap ("Danny Rivera / 7.50 hrs / (Bartender)" run into each other), names wrap mid-person in the tables, and the Opener toggle renders as a large grey circle instead of a switch (the 44px target rule is stretching the control's shape). Fix: stack the excluded-row meta under the name; give the toggle a fixed switch geometry with a padded hit area; drop the role suffix to a second line. Command: `/impeccable adapt`.

**P2. Week view leads with revenue, not what is owed.** The "Weekly Revenue — Last 3 Weeks" chart takes about 260px at the top; on mobile the settle bar sits ~1500px down the page after five stacked stat cards. Chart series (green, cyan) have no legend or titles, and the current week's bars are near zero because the week is only partly elapsed. Fix: move the chart below the table or collapse it; put the Paid-out bar directly under the period selector; make the five stats a compact 2-row grid on mobile; add a legend. Command: `/impeccable layout`.

**P2. Bulk pay on an unfinished period with no guardrail copy.** "Pay remaining 2" is a primary-blue button for a week that still has days to run (Nov 23-29, viewed on the 25th) and the label does not say the amount or that the period is open. A confirmation dialog exists, but the surface does not flag "period not ended". Fix: show "Period ends Nov 29 - figures may change" next to the bar and put the amount on the button. Command: `/impeccable harden`.

**P3. Competing primary actions and duplicated period controls.** "Run Payroll" (header) and "Pay remaining" share one style; week view has both arrows and two date inputs plus "Go". Fix: demote one to outline; keep arrows and one range popover. Command: `/impeccable distill`.

## Persona red flags
- **Owner closing the night:** has to scroll past a chart to find who is owed; pool percentages that do not reconcile undermine trust in the tip shares; no clear signal that the week is still in progress before paying.
- **Manager on shift (phone):** the toggle and the overlapping excluded rows on the day view are hard to use one-handed in a dim bar; FAB and bottom bar overlap content mid-scroll in screenshots (full-page capture, fixed elements; could not confirm in real scrolling). Mark paid itself is well placed.
- **Sam (keyboard/screen reader):** labels on pay actions are strong; the unexplained "In" column and the cryptic stat-card icons are the gaps. Per-row adjust icon needs its name checked (an `Adjust ...` label exists at L213).

## Minor observations
- Subtotal and Totals rows are duplicates when only one role group exists.
- "Weekly Revenue" title in mono with an icon is the only chart on the screen and is a different color vocabulary from the DESIGN.md single amber signal (emerald and cyan).
- "Calculate wages, tips, and manage staff pay" subtitle is generic.
- Amber "Log cash tips" button is the only amber on the screen and is on the day view only; consistent with the One Signal rule.
- Sidebar sub-nav and top tab strip duplicate the same four destinations.
- Next dev badge overlaps the sidebar and mobile bottom nav (dev only).

## Could not verify
Pay/adjust/day-hours dialogs, the confirmation flow, empty period and error states, loading skeleton (route `loading.tsx` not inspected), dark theme, print layout, the real scroll behaviour of the FAB, and whether the "In" column x buttons toggle tip pool membership as their aria labels suggest. Contrast was not measured. Dev server needed a longer wait than networkidle to load the day view.
