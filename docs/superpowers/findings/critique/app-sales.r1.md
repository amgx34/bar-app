# Sales (/app/sales) design review, run 1

Mode: Operate. Viewed Tonight, Day, Week, Month at 1280x800 and 390x844 (demo org, no POS agent). Screenshots: scratchpad/pw/crit-sales-r1/.

## Heuristics (0-4)

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Tonight shows "The night" with date 2026-11-24 at 2am with no "business night" explanation; sync freshness only appears inside LiveBand, so on empty states there is no "last synced" or "feed: daily totals" status. Week/Month show $0.00 with no data-source status. |
| 2 | Match with real world | 3 | "Cost to pour", "Who was pouring", "What earns its place" speak bar. Raw ISO dates (2026-11-23 – 2026-11-29) and "Margin %" vs "Margin" are less natural than "Sun 23 Nov". |
| 3 | User control and freedom | 3 | Prev/next arrows and period toggle work; toggle keeps date context. No jump-to-today, no custom range, arrows are bare glyphs with only aria-labels. |
| 4 | Consistency and standards | 2 | Tonight/Day share the title "The night"; Day for 2026-11-25 and Tonight for 11-24 look identical. Stat tiles on Week/Month vs LiveBand on night views use different idioms. Slow-mover rows are link-blue but unlabeled as links. |
| 5 | Error prevention | 3 | Hourly baseline suppressed until browser reports hour (good, avoids a wrong percentage). Cost-coverage notices exist. No destructive actions here. |
| 6 | Recognition vs recall | 3 | Sections labelled in plain words; sort state visible. Period toggle on mobile is left-aligned and small, not full width. |
| 7 | Flexibility and efficiency | 2 | No jump to a specific date, no compare-to-previous toggle on Week/Month, no export. Sort only on one table. |
| 8 | Aesthetic and minimalist design | 2 | Week/Month stack six near-identical empty cards between the stats and the one list that has data; the page is long and mostly placeholders. Four zero/dash stat tiles on mobile take ~420px. |
| 9 | Error recovery / empty states | 2 | Night empty states are excellent (name the missing capability and the fix). Week/Month empties are generic ("No sales in this window.", "Price your items to see this") and contradict the stated rule that a zero is a claim: $0.00 revenue with "0 items sold" reads as a dead bar. Slow movers lists every item as "Never sold" which is misleading when no sales data exists. |
| 10 | Help and documentation | 2 | Empty states say "The Rail agent on the bar PC records it" but give no link or action to connect it. No explanation of how margin or cost-to-pour is derived. |
| | **Total** | **24 / 40** | |

## Specificity verdict
Partly specific. The voice ("The night", "Who was pouring", "What earns its place", dead-stock slow movers) and the honest capability panels are distinctive and bar-native. Visually it is the standard Rail card stack: identical bordered cards, identical heading size, no focal element. Nothing on any period view is visually dominant because with no data there is nothing to lead with; the layout has no designed "answer" slot.

## Cognitive load
Failed checklist items: single focus (Week/Month have 6 stacked cards with equal weight), visual hierarchy (all card titles identical, stats tiles are the only anchor), chunking on mobile (4 stat tiles stacked at full width), progressive disclosure (full "Every item" table plus slow movers plus category table all open). 3 to 4 failures: moderate to high on Week/Month when data exists. Night views are well ordered per the code comment (band, running total, hours, movers, mix, payment).

## Strengths
- Honest capability-gated empty states on night views (MissingPanel) that say what is missing and how to get it; no fabricated zeros there.
- Baseline suppressed until the bar's own hour is known; stale agent surfaced via asOf.
- Touch targets on arrows are 44px; sort chips are 36px; tabular numerals; Fira Code headings match DESIGN.md.
- Week/Month absorb Categories and Margins without losing the size split.

## Priority issues

1. **P1: Night views show no revenue at all for bars with daily totals only.** `NightView` returns MissingPanel for the whole night whenever `hasHourly` is false, so a bar whose POS reports daily totals (or the email Z fallback) sees no net sales, tickets or cash/card split for Tonight or Day, only "there is no record of when". The night's total is the first thing the owner wants. Fix: render LiveBand (total, tickets, vs usual) from the daily Z row whenever it exists, and gate only the two hourly cards on `hasHourly`. Command: `/impeccable harden`.

2. **P1: Week/Month contradict the "a zero is a claim" principle.** With no sales they show $0.00 / 0 items / dash, and Slow movers marks every stocked item "Never sold". A bar with no feed is not a bar with no sales (PRODUCT.md). Fix: when the period has no sales rows, collapse the four stat tiles and the three empty cards into one panel ("No sales recorded for 23-29 Nov. If your POS is connected, ...") and hide Slow movers (or caveat it) unless sales exist. Command: `/impeccable clarify`.

3. **P1: Slow movers overlaps on mobile.** At 390px the item name, category and "Never sold" text collide (visible in month-m.png: "Jack Daniel's Tennessee WhiskeySpirits" run into "Never sold"). Row is single-line flex with truncation on an inner span only. Fix: stack the row (name and category line, then status and value line) below sm, and use dividers. Command: `/impeccable adapt`.

4. **P2: No hierarchy or "what drove it" on Week/Month.** Four equal stat tiles, then six equal cards. The primary task (how did the period go, what drove it) has no lead: no comparison to the prior period, no best/worst day, no headline. Revenue trend sits last. Fix: lead with revenue plus delta vs previous period, put Revenue trend directly under the stats, then Category mix, move per-item tables behind a disclosure. Command: `/impeccable layout`.

5. **P2: Period identity is weak.** Raw ISO strings as the only date, Tonight and Day share the same title and layout, Tonight at 2am shows yesterday's date without saying "Tuesday night, 24 Nov (ends 4am)". Fix: human date labels ("Tue 24 Nov"), title the view by what it is, add "Tonight so far" text, and a "Today" jump link. Command: `/impeccable clarify`.

6. **P3: Empty-state remedy is not actionable.** "The Rail agent on the bar PC records it" has no link to setup or agent download; "Price your items" has no link to inventory costs. Fix: add an inline link or button to the relevant Settings or inventory screen. Command: `/impeccable onboard`.

## Persona red flags
- **Owner checking the night and week:** opens Tonight and gets no number; opens Week and gets $0.00 and ten "Never sold" items. Cannot tell whether the bar had a bad week or the feed is missing. Needs total, vs last week, best night.
- **Manager on shift, phone:** toggle is small and left-aligned, four stacked stat tiles push content down 400px, slow-mover rows overlap. The FAB and bottom nav sit over content in a fullpage capture (artifact of capture, but the bottom of the page needs padding to be verified).
- **Rubric persona, first-time user without an agent:** sees "Your POS feed sends daily totals only" which is jargon and does not say what to do next or whether something is broken.

## Minor observations
- Amber "Never sold" (amber-600 on white, about 3.2:1 at 12px) likely fails 4.5:1; DESIGN.md prescribes amber-text #92400E for text.
- Header icon (trend arrow) next to the h1 is decorative duplication with the nav icon.
- Arrow buttons use plain unicode glyphs; a chevron icon would be crisper and consistent with the rest of the app.
- Slow movers item names are link-coloured but nothing on the row indicates where they go.
- "Margin" tile is green on $0.00; success colour on zero is misleading.
- Page uses `<a>` for prev/next instead of next/link (full reload feel is possible).

## Could not verify
- Any populated state (LiveBand, charts, hourly curve, server table, MenuQuadrant, PaymentSplit, trend chart): demo org has no data, so judged from code only.
- Whether the Day view with an empty Z row shows a total from daily Z rows (code path says no).
- Dark mode, keyboard focus order, screen reader output, chart accessibility, slow loading/skeleton (loading.tsx not inspected).
- Real contrast values (estimated from tokens, not measured).
