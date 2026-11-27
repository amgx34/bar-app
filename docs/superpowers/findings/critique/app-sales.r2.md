# Sales (/app/sales) design review, run 2

Mode: Operate. Viewed Tonight, Day, Week, Month at 1280x800 and 390x844 (demo org, no POS agent). Source read: page.tsx, night-view.tsx, missing-panel.tsx.

## Heuristics (0-4)

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 2 | Tonight/Day with no data render only two "missing capability" cards: no revenue total, no "no sales recorded for this night", no as-of/sync line. Week/Month show `$0.00` and a green `$0.00` margin as if measured. |
| 2 | Match with real world | 3 | Bar language is good ("Who was pouring", "Slow movers", "What earns its place"). Dates are raw ISO (`2026-11-23 – 2026-11-29`); title "The night" under a "Tonight" tab. |
| 3 | User control and freedom | 3 | Prev/next arrows, 4 views, sort links, all real links and URL-addressable. Switching view silently resets period (Day jumps to 11-25 while Tonight shows 11-24). |
| 4 | Consistency and standards | 2 | Three empty-state dialects (info card with icon, centred grey sentence in tall cards, bare text) and uneven card heights. Sort chips use filled-primary like the toggle but are different controls. |
| 5 | Error prevention | 3 | Server-clock guess avoided by waiting for the browser's hour; nothing destructive on screen. Next arrow can page into the future with no guard. |
| 6 | Recognition over recall | 3 | Labels visible, active state clear. Margin % is unexplained ("—" with no reason), "Cost to pour" vs "Ingredient cost" overlap. |
| 7 | Flexibility and efficiency | 2 | No jump-to-date, no "this week vs last week" delta, no compare. Week/Month are a long scroll of 6 stacked cards. |
| 8 | Aesthetic and minimal design | 2 | Clean, but the empty month is 8 full-height cards saying "nothing". Large dead card padding. On mobile the 4 stat cards stack to 4 full rows (about 500px) before any content. |
| 9 | Error recovery | 2 | Empty states name the fix for hourly/server ("Rail agent on the bar PC") but the cost-empty ones ("Price your items") give no link. No error state seen or visible in code for a failed fetch. |
| 10 | Help and documentation | 3 | MissingPanel copy says what is missing and how to get it; no link or action to set it up. |

Total: **25 / 40** (good-but-uneven band).

## Design specificity verdict
Reasonably specific to Rail: monospace headings, navy/amber palette, bar vocabulary, honest-empty-state principle clearly followed in the hourly panels. But the Week/Month layout is a generic stacked-table dashboard; nothing answers "what drove it" in one glance (no biggest mover, no vs-last-period).

## Cognitive load
Checklist failures: single focus (Week has 6 peer cards, no lead), hierarchy (all cards equal weight, titles 14px), minimal choices (fine), progressive disclosure (Every item and Slow movers fully open, 10 rows each). Failed roughly 3 of 8: moderate load, and mostly extraneous (equal-weight empty cards).

## Strengths
- Principled honesty: hourly and per-server panels refuse to show zeros and say what to connect.
- Period toggle plus arrows are real links, 44px targets on mobile, URL-shareable.
- Tabular figures, tone-coded stat cards, cost-coverage and tax-inclusive notices exist.
- Tonight compares like-for-like by hour of night (per code); thoughtful.

## Priority issues

1. **P1: Mobile Slow movers rows overprint.** At 390px item name, category and "Never sold" collide (e.g. "Jack Daniel's Tennessee Whiskey Spirits" over "Never sold"); several rows unreadable. Why: layout bug on a primary phone surface, and it hits the "what to stop ordering" decision. Fix: stack the row (name + category line, right-aligned status below or `flex-wrap`), allow name to wrap. Command: `/impeccable adapt sales slow movers`.
2. **P1: Empty periods read as measured zero.** Week/Month show `$0.00` revenue, `$0.00` cost, green `$0.00` margin, "0 items sold" even though with no POS/agent this is "unknown", which PRODUCT.md says must not imply zero activity; Tonight/Day show no total at all. Fix: when summary has no sales rows, replace the stat row with one state card ("No sales recorded for 23-29 Nov. Connect the POS agent...") with a link to setup; drop green tone on zero; show "—" not $0.00. Command: `/impeccable clarify sales empty states`.
3. **P1: Week/Month do not answer "what drove it".** Six equal cards, no delta vs previous period, no top item or best night call-out, order buries Revenue trend last (below Slow movers). Fix: lead with trend + vs-last-week delta, then a single "drivers" summary (top category, best day), collapse Every item to top 5 with "show all". Command: `/impeccable layout sales`.
4. **P2: Collapse stacked empties.** Month with no data is 7 tall cards of "No sales in this window." Fix: one consolidated empty panel; hide Category mix, quadrant, margins, trend when there is no sales data; keep Slow movers. Command: `/impeccable distill sales`.
5. **P2: Dates and titles.** ISO ranges and "The night"/"The week"/"The month" headings add little; Tonight shows 11-24 while Day shows 11-25 with no explanation of the business-day cutoff. Fix: "Tue 24 Nov", "Mon 23 – Sun 29 Nov", heading carries the date or "Tonight (business day of Mon 24 Nov)". Command: `/impeccable clarify sales dates`.
6. **P3: Mobile stats stack.** Four stat cards occupy a full screen height; use 2x2 grid at 390px. Command: `/impeccable adapt sales stats`.

## Personas
- **Owner (night and week check):** opens Tonight, gets no total, no "how did we do"; has to infer from info cards. On Week gets $0 with no cause and no comparison. Red flag: cannot answer the primary task.
- **Manager on shift, phone:** Tonight loads fast but is two paragraphs of instructions; no figure. Slow movers overprint on Month. FAB and bottom nav overlap content at the fold (FAB sits over Category mix card).
- **Rubric persona, first-timer/new owner:** empty-state copy says "Rail agent on the bar PC" with no link, no how-to; dead end for a bar that has not installed it.

## Minor observations
- Section titles (`Category mix` etc.) in 14px mono; low scan weight versus the 24px page title.
- Sort chips: active state uses `aria-current="page"` but they are sort controls, not page links; fine for no-JS but semantics are off.
- Arrow glyphs "←"/"→" labelled correctly via aria-label; the date between them is not a live region.
- Slow-mover names rendered link-blue with no visible destination affordance (could not verify target).
- Amber "Never sold" on white: likely under 4.5:1 at 12px (not measured).
- Next-segment pages loading shows plain "Loading tonight's numbers…" text, no skeleton.

## Could not verify
- Populated states (charts, hourly curve, live band, server table, quadrant) since the demo has no POS data; judged from code only.
- Error and fetch-failure states, dark mode, keyboard focus order, measured contrast.
- Where slow-mover links go.
