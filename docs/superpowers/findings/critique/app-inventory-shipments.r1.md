# Design review (Assessment A) — Inventory Shipments, run 1

Screen: `/app/inventory/shipments`. Mode: Operate. Viewed at 1280x800 and 390x844 (list and the opened Log-a-shipment dialog, step 1 only). Demo org had a single voided row, so the discrepancy flag and the review/post steps were assessed from source, not seen live.

## Heuristic scores

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 3 | Parse, posting and posted states are explicit; but the list never says what a "Voided" row did to stock/books, and there is no "last logged" or totals context. |
| 2 | Match with the real world | 3 | Vendor, invoice #, freight, deposits, "ties to the invoice" are bar-owner language. "Total" vs "Invoice total" columns are ambiguous (computed vs billed is never named). |
| 3 | User control and freedom | 2 | Void is the only correction path (void + retype whole invoice); "Start over" exists in the dialog; no edit, no undo of void, no draft kept if the dialog is dismissed. |
| 4 | Consistency and standards | 3 | Uses house Table/Badge/Button, but the dialog hand-rolls a raw `<table>`, raw `<button>` and 12px uppercase headers, diverging from the list. |
| 5 | Error prevention | 3 | Reconciliation shown before posting, price-change confirmation gate, per-line validation. Gap: errors surface as transient toasts for header fields, no duplicate-invoice check visible. |
| 6 | Recognition rather than recall | 2 | The list shows no items, no unit totals, no freight/tax breakdown, no link to the stock movements; owner must remember what an invoice contained or open nothing (rows are not clickable). |
| 7 | Flexibility and efficiency | 2 | Paste-text only visible; no invoice image/PDF path on screen, no filter/search/sort by vendor or date, no row detail. Fine for 1 row, weak at 200. |
| 8 | Aesthetic and minimalist design | 3 | Clean, restrained, one primary action. The page is nearly empty and gives the mono display H1 more weight than the data; voided row is faded to near-illegible. |
| 9 | Error recovery | 2 | Toasts name the problem ("Vendor is required") but vanish; mobile hides the Void/discrepancy columns off-screen; a failed AI parse says "try rephrasing" with no preserved context cue. |
| 10 | Help and documentation | 2 | Dialog explains "AI will read the header and line items, then you correct and post"; no explanation of what "off" means, what voiding reverses (only in confirm), or unit conversion (case vs each). |
| | **Total** | **25/40** | |

## Design specificity verdict

Partly specific. The Rail chrome (navy sidebar, Fira Code heading, tabular figures, amber for the discrepancy) is recognisably this product, and the reconciliation strip ("Ties to the invoice" / "$X over the invoice total") is a genuinely domain-shaped idea. But the list itself is a stock shadcn table: seven columns, header row, one ghost button per row. Nothing on the list embodies "exact, traceable cost": no per-shipment cost breakdown, no link to the lines, nothing that says what the delivery did. It reads as a log table, not a ledger a bar owner can audit.

## Cognitive load

Failures from the 8-item checklist: (1) visual hierarchy on the list (Total and Invoice total look identical in weight; the only emphasis is the page title); (2) working memory (the list shows no line detail, so cost questions require recall of the paper); (3) progressive disclosure (none: no row expansion at all, and the dialog review step crams 8 header fields plus a 7-column line table plus a reconciliation bar into one modal). Single focus, chunking, grouping and minimal choices are fine on the list. Dialog review step exceeds 8 simultaneous inputs. Result: moderate load on the list, high on the dialog review step, especially on a phone.

## Strengths

- Reconciliation computed and shown before posting, with the failure mode (a wrong pour cost next month) named in a code comment; the list repeats it as a signed delta.
- Void confirm names vendor, invoice # and amount and states both effects (stock reversed, books reduced) in plain language.
- Date handling avoids the UTC off-by-one; amounts tabular and right-aligned.
- Empty state is role-aware (manager sees the action, staff sees an explanation, no dead button).
- Role gating on every mutating control; dialog has a loading state and a posted state with "Start over".
- Clean single primary action; tab strip and breadcrumb keep location clear.

## Priority issues

### 1. P1 — Voided shipment still presents live-looking money (misleading)
The whole voided row is `opacity-60` but still shows "$25.00" in bold and "Invoice total $25.00". At 60% opacity the pale blue-grey text is also likely under 4.5:1 (visible in the screenshot: date, invoice # and vendor are washed out). A reader scanning the Total column sees a cost that is no longer in the books. 
Fix: strike through or replace the Total with "Voided — $0.00 in books" (keep the original amount as muted secondary text), keep text at full contrast and mark state with the badge plus a line-through on the amount. Also place Voided state before the amount in reading order (screen readers read the badge last).
Command: `/impeccable clarify` on the voided row and `/impeccable polish` for contrast.

### 2. P1 — On a phone the columns that carry the cost are clipped and Void is unreachable
At 390px the table scrolls horizontally inside its card; "Total" is cut at "$25" and "Invoice total", the discrepancy delta and the Void button are off-screen with no scroll cue. The primary question (what did this cost, does it tie) is invisible on first view on the device the product principle says this is built for.
Fix: below `md`, render rows as stacked cards: vendor + date on one line, Total large and right-aligned, a status line ("Ties to invoice" / "$12.40 off" / "Voided"), invoice # and Void in a secondary row at 44px target. Hide "Lines" on mobile.
Command: `/impeccable adapt`.

### 3. P1 — "Total" vs "Invoice total" and "+$X off" do not say which is which
`Total` is what Rail posted; `Invoice total` is what the vendor billed; the delta is billed minus posted, with a plus meaning Rail posted less than billed. The amber "+$12.40 off" has a tooltip only (not keyboard/touch reachable) and reads like an error amount rather than a direction. An owner could read it backwards and chase the wrong side.
Fix: rename columns "Posted to books" and "Vendor billed"; replace the delta with a sentence-level label such as "$12.40 less than invoice" / "$12.40 more than invoice"; add a no-flag state "Ties out" so a matching row is positively confirmed rather than silent. Pair amber with an icon (colour is the only signal now).
Command: `/impeccable clarify`.

### 4. P2 — No way to see what an invoice contained or what it did to stock
Rows are not interactive: no line items, freight, tax or deposit breakdown, no link to the stock movements. The owner asking "what did this invoice cost me" can only see one total, and a manager cannot check a delivery after posting except by voiding it. This also conflicts with the product principle that screens link to the numbers they cite.
Fix: make the row expandable (or a detail drawer) showing lines with unit cost, freight/tax/other allocation, and links to the affected items; show line count as the trigger.
Command: `/impeccable layout`.

### 5. P2 — Review step of the log dialog is one overloaded modal; correction is only void-and-retype
Eight header inputs, a seven-column line table (including a 224px "Price change" column) and a reconciliation bar share one scrolling modal; on 390px that table needs horizontal scrolling inside a modal inside a phone. Header validation errors (vendor, date) are toasts that vanish, not inline. After posting, the only fix for a typo is to void and re-enter the whole invoice, with no prefill from the voided one.
Fix: split review into two steps (header + charges, then lines), keep the reconciliation bar sticky, move field errors inline with `aria-describedby`, and offer "Re-enter from voided invoice" that prefills the dialog.
Command: `/impeccable distill` then `/impeccable harden`.

### 6. P3 — Page composition and list scalability
The header sits far above a right-aligned lone button, leaving a wide dead band; at 200 rows there is no search, vendor/date filter, sort or pagination, and no summary (this month's delivered cost, count of mismatches). Display H1 in Fira Code is the strongest element on a data screen.
Fix: put the button in the header row, add a small summary strip (posted this month, shipments needing attention) and vendor/date filter.
Command: `/impeccable layout`.

## Persona red flags

- Manager receiving a delivery (phone, behind the bar, dim light): must paste invoice text; the page gives no sign of a camera/photo path; cannot see Total/Invoice total or reach Void on the list at 390px; review table scrolls sideways inside a modal; header errors are toasts that disappear. Likely to abandon and log it later.
- Owner checking what an invoice cost: sees one number per invoice, cannot see lines, freight or tax; voided invoice still shows a bold amount; "+$X off" direction unclear. Cannot tell whether a mismatch was fixed.
- Accessibility-dependent keyboard/screen-reader user (rubric persona): discrepancy explanation is a `title` tooltip only; amber status is colour plus text but no icon in the list; Void buttons all read "Void" with no row context in the accessible name; voided row reduced-contrast text; the raw `<button>` "Start over" is 12px with a small target.

## Minor observations

- Void buttons repeat the identical label per row; add `aria-label="Void ZW-1 from ZZ Walk Dist"`.
- Date column shows invoice date, but the page never says whether delivery date differs from the invoice date (the two clocks differ per project notes; label it "Invoice date").
- Voided badge is pale red on pale red; verify 4.5:1.
- Mobile FAB duplicates the "Log a shipment" button (two entries for one action on the same screen).
- Empty state copy is good; the empty dashed card has an icon at 32px that adds little.
- Dialog description says "AI will read" but does not warn that the AI can misread quantities or units; the reconciliation bar is the only guard.
- Dialog lines table uses 12px uppercase headers and 12px helper text, below the 14px base used elsewhere.

## What could not be verified

- Discrepancy ("+$X off") rendering, ties-out state, review-step layout and price-change confirmation: no non-voided shipment in the demo org and I did not parse or submit anything. Judged from source only.
- Actual computed contrast of the faded voided row and the amber text; judged by eye and token values.
- Behaviour at 100+ rows (pagination/scroll), loading and error states of `listShipments`, dark theme, screen-reader output, whether an invoice image/PDF upload exists (not visible in step 1).
- Void confirm dialog was read from source, not opened.
