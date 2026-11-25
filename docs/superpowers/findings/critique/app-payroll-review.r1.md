# Critique (Assessment A, run 1): Payroll Review `/app/payroll/review`

Mode: Operate. Method: source read (page.tsx, approval-panel.tsx, payroll-review-client.tsx) plus 1280x800 and 390x844 full-page screenshots of the demo org. Only the **Approved** state was observable (demo run for Nov 23-29 is approved, 2 employees, $507.00). Pending, stale-diff, changes-requested, override and empty states were judged from source only.

## Heuristic scores

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Status badge exists, but "Approved" carries no approver, time or approved amount, and the page below keeps showing live figures that may no longer equal what was approved. |
| 2 | Match with real world | 3 | Pay run, approve, send back are the owner's own words. "Confirm Payroll" and "Approve" coexist and mean different things. |
| 3 | User control and freedom | 2 | Send-back has Cancel and a required note. Approve is one click with no confirm and no amount; an approved run cannot be reopened (resubmit hidden). |
| 4 | Consistency and standards | 2 | Two back links, two H-titles, CSV and NACHA twice, hand-rolled buttons in the panel vs the `Button` component elsewhere, emerald hard-coded outside the design system's amber/navy. |
| 5 | Error prevention | 2 | Stale diff forces "Approve new figures" wording (good), but a fake local "Confirm Payroll" and an always-visible NACHA button invite wrong actions. |
| 6 | Recognition vs recall | 2 | The diff lists hours and pay only; the owner must recall or open other screens for tips, rates and reasons for the change. |
| 7 | Flexibility and efficiency | 2 | Week stepper and CSV are fine; no keyboard shortcut or "next unapproved period"; Approve cannot be done from the OpenRunBanner without navigating. |
| 8 | Aesthetic and minimal design | 2 | Clean, but the approval card is a short card above a large, duplicated header stack; KPI icon chips and the double total repeat $507.00 three times. |
| 9 | Error recovery | 2 | Errors render as a bare red line; failures from the server action have no next step. |
| 10 | Help and documentation | 2 | One-line "Approving accepts the new figures" is good; nothing explains what a snapshot is or what approval unlocks beyond "ACH export is unlocked". |
| | **Total** | **21 / 40** | |

## Design specificity verdict

Generic-leaning. Fira Code headings, tabular numerals and navy tokens give it the Rail voice, but the composition is a stock "header, KPI strip, list of cards, footer total" template. The one place that should be distinctive, the snapshot-versus-now comparison that is the whole reason this screen exists, is a small amber list appearing only when stale and only for an owner. Nothing about the layout says "this is the document being signed".

## Cognitive load

Failed checklist items: single focus (header stack, approval card, KPI strip, breakdown, actions, totals all compete), visual hierarchy (approval, the primary task, is a short quiet white card with no more weight than the cards below), minimal choices (up to 5 actions visible at once: Approve, Send back, Resubmit, CSV, NACHA, plus Confirm Payroll = 6), working memory (the diff shows deltas without the cause). 4 failures = **high** load. Intrinsic load is real (money plus tax plus approval), so the extraneous part is what to cut: duplicate titles, duplicate exports, duplicate totals.

## Strengths

- Snapshot-and-diff is the right control, and the copy "The figures changed after this was submitted ... Approving accepts the new figures. Send it back if they need checking first." is plain and honest.
- The Approve button changes to "Approve new figures" when stale, so the verb matches what the owner is accepting.
- Send back requires a note and the button disables when empty.
- Withholding states are handled with care (off, unusable, unclassified, uncollected) and say "not yet deducted - payouts still pay gross" rather than imply a zero.
- Unconfigured-rate employees get both a banner and a per-card warning.
- Tabular numerals, right-aligned totals, mobile grid collapses to 2 columns without horizontal scroll (verified at 390px).
- Role gating shows a manager the status without a dead control (PRODUCT principle 5), mostly.

## Priority issues

### 1. [P0] "Approved" badge sits over live, not frozen, numbers
**Why:** The page always renders `computePayroll()` live. The diff is fetched only when the status is `pending_approval` and only for an approver. If hours or tips change after approval, the screen still says Approved, still unlocks ACH, and shows new figures that nobody approved. On a money screen this is the one way the approval state can mislead about an amount. (Source reading; could not mutate data to reproduce.)
**Fix:** Compute the diff for `approved` runs too, and show an "Approved $507.00 on Nov 25 by <name>; figures have since changed by +$X, re-approve" state that disables the NACHA download. Show the approved snapshot total next to the live total in the approval card.
**Command:** `/impeccable harden app/(app)/app/payroll/review`

### 2. [P0] A local-only "Confirm Payroll" button beside the real approval
**Why:** `Confirm Payroll` only flips `useState` and toasts "Payroll confirmed for this period". It writes nothing, resets on reload, and sits in the same row as the NACHA download. A manager or owner can reasonably read it as the approval. Two confirm concepts on one money screen.
**Fix:** Remove it, or rename to what it really does and tie the action row to the run status (NACHA enabled only when approved, with the reason stated when disabled).
**Command:** `/impeccable clarify app/(app)/app/payroll/review`

### 3. [P1] The approval card is not the page's primary object, and the change view is too thin
**Why:** The task is "see exactly what changed, then approve or send back with confidence". The approval card is a small white card, the stale diff shows only hours and total pay per employee (no tips, rate or OT split, no timestamp of the snapshot), and the deltas are monospace-less muted text at text-xs. Approve and Send back are tiny peers of the other buttons and Approve states no amount.
**Fix:** Make the approval block the first, visually dominant region: snapshot date, snapshot total, live total, per-employee before/after table with columns for hours, tips and pay, and an Approve button reading "Approve $507.00". Keep Send back secondary.
**Command:** `/impeccable layout app/(app)/app/payroll/review`

### 4. [P1] Duplicated chrome buries the page
**Why:** Above the real content sit: layout "Payroll" H1 and Run Payroll CTA, section tabs, breadcrumb, sticky bar with Back + "Payroll Review" + dates + CSV + NACHA, then (after the approval card) a second breadcrumb "Payroll", an H2 "Pay Period Review", the dates again and org name. About 300px of the 800px viewport is titles; the week stepper and "This week" sit beneath. On mobile the approval card starts at ~435px and Total appears below the fold; exports appear in the sticky bar and again at the bottom.
**Fix:** One title, one back path, one set of export actions; fold the period stepper into the title row; make Run Payroll not appear on a review tab.
**Command:** `/impeccable distill app/(app)/app/payroll/review`

### 5. [P2] Approve is irreversible-feeling and unconfirmed
**Why:** One tap on Approve (emerald, `px-3 py-2`, below 44px touch target on phone) approves a run and unlocks money movement. There is no confirmation naming amount and period, and once approved the Resubmit/Send back controls disappear so a mistaken approval cannot be undone from here. Hand-rolled buttons also miss the design system's 44px mobile target and focus styles.
**Fix:** Use the shared `Button`, add a small confirm sheet ("Approve $507.00 for Nov 23-29?"), and allow an owner to revoke an approval with a recorded reason.
**Command:** `/impeccable adapt app/(app)/app/payroll/review`

### 6. [P2] Status and date presentation are loose
**Why:** "Submitted 11/25/2026" uses `toLocaleDateString()` in a client component (server/client locale and timezone can differ and cause hydration mismatch), shows no time and no submitter; "Approved" has no approver. Emerald, sky and amber KPI icon colours are decorative and off the "amber is the only signal" rule. The amber status pill and red "Changes requested" pill rely on colour plus icon (fine) but `text-[10px]` cell labels are below comfortable size on a phone in a dim bar.
**Fix:** Format the date server-side with the bar's timezone, include time, submitter and approver names; drop the multi-colour KPI icons; raise micro labels to 11-12px.
**Command:** `/impeccable typeset app/(app)/app/payroll/review`

## Persona red flags

**Owner approving a run (PRODUCT primary user).** Opens the page from the banner and has to scroll past titles to find Approve. Sees "Approved" in the demo and cannot tell whether $507.00 is the approved figure or today's. On a stale run, the diff omits tips, which are 59% of the total in the demo ($297 of $507), so a tip change is invisible except as a total delta. Cannot undo a mis-tap.

**Manager submitting it from a phone.** Submit/Resubmit is a small button in a short card, easily confused with the green Confirm Payroll below. Does not see the diff (hidden by design), so after "changes requested" cannot see what the owner is reacting to beyond a one-line note. Sticky bar wraps to two rows on mobile.

**Rubric persona, Jordan (first-timer, accountant-adjacent bookkeeper).** Does not know "snapshot" or what "ACH export is unlocked" refers to; sees NACHA File in the header available even for an unapproved run and may download it. "Wages $210" in the KPI strip versus "Total $253.50" per card versus "Wages $105" per card all mean different things without definitions.

## Minor observations

- Wages label in the KPI strip ($210) excludes tips, while Total Payroll ($507) includes them; the card's "Wages" cell and its "Regular" cell are identical ($105) when there is no overtime, so the four-cell row repeats a number.
- Initial avatar circles add no information.
- "Bartender · $15.00/Hr" capitalised "Hr" via `capitalize` (cosmetic).
- Both employees show identical figures, which makes the demo a poor test of the layout.
- Disclaimer paragraph is long and centred at text-xs; fine legally but low in hierarchy.
- Loading state exists (`loading.tsx`) but was not reviewed.
- Next.js dev badge overlaps the sidebar bottom in screenshots (dev only).

## What I could not verify

- Pending, stale-diff, changes-requested, override-reason and manager-role views: the demo run is approved and I may not click or write. Judged from source only.
- The NACHA gate when the run is not approved (server side); the button is always rendered.
- Dark theme, keyboard focus order and screen-reader output of the approval card; measured contrast was not run on this screen.
- How `getPayrollRunDiff` computes hours (rounding in `hoursBefore/After`) and whether it covers tip changes.
- OpenRunBanner rendering (not visible while no run is pending).
