# Payroll Review (/app/payroll/review) - design critique, run 2

Mode: Operate. Observed live state: demo org, run already **Approved** (submitted 11/25/2026), tax withholding off, 2 employees. Pending, stale-diff, changes-requested and error states were read from source only (read-only rule). Screenshots: scratchpad/pw/r2-review/{d,m}.png.

## Heuristics (0-4)

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 2 | Approved panel shows no approver, approval time or approved total; diff is computed only while pending, so after approval the live figures can drift under an "Approved" badge with no warning. |
| 2 | Match with real world | 3 | Pay run / snapshot language is plain; "Wages" vs "Total Payroll" vs "Regular" vs "Wages" per employee card is inconsistent. |
| 3 | User control and freedom | 2 | Approve has no confirm step and is effectively irreversible (unlocks ACH); Send back is reversible via Cancel, good. No undo/revoke of approval. |
| 4 | Consistency and standards | 2 | Two competing confirmation concepts (Approval panel vs local-only "Confirm Payroll"); hand-rolled buttons vs Button component; Send back appears twice with different styling. |
| 5 | Error prevention | 2 | One-click approve of a money run; the missing-rate warning is good but non-blocking; the stale case relabels the button ("Approve new figures") which is a good guard. |
| 6 | Recognition over recall | 3 | Diff lists before -> after per person with total delta; context repeated in headers. Tips figure has no KPI so the $210 -> $507 gap must be reasoned out. |
| 7 | Flexibility and efficiency | 2 | Week stepper and CSV/NACHA in header are fine; no jump to the next pending run, no keyboard shortcuts; approver must scroll past the whole breakdown to reach totals (low impact at 2 rows, high at 20). |
| 8 | Aesthetic and minimal design | 2 | Title stack repeated 4 times (page h1 "Payroll", tabs, sticky bar "Payroll Review", h2 "Pay Period Review") plus Back and breadcrumb; the decision panel is at the top but the numbers it governs are far below. |
| 9 | Error recovery | 2 | Errors render as plain red text with no role=alert, far from where focus is; server messages are specific ("Only the account owner can approve payroll"). |
| 10 | Help and documentation | 2 | Withholding and ACH notes are inline and honest; disclaimer present; no explanation of what "Approve" commits to or who is notified. |
| **Total** | | **22 / 40** | |

## Design specificity
Generic-leaning. The Fira Code headings, navy ink, tabular figures and hairline cards are on-brand and consistent with DESIGN.md, but the screen is a stock card-grid: icon-over-number KPI tiles (the exact "tinted icon chip" pattern), pastel status pills, green/emerald and amber used as decoration (emerald KPI, emerald button, emerald total, amber dollar icon) rather than as one amber signal. Nothing about the layout expresses the "frozen snapshot vs live" concept that is the product's core idea here.

## Cognitive load
Checklist failures: single focus (4 headings, 2 export button sets, 3 navigation devices), visual hierarchy (three emerald elements and a primary-blue button compete in one view), working memory (approver must compare the diff in the panel against employee cards 600px below), progressive disclosure (fine). 3 failures = moderate. Decision point on approved state has 5 visible actions (CSV, NACHA, Confirm Payroll, week back/forward, This week) plus header duplicates: 7-8 incl. header.

## Strengths
- The snapshot/diff model is exposed honestly: "The figures changed after this was submitted", per-employee before -> after, total delta with sign and colour plus +/- text, and the approve button changes label to "Approve new figures". This is the right idea for the primary task.
- Role gating shows state to non-approvers (manager sees status, no dead button).
- Honest empty/limit states: withholding off/unusable/uncollected amounts, "Needs W-2 / 1099", missing-rate warning at both summary and row level.
- Tabular numerals, right-aligned totals, per-person breakdown that sums visibly.
- Mobile layout reflows cleanly with no horizontal scroll; disclaimer is clear.

## Priority issues

### 1. P0 - A second, local-only "Confirm Payroll" button sits beside the real approval and can mislead
`payroll-review-client.tsx` sets `confirmed` in component state and toasts "Payroll confirmed for this period"; nothing is persisted and it is shown even when the run is Pending, Changes requested or never submitted. On a money screen two green "confirm/approve" affordances with different meanings, one of which writes nothing, will be read as an approval state by a manager. Fix: delete it, or replace with a read-only "Approved by X on date" fact when approved. Command: `/impeccable clarify` then `/impeccable distill`.

### 2. P1 - Approved state is thin and can go stale silently
The panel says "Approved" and "Submitted 11/25/2026", with no approver, approval date, or approved total, and the diff is only fetched for pending runs. The cards below are live computation, so after approval a late shift edit changes the figures under a green badge and the ACH export (which the panel says is unlocked) may no longer match what was approved. Fix: show "Approved by name, date, $507.00 (snapshot)" from `run.snapshot`, and compute the diff for approved runs too, flagging "Figures changed since approval" with the same diff list. Command: `/impeccable harden`.

### 3. P1 - Approve is one click with no confirmation of what is being committed
For the exact action the screen exists for, the button gives no summary of total, period or consequence (ACH unlock, owner notification), no disabled-while-pending label change, and no success announcement. Fix: put the total and period in the button area ("Approve $507.00 for Nov 23-29"), use a controlled dialog for the stale case listing net delta, announce result in an aria-live region. Command: `/impeccable clarify`.

### 4. P1 - Hierarchy: decision is detached from the evidence, and the title stack is redundant
Approval card is first; the figures it approves (KPIs, per-employee rows, period total) are 300-900px lower, and for approvers the diff sits above but the full breakdown below. Meanwhile "Payroll", "Payroll Review", "Pay Period Review", "Back", breadcrumb and the Review tab all say the same thing. Fix: remove the sticky bar title/breadcrumb duplicate, make one h2, lead with a period total + status line, and place the Approve/Send back controls adjacent to the Period Total (sticky bottom bar on mobile). Command: `/impeccable layout`.

### 5. P2 - Number labelling can mislead
KPI "Wages $210.00" and "Total Payroll $507.00" omit a Tips tile, so $297 is unexplained at the top; in the employee row "Wages" ($105) equals "Regular" ($105) and its sub-label "7.0 total hrs" duplicates, while the right-hand "total" includes tips. When tax withholding is on, the footer note "payouts still pay gross" is easy to miss next to a card total that looks like take-home. Fix: add Tips KPI (Wages + Tips = Total), drop the redundant Wages cell or rename to "Wages incl. OT", and label totals "Gross". Command: `/impeccable clarify`.

### 6. P2 - Accessibility and polish gaps
Emerald-600 / white button text is about 3.8:1 (fails AA 4.5); 10px labels (PayCell, "total", sub-lines) are below a comfortable floor; the send-back textarea has no label (placeholder only); error text lacks role=alert; the approval buttons are hand-rolled with no visible focus-visible style (Base UI Button elsewhere); week-nav hit targets are 32px on mobile; date "11/25/2026" is locale-formatted while the page uses "Nov 23". Fix with the Button component, emerald-700, 12px minimum, label and live region. Command: `/impeccable polish`.

## Persona red flags
- **Owner approving a run (primary):** cannot see who submitted or when against a clock time; sees only live figures, so "what changed since I last looked" is available only in the pending-stale path and then only as hours and pay (tips or rate changes are invisible unless they move pay). Approving gives no confirmation summary. After approval, no way to tell if figures later drifted.
- **Manager submitting a run (secondary):** gets "Submit for approval" with no preflight (missing-rate warning is present but not blocking, no checklist of what the owner will see); after submit, the manager does not see a diff, so cannot know if the owner will be shown changes. The local "Confirm Payroll" button invites them to think they are done.
- **First-time / low-vision user (rubric):** four heading levels and three nav elements say the same thing; 10px labels and a 3.8:1 button are hard to read in a dim bar; the screen does not teach what "snapshot" or "Approve new figures" means.

## Minor observations
- Mobile: floating "+" FAB and bottom nav overlay content near the week nav; the CSV/NACHA pair wraps to a second row in the header.
- Demo data shows two employees with identical figures; fine, but the per-employee avatar initial adds no information.
- "Hr" capitalised oddly via `capitalize` on role line ("$15.00/Hr").
- Period-total footer repeats KPI figures (Regular, Overtime, Tips, hours); consider merging.
- Dark mode not screenshotted; amber/emerald tints use dark variants in source.
- The disclaimer is long and centred, small; acceptable but low contrast hierarchy.

## What I could not verify
Pending, stale-diff, changes-requested, override and error states (rendered only from source; read-only rule forbids creating them). Behaviour of the NACHA/CSV downloads, toasts, focus order and screen-reader output. Dark mode, long employee lists, withholding-on rendering (tax is off in this demo). The OpenRunBanner (open-run-banner.tsx) was not rendered because the run is approved and no banner showed on this page.
