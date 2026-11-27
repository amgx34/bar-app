# Critique: Inventory (items) — run 1

Mode: Operate. Screens seen: /app/inventory at 1280x800 and 390x844 (demo org, 28 items, all at or below par); no-results state (`?q=zzzzqq`, screenshot taken but not studied closely). Source read: page.tsx, inventory-table.tsx, stock-adjust-dialog.tsx, inventory-header.tsx (grep only).

## Heuristics

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 3 | Optimistic stock update plus toast is good; but the below-par flag fires on nearly every row so it signals nothing, and there is no "N items below par" summary. |
| 2 | Match with real world | 3 | Bar vocabulary (par, bottle, case, pour); "Menu price", "Cost of Product on Hand" are plain. Stock in raw singles unless pack set. |
| 3 | User control and freedom | 3 | Dialogs cancellable; panel collapsible. Adjust dialog has no undo after save. |
| 4 | Consistency and standards | 2 | Desktop table and phone cards disagree: phone shows pack breakdown and "5 bottle", desktop shows bare "5" with the pack text hidden in a title tooltip. Desktop Stock header is misaligned from its figures. |
| 5 | Error prevention | 2 | Adjust defaults to "Add / Remove" with reason "Delivery received", so a count entered by habit as 12 adds 12. Reason default is wrong for counting. No confirm of the resulting total. |
| 6 | Recognition rather than recall | 2 | Adjusting needs a 3-dot menu then a menu item then a dialog. In Add/Remove mode the dialog does not show the resulting stock. Par shown without unit. |
| 7 | Flexibility and efficiency | 2 | No inline +/- or tap-to-edit count, no sort, no scan, no "Count" mode; the Weigh tab exists but is not signposted from here. Optimistic update comment itself says counting is done in bursts, yet each item costs about 5 taps. |
| 8 | Aesthetic and minimalist design | 2 | Four chart/summary cards precede the list; on a phone the items start about 1,400px down (page 6,800px tall). Cost of Product on Hand card is a big empty box beside a long shipment list. |
| 9 | Error recovery | 3 | Zod field errors, toast with server message, optimistic revert. Page-level query error is a bare red string. |
| 10 | Help and documentation | 2 | Empty state is good; no-results wording not verified; "Biggest Losses"/"Top Sellers" have no unit or period, no explanation. |

**Total: 24 / 40** (Acceptable, significant improvements needed for the primary task).

## Design specificity

Mixed. The Fira Code headings, navy ink and amber accents read as Rail, and the tabular figures and amber left band on phone cards are on-brief. But the screen is generic dashboard-plus-table: the primary task (count and adjust) is not the composition. It leads with analytics. Not interchangeable with another SaaS in colour, but interchangeable in structure.

## Cognitive load

Failures: single focus (charts compete with the list), visual hierarchy (above-fold content is chart cards, not items), minimal choices (header row on phone: search, category select, 3 filter chips, Categories, AI Import, Add item, Show inactive = 8+ controls), chunking (28 undifferentiated cards), progressive disclosure partial (panel collapses but is open by default and the state is not shown to persist). Passing: grouping, working memory. **4 failures = high load.**

## Strengths

- Phone card leads with stock and par, amber left band, 44px action target; tabular figures.
- Optimistic stock update that reverts on failure; role-gated actions defined once.
- Pack calculator in the adjust dialog; reason list suits a bar.
- Alerts use icon plus colour plus band (not colour alone).
- No horizontal scroll at 390px; chart collapses to readable bars on phone while desktop truncates labels ("Ite...", "K...", "Tit...").

## Priority issues

**P1 — The list is buried under analytics (phone and desktop).** Why: the primary task is find, compare to par, adjust; the user scrolls ~1,400px on a phone past four cards, and the search field sits mid-page and can slide under the sticky header. Fix: put search, filters and the list first; collapse Inventory Overview by default (remember the choice) or move to Analytics; make search sticky. Command: `/impeccable layout`.

**P1 — Adjusting stock takes about 5 taps through a 3-dot menu and defaults to the wrong mode.** Why: one-handed counting in a dim bar; "Add / Remove" with "Delivery received" preselected invites an add-instead-of-set error that corrupts stock and cost data. Fix: put an "Adjust" button or tap-on-stock-figure on every row; open in "Set exact count" with reason "Physical count" when launched from a count flow; show "5 -> 12" preview before Save; autofocus numeric field with `inputmode`. Command: `/impeccable clarify` then `/impeccable harden`.

**P2 — Below-par signal has lost meaning.** Why: in the demo all 28 rows carry the warning icon, so the eye cannot find the worst; the icon is 14px amber on white (low contrast for non-text, small). Fix: show a gap or ratio ("5 of 8", a small bar), sort/filter "Below par" first with a count chip, reserve amber for severe (under half of par or zero), and give 0 stock (Fresh Lime Juice) a stronger state. Command: `/impeccable colorize`.

**P2 — Desktop and phone present stock differently.** Why: pack-aware text ("5 bottle", pack breakdown) only on phone; desktop shows a bare number with the unit in another column and pack detail only in a hover title (inaccessible on touch and to keyboard). The Stock header also does not align with its right-aligned figures because the icon shifts them. Fix: share one StockCell component; reserve the icon column. Command: `/impeccable polish`.

**P2 — Header controls overload the phone.** Why: 8+ controls above the list, wrapped into four rows; "Categories", "AI Import", "Add item", "Show inactive" are of different weights with no hierarchy, and Add item competes with the floating action button. Fix: search plus one Filters sheet; move Categories and AI Import into an overflow menu. Command: `/impeccable distill`.

**P3 — Dashboard cards are poorly composed.** Why: Cost of Product on Hand has one number and a large void next to a long shipment list; chart y-axis labels truncate to "..." on desktop making Top Sellers unreadable; no period or unit on the figures (what does 0.33 of a bottle sold mean, over what days?). Test-data names ("ZZ Walk Test Item") surface here (demo data, not design). Fix: align card heights, give figures units and a period, widen label column. Command: `/impeccable layout`.

## Personas

- **Manager counting on a phone, one-handed:** must scroll past charts, find the item, tap a 3-dot menu at the top right of the card (far from the thumb), pick the menu item, switch to Set mode, type, choose reason, Save. FAB sits over card content and the menu trigger of the item beneath it. Red flag: the delivery default.
- **Owner reviewing stock value:** "Cost of Product on Hand $2,623.89" is the first-glance figure, good; but no per-item or per-category value on the list, no total below par, and the figure does not say whether it uses recorded unit cost. Cannot tell what to reorder without scanning 28 rows.
- **Rubric persona, first-time user:** unlabeled "Top Sellers"/"Biggest Losses" bars with no unit, "AI Import", "Setup" and "Weigh" tabs do not explain themselves; the Weigh vs Adjust distinction is unclear.

## Minor observations

- Desktop table has a Unit column that could merge into Stock ("5 bottle").
- Price column shows "—" for every demo item; fine, but nothing says "not set".
- Cost uses muted text; check contrast of `text-muted-foreground/60` rep names (low).
- Desktop action trigger is 36x36 and chips 26px high; below 44px on desktop is fine, but the phone chips ("All", "In Stock", "Low Stock") are about 26-32px tall by measurement at desktop only; phone looked 32px, below the 44px target.
- Sidebar subnav duplicates the top tab row (Items, Weigh, Shipments, Setup, Analytics): two navs for one section.
- The h1 is sr-only; page has no visible title, so a screen reader and a sighted user get different structure.

## Could not verify

- Opening the adjust dialog and the dropdown on the live page (read from source only); the no-results copy (source shows the empty state only for zero items, so a search with no matches likely shows "No items yet" and the "Click Add item" advice, which is wrong; I did not confirm visually); dark mode; loading state (loading.tsx not inspected); error state; keyboard-only flow; real contrast measurements; whether the overview panel state persists.
