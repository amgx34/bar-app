# Inventory (items) - design review, run 2

Route `/app/inventory`, demo org, Operate mode. Seen at 1280x800 and 390x844 (full page), search no-results, and the Adjust stock dialog on both sizes. Nothing was saved.

## Heuristic scores

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 2 | Optimistic stock update is good, but "Low Stock" / "In Stock" chips highlight as active while nothing changes; no result count anywhere. |
| 2 | Match with real world | 3 | Bar vocabulary (par, pour, case, bottle) is right. Dialog Reason trigger shows raw value "delivery" instead of "Delivery received". |
| 3 | User control and freedom | 3 | Dialogs cancel cleanly, optimistic update auto-reverts. No undo after save. Filter panel collapse is easy to miss. |
| 4 | Consistency and standards | 3 | Components and tokens consistent. Phone card says "In stock / Par", desktop says "Stock / Par"; "Menu price" vs "Price". |
| 5 | Error prevention | 2 | Adjust defaults to Add/Remove with reason "delivery", so a physical count saved with defaults is logged as a delivery. Free-typed negative sign for removal. |
| 6 | Recognition vs recall | 2 | Stock vs par never shown as a ratio or bar; the user compares two numbers. Triangle icon on every low row, no stated meaning. |
| 7 | Flexibility and efficiency | 1 | Adjusting one item is: find row, tap kebab, tap menu item, switch mode, type, choose reason, save. No inline +/- or tap-row-to-count. |
| 8 | Aesthetic and minimalist design | 2 | Four chart/summary cards sit above the list; Cost of Product on Hand card is ~60% empty; shipment list repeats 15 rows of "+n". |
| 9 | Error recovery / help | 1 | Search with no match says "No items yet - Click Add item to create your first item" (wrong state, wrong advice). |
| 10 | Help and documentation | 2 | Placeholder hints exist ("e.g. 12 or -2"); no explanation of par, triangle, or pack counting outside the dialog. |

**Total: 21 / 40** (Acceptable, significant improvement needed for the primary task).

## Specificity verdict
Partly specific. Fira Code headings, navy/amber and tabular figures do carry the "clipboard" idea, and the dashboard headings look like Rail. But the list itself is a generic shadcn table / card stack, and the screen opens with an analytics panel rather than the thing a bar person came for. The design system promises "large tabular figures"; stock numbers here are 14px regular weight, the same as the category text.

## Cognitive load
Failed checklist items: single focus (charts and shipments compete with the list), chunking (5 dashboard regions plus a filter row of 8 controls), minimal choices (search, category, 3 chips, Categories, AI Import, Add item, Show inactive = 8+ visible options), visual hierarchy (list is last, and low-stock marks appear on every row so nothing stands out), working memory (stock and par compared mentally). **5 failures = high cognitive load.** Progressive disclosure partly works (collapsible panels).

## Strengths
- Phone layout is a true card stack, not a squeezed table; stock and par lead the card, 44px kebab target on phones.
- Optimistic stock update plus pack calculator ("Count by the case") fits a counting workflow.
- Pure server-scoped data, correct role gating on actions, sr-only h1.
- No horizontal scroll at 390px; only 1 sub-40px control measured on mobile.
- Mobile dashboard bars render readably; desktop chart labels truncate to "..." (see below).

## Priority issues

**P1 - The Low Stock / In Stock filter does nothing.** `page.tsx` reads only `q`, `category`, `include_inactive`; the chips write `?stock=` that is never read (`inventory-header.tsx` lines 29-31, 47). The single most useful filter for a manager counting stock silently fails and the chip still turns active. Fix: apply the `stock` param in the query/page (compare `current_stock` to `par_level`, which needs a post-filter or RPC), or remove the chips until it works. Command: `/impeccable harden inventory stock filter`.

**P1 - The primary task is buried and slow on a phone.** On mobile the list starts roughly 1,100px down, below Top Sellers, Biggest Losses and Cost cards (page is 6,781px tall); the search field is then in a collapsible panel. Adjusting needs kebab, menu, dialog, mode tab, reason select. Fix: move the dashboard below the list (or collapse it by default on phones), make the search sticky, and add a one-tap count/+/- control on each card that opens a small numeric sheet with Set/Add already chosen. Command: `/impeccable adapt` then `/impeccable layout`.

**P1 - Wrong empty state for a search with no results.** `?q=zzzzqq` shows "No items yet / Click Add item to create your first inventory item", and the dashboard above reports "$0.00, 0 items currently in stock" because it is fed the filtered list. That is a false statement of the bar's stock value (violates "say what is missing" and "exact over impressive"). Fix: distinguish zero items from zero matches ("No items match 'zzzzqq'" with a Clear search button); feed the dashboard totals from unfiltered data. Command: `/impeccable clarify`.

**P2 - Stock versus par is not scannable.** Every demo row is under par, so every row carries an amber triangle; the signal carries no information, and the triangle has no text alternative (no aria-label/title, amber on white is below 3:1 for an icon). Stock number is not larger or bolder than par. Fix: show "5 / 8" with a small fill bar, make stock the largest figure, reserve amber for below par and a stronger treatment for zero, add `aria-label="Below par"` and a text cue. Command: `/impeccable typeset` + `/impeccable colorize`.

**P2 - Adjust dialog on a phone.** The mode tabs render clipped (tab pill is taller than the track, "Set exact count" is cut), Reason shows the raw "delivery" slug, and the default reason is "Delivery received" even when the user is counting. Save/Cancel sit full width, which is good, but the form needs scrolling past a note field before saving. Fix: default to Set exact count when opened from a count flow, show the human label in the trigger, put quantity first and auto-focus with `inputmode="decimal"`. Command: `/impeccable polish stock-adjust-dialog`.

**P3 - Dashboard panel quality.** Cost of Product on Hand card stretches to the height of the shipment list and is mostly empty; desktop bar charts truncate labels to "...", leaving unlabeled bars; Latest Shipment lists 15 identical rows including "ZZ Walk Test Item Edited". Fix: shrink to a KPI strip (value on hand, items below par, last delivery), link to Shipments. Command: `/impeccable distill`.

## Persona red flags
- **Manager on shift, phone, one hand:** sees charts before items; the low-stock chip they would reach for does nothing; the ⋯ menu then dialog costs about 6 taps per item; no running count of items still to do.
- **Owner reviewing stock value:** headline $2,623.89 is right but sits beside a shipment log, no per-category value or below-par count; value flips to $0.00 under any search or category filter, which will read as data loss.
- **Screen-reader / low-vision user (accessibility persona):** triangle icons unlabeled; colour-only amber left border on phone cards; chart text at about 9px; filter chips are `button`s with no pressed state (`aria-pressed`), so the active filter is conveyed by colour alone.

## Minor observations
- Filter panel toggle is a 1px-line chevron strip below the filters; hard to find and about 28px tall.
- "AI Import" in blue outline and "Add item" filled: fine, but 4 actions in one row wrap to a second line on desktop.
- Vendor names under item name are muted at `/60` opacity, likely under 4.5:1.
- Inactive items use 50% opacity on the whole row, which lowers contrast of any text in it.
- Price column shows "-" for every item in the demo; no hint how to set it.
- Next dev badge overlaps the sidebar bottom (dev only).

## Could not verify
- Real contrast values of the amber icon and `/60` text (estimated from tokens, not measured).
- Low-stock, empty and error states beyond no-results (no data variants to hit; did not alter data).
- Behaviour on slow networks, loading skeleton, and the ItemForm and Import dialogs (not opened in detail).
- Dark theme and keyboard tab order.
- Whether the optimistic stock update visibly reverts on failure (would require submitting).
