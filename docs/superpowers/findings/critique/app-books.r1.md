# Books (/app/books) - Assessment A, reviewer run 1

Mode: Operate. Seen at 1280x800 and 390x844 (full page, YTD and This Month), demo org, light theme. Read-only.

## Heuristics

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 2 | Active period preset is shown, but no "as of" date, no sign that COGS is missing/unrecorded, and the YTD chart sub-label prints raw ISO dates. |
| 2 | Match to real world | 3 | Pure Profit / Pour Cost / Losses speak bar language; "Pure Profit" is non-standard to an accountant (it is really net operating profit before tax). |
| 3 | User control and freedom | 2 | Only four presets; the page reads `start`/`end` params but offers no date picker, no month stepper (last month, a specific month). Expense delete is one tap with no confirm or undo. |
| 4 | Consistency and standards | 2 | Four figures repeat (revenue, COGS, labor, gross profit) across band chips, KPI cards and P&L; negatives are parenthesised in the P&L but red-only in the band. Money is whole dollars here, cents in the expenses list. Expense total says "as entered" while the P&L applies recurring monthly. |
| 5 | Error prevention | 2 | The headline profit is computed with a zero COGS and shown as a confident $37,048 / 87.4%. Tax unset is warned, cost price unset is not. Expense add has validation but no confirm on delete. |
| 6 | Recognition over recall | 3 | The derivation chips and a statement under it make the sum visible. The user must still hold the period in mind (chart label dates vs preset). |
| 7 | Flexibility and efficiency | 1 | No custom range UI, no export/print of the P&L, no drill-through from COGS/labor/losses to the source screens, no month comparison. |
| 8 | Aesthetic and minimalist design | 2 | Same facts shown three times (band chips, 6 KPI cards, P&L summary). Six KPI cards in a 4-col grid leave an orphan row of 2 on desktop. |
| 9 | Error recovery | 2 | Expense save errors are inline plus toast. No page-level error or "couldn't load" state seen in code (page awaits data with no try/catch or error.tsx checked); a zero-data month renders as healthy zeros. |
| 10 | Help and documentation | 2 | Tax-not-configured explained well, twice. No help on what Pure Profit includes/excludes, how COGS is valued (unit_cost vs cost_price), or labor allocation. A transitional "used to be higher" note is permanent clutter in the statement. |
| **Total** | | **21 / 40** | |

## Design specificity verdict

Semi-specific. The Pure Profit band with its left-to-right derivation chips and the explicit tax-state copy are specific to this product and its trust problem. The rest (six identical stat cards with icons top-right, two default Recharts, two plain rows cards) is a generic dashboard template. It uses the navy/Fira Code system correctly but does not add the "night manager's clipboard" ledger feel to the actual P&L: the statement is a plain label/value list with no column rule, no prior-period column and no totals hierarchy beyond a top border.

## Cognitive load

Failed checklist items: chunking (6 KPI cards + 5 chips + 8 statement rows + 4 loss rows + expenses, 20+ figures in view), visual hierarchy below the band (all six KPI cards equal weight, colour used as decoration: rose for labor, amber for COGS, sky for tax, green for pour cost), working memory (user must reconcile band, cards and P&L), progressive disclosure (losses, KPI grid and statement all open). Result: 4 failures = high. The band itself is a strong single focus; the load is everything under it.

## Strengths

- Answer-first: Pure Profit and margin sit at the top, large, with the sum shown as chips. Matches "see profit for a month".
- Honest about tax: explicit banner in the band and the P&L, and the Sales Tax Collected card says "—" with a fix link rather than $0.
- Null margin shows "—" and "no revenue in period", not 0%.
- Tabular numerals, parenthesised negatives in the P&L, hidden zero deductions in chips.
- Loading skeleton mirrors the final layout; expense form labelled, collapsed, role-gated; 44px targets and no horizontal scroll at 390px.

## Priority issues

1. **P0 - A month with no COGS reads as a spectacular profit.** In the demo (and any bar whose item audit/shipments have not landed), COGS $0, Pour Cost 0.0% (rendered green, "good", target under 20%), Gross Profit 100.0% margin and Pure Profit 87.4% are displayed with full confidence and no warning. This is the exact "silence shown as zero" the product principles forbid, and it is an owner-facing profit figure. Pour cost of 0.0% is judged "good" by `judgeAgainstBenchmark`. Fix: when revenue > 0 and COGS == 0 (or pour cost under a sane floor), render Pour Cost and COGS as "—" / "not recorded" in neutral colour, mark the band "Profit excludes cost of goods: no stock movements recorded" with a link to the inventory/POS feed, and never colour 0% green. Command: `/impeccable harden books` (states) then `/impeccable clarify`.
2. **P1 - Cost-dependent figures are invisible assumptions.** COGS is built from usage_logs with `unit_cost ?? cost_price`, labor is regular+overtime pay only (no payroll taxes/benefits, and tips are shown separately), and the monthly chart spreads total labor evenly across months, so the Margin Trend and Revenue-vs-Labor chart show a fabricated flat labor line. Nothing on screen says any of this. Fix: add a "How this is calculated" disclosure under the P&L (COGS valued at invoice cost where recorded, else current item cost; labor excludes employer taxes; labor allocated evenly across months in multi-month ranges) and either compute labor per month or label the chart "labor averaged". Command: `/impeccable clarify`.
3. **P1 - Tax-unset state gives a profit that is knowingly wrong, shown at full emphasis.** The warning is present but the headline remains the largest, bluest element and the same warning is repeated three times (band, KPI sub-line, P&L header). Fix: show one banner; visually demote the headline (muted ink, "before tax" suffix) until tax is configured, and drop the two duplicates. Command: `/impeccable distill`.
4. **P2 - Redundant, flat second tier.** Six KPI cards restate the band and statement (revenue, COGS, gross profit, labor all appear 3 times), all the same size, with decorative per-card colours that break the "one signal" rule and leave an orphan row of two on desktop. Fix: keep Pour Cost and Sales Tax (the ones not in the statement), fold the rest into the P&L, and add a "vs last period" column to the statement so the user can see "what moved it". Command: `/impeccable layout books`.
5. **P2 - "What moved it" is not answerable.** No prior-period comparison, no drill-through, no per-month breakdown beyond a one-bar chart; with one month of data the Margin Trend is two floating dots and the bar chart is one bar offset to the left of centre. Fix: delta vs previous equivalent period in the band and statement rows, and link COGS to inventory usage, labor to payroll, losses to the Z reports; hide the trend chart below 2 data points with a plain note. Command: `/impeccable shape books` then `/impeccable harden`.
6. **P3 - Period control and chart accessibility.** Only four presets, YTD default shows raw "2026-01-01 – 2026-11-25"; presets are links styled like buttons with no `aria-current`; charts have no text alternative or data table; series colours (amber/rose/blue) are close in luminance for colour-blind readers; legend order differs from bar order (COGS, Labor, Revenue vs Revenue, COGS, Labor). Fix: month picker with prev/next, `aria-current="page"`, a visually-hidden summary table, direct labels. Command: `/impeccable polish`.

## Persona red flags

- **Owner asking "did the bar make money this month?"** Gets a clear number fast, which is good, but $37,048 and 87.4% margin on a bar is not credible and nothing warns it; no "vs last month". Tax unset means they are told they might be overstating but not by how much. The Tax-held figure is a dash.
- **Accountant ("Alex"-like).** Wants gross takings to net revenue to COGS to labor, with period, basis and cost method. "Pure Profit" is nonstandard; no accrual/cash basis note, no payroll tax line, recurring expenses "counted once per month" with a total that is "as entered" differs from the statement; no export or print; cannot choose an arbitrary range in the UI.
- **Sam (screen reader / low vision).** Band uses a labelled section, which is good; KPI cards are unlabeled divs with the label visually separate from the value; charts expose no data; delete buttons are labelled; red-only negatives in the band (the P&L uses parentheses, which helps); pour cost judged by green/amber/red colour alone (no text status).
- **Casey (phone behind the bar).** Six stat cards stack to a very long single column (about 3,150px) before the P&L; the statement, which holds the answer to "why", is near the bottom. Presets wrap fine; targets look 44px.

## Minor observations

- Header has the icon plus "Financial Overview" eyebrow in sentence case, not the system's amber uppercase eyebrow; the expense panel title and description sit tight with no gap before the empty message.
- Band "Margin" block right-aligned text sits oddly on mobile (centred under title).
- Currency has no cents in the band and statement, so $5,352 rounding can make rows not sum visibly.
- "− Labor" row negative shows red text and parentheses, while "− Beverage cost" $0 shows as positive "$0" with a minus label: inconsistent sign treatment.
- `previouslyOmitted` note is a permanent explanation of a historical fix; time-box it.
- Tips (+$8,428) are mentioned in a sub-line but excluded from profit with no statement of whether labor pay includes tips.
- Loading skeleton heading sizes vs real page differ slightly (h-8 vs text-2xl).

## What I could not verify

- Dark theme, print output, keyboard tab order and focus rings (not exercised).
- Behaviour with real COGS data, a configured tax rate, a negative profit month, many-month ranges, and expenses present (demo showed none; I did not add any).
- Whether an error boundary exists for failed data loads; loading state seen only through code.
- The mobile screenshot is full-page stitched, so the fixed bottom nav and FAB appear mid-page; real placement was not tested by scrolling. Mobile chart bars appeared absent in that capture (probably animation timing), not confirmed as a bug.
- Contrast numerically measured: not run; token claims taken from DESIGN.md.
