# Critique: Inventory Shipments (run 2)

Screen: `/app/inventory/shipments`. Mode: Operate. Assessment A. Viewed at 1280x800 and 390x844 with the demo org. Only the idle step of the log dialog was seen live; the review, importing and done steps were read from source.

## Heuristic scores

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 3 | Parsing, posting and done states are clear. The done step says "stock and cost prices are updated" but gives no total and no link to the new row. |
| 2 | Match system / real world | 3 | Vendor, invoice #, freight, deposits and unit are the operator's own words. "Computed", "Lines" and "MATCH / NEW ITEM" are less obvious. |
| 3 | User control and freedom | 2 | The only correction is void and re-enter. Voiding is undoable by nobody, and there is no edit. Start over exists, and the AI step is skippable only by pasting. |
| 4 | Consistency and standards | 3 | Matches the Rail table and dialog patterns. The review table uses hand-rolled borderless inputs rather than the `Input` used in the header just above it. |
| 5 | Error prevention | 3 | Price-change gate with an explicit approval, reconcile before post, and per-line validation. Post is allowed when the total is "over/short". A negative or odd unit conversion is not caught. |
| 6 | Recognition rather than recall | 2 | The user must carry the paper invoice in their head or a second tab; there is no unit/stock context per line (current stock, pack size) for matched items. A MATCH shows no which item it matched. |
| 7 | Flexibility and efficiency | 1 | Paste-text is the only entry path. There is no manual entry, no photo or PDF upload, no "from a rep order" prefill, no filter, search or sort on the log. A bar with no AI parse has no route in. |
| 8 | Aesthetic and minimalist design | 3 | Restrained list and a clean dialog. The review header is 8 equal-weight fields in a grid, and the 7-column line table is dense. |
| 9 | Error recovery | 2 | Void confirmation names effect and vendor. Parse failure and post failure are toasts only (not verified live). A voided row cannot be re-opened or cloned into a corrected draft. |
| 10 | Help and documentation | 2 | Placeholder lists what to paste. Nothing explains "Total vs Invoice total", pack toggles (x6 / ÷6) or what "Apply this price" changes in the books. |
| **Total** | | **24 / 40** | |

## Specificity verdict

Fairly specific, in function more than in look. The reconcile-before-post line, the signed "off" delta, and the price-change approval gate are things only a real receiving workflow would produce. The visual layer is the generic Rail table-in-a-card, with no receiving-specific presentation (vendor grouping, status chips, cost trend). One-row demo state means the list itself could not be judged for density.

## Cognitive load

Failed checklist items, 3 of 8: working memory (invoice must be read from elsewhere and matched), minimal choices (header 8 fields plus 7 columns plus pack toggle plus approval checkbox in one view), progressive disclosure (freight/tax/deposits/other always shown, even when 0). Moderate load, at the upper edge on mobile. Single focus and chunking are otherwise good.

## Strengths

- Reconciliation shown before posting, with plain "over / short of" wording and a tick when it ties. Directly serves "exact over impressive".
- The list surfaces drift as a signed amber delta rather than burying it.
- Void dialog names vendor, invoice number and dollar effect, and states both stock and books consequences.
- Price changes above a threshold need an explicit per-line approval; the Post button explains why it is disabled.
- Date handled without the UTC off-by-one. Empty state is role-aware and does not render a dead button.
- Labels are bound to inputs in the header; required fields are marked and `aria-invalid` is set.

## Priority issues

### 1. [P1] Voided rows keep a live-looking number and fade by opacity
Why: the voided $25.00 sits in the Total column in bold, at 60% opacity on the whole row. Anyone scanning the column for what a month cost can add it. Opacity also pulls the muted text near or under AA contrast (seen in the screenshot: pale vendor and invoice cells). A voided cost is exactly the figure that must not read as live.
Fix: strike through or replace the figures on voided rows ("Voided - $25.00 reversed"), keep text at full contrast and rely on the badge plus a left rule; sort voided below live or add a "Show voided" toggle.
Command: `/impeccable clarify` then `/impeccable polish` on shipment-list.tsx.

### 2. [P1] Mobile hides the money and the Void control
Why: at 390px the Total, Invoice total, discrepancy and Void action are off-screen inside an inner scroller with no affordance (the screenshot shows "$25" clipped). The "ties out to the invoice" job, the screen's stated purpose, is invisible on the phone this product says it is built for. Void is likewise unreachable without discovering the scroll.
Fix: below `md`, render each shipment as a card: vendor and date on top, total and invoice total with the off-delta beneath, Void as a full-height action. Keep the table at desktop.
Command: `/impeccable adapt`.

### 3. [P1] The line review table is not phone-usable and edits money in 64px bare inputs
Why: seven columns, `w-16` borderless inputs for qty and unit cost, no visible field edge (the focus ring is the only cue), 10px badges. Operators correcting a cost mistake in a dim bar will mistype. This is the step where a wrong number becomes wrong books, so it is the highest-stakes edit surface on the screen.
Fix: stack each line as a card on mobile with labelled Qty / Unit / Unit cost / Line total, use the shared `Input` with a visible edge and at least 44px targets; move the MATCH / NEW ITEM badge to carry the matched item's name.
Command: `/impeccable adapt` with `/impeccable harden`.

### 4. [P2] Only one way in: pasted invoice text
Why: the primary task has no path for a bar without clean invoice text (a photo, a PDF, typing a three-line delivery by hand), and AI failure leaves "Start over" as the only recovery. The header and line editor already exist, so a blank-draft route is cheap. The page also never says the numbers come from AI and need checking, other than one line in the dialog.
Fix: add "Enter manually" beside "Read invoice" that opens the review step with one empty line; add a plain "AI can misread quantities and prices; check each line against the paper" line above the table in review.
Command: `/impeccable onboard` / `/impeccable clarify`.

### 5. [P2] Review step lacks the context to catch a quantity or unit mistake
Why: a MATCH line shows no existing stock, no stock unit, and no pack size beyond a cryptic "x6 / ÷6" toggle. The pack button changes quantity and unit cost while "the line total stays the same", which is correct but easy to misread as the quantity being wrong. A user cannot tell if 12 cases becomes 12 or 144 stock units before posting. Only price changes are flagged; quantity surprises are not.
Fix: per matched line show "stock now -> after" in stock units; label the toggle "Count as singles (x6)"; flag quantity outliers against par or last delivery the way price changes are flagged.
Command: `/impeccable clarify` / `/impeccable harden`.

### 6. [P3] Heading and structure on the list
Why: H1 plus subtitle plus a right-aligned primary button floating on its own row wastes the top of the screen; with 1 row the table sits under a large gap. "Total" vs "Invoice total" is ambiguous (posted-to-stock vs billed), and no date range, vendor filter or search exists, which matters once there are 50 rows.
Fix: put the button in the heading row, rename columns "Posted to stock" and "Invoice total", add vendor filter and month grouping.
Command: `/impeccable layout`.

## Persona red flags

- **Manager receiving a delivery (phone, at the back door):** cannot see the total or off-by-amount without sideways scrolling; must paste invoice text, which is hard from a phone photo; sees seven tiny columns to correct. Likely to give up and post unchecked or not log at all.
- **Owner checking what an invoice cost:** voided $25.00 reads like a live charge; "Total" vs "Invoice total" must be decoded; no way to open a row to see its lines, freight, tax or allocation (rows are not clickable). The recorded unit cost is the whole point of the feature and is not viewable after posting.
- **Rubric persona, first-time user / low vision in a dim bar:** the faded voided row and the 10px badges are low contrast; the empty state's primary action is clear, but the dialog never says what "Read invoice" will do to stock.

## Minor observations

- Rows have no link to a detail view; the log is a dead end for audit.
- Currency, date and number inputs use `parseFloat(...) || 0`, so clearing a field silently becomes 0, including an invoice total typed then deleted (null is preserved only for the total).
- Void button is ghost, muted, sub-44px; it turns destructive only on hover (no hover on touch).
- `title` attribute carries the explanation of the "off" delta; not available on touch or reliably to screen readers. Put it in visible text or `aria-label`.
- The "Done" step offers "Back to shipments" but the new row is only guaranteed after a refresh (not verified).
- Fira Code headings are on-brand; breadcrumb plus tab bar plus H1 repeat "Shipments" three times.
- Dialog `max-w-4xl` at idle is narrower than the review step needs; the layout jump on parse was not observed.

## What I could not verify

- Review, importing and done steps rendered live (would require parsing with AI or posting; prohibited). Judged from source only.
- A list with more than one row, a shipment with an "off" delta, or a live (not voided) row; the demo had a single voided shipment.
- Screen-reader announcements, keyboard order in the dialog, and measured contrast beyond visual inspection.
- Dark mode, error toasts, and the void dialog rendered (no live row to void).
