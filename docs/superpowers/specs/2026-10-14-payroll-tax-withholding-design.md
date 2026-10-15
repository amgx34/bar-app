# Payroll tax withholding — design

**Date:** 2026-10-14
**Status:** approved in conversation, awaiting spec review

## What this is for

Payroll currently pays gross. Nothing is withheld from anyone, and nothing in
the schema records whether a person is a W-2 employee or a 1099 contractor.

This adds:

1. **Correct withholding** — federal income tax by the IRS Publication 15-T
   percentage method, Social Security and Medicare, and state as a configurable
   flat rate.
2. **Control over who is taxed** — a classification on each employee.
3. **W-2 people** — that same classification distinguishes them; W-2 employees
   carry W-4 data and are withheld, contractors are not.

Requirements 2 and 3 are one field, deliberately. A separate "tax this person"
toggle alongside a classification gives two sources of truth that can disagree.

### What already exists

- `app/(app)/app/tax/` reports employee SS/Medicare, employer FICA and a FUTA
  estimate. It is **report-only** — nothing is withheld — and it hardcodes
  `0.062`, `0.0145`, `0.006` and a wage base inline.
- `employees` has `name, role, hourly_rate, tip_mode`. No classification, no W-4.
- `computePayroll` produces `PayrollEntry.totalCompensation`, which flows into
  `payroll_runs.snapshot`, `run-diff`, `planBulkPayout`, the NACHA export,
  `/books` and the employee portal.

## Scope

**In:**

- Classification and W-4 fields on `employees`.
- Org-level tax config.
- A pure withholding engine: Pub 15-T federal, FICA, flat state.
- Withholding computed, stored on the run snapshot, and shown on review.
- Shortfall handling when withholding exceeds what can be withheld.

**Out, by explicit decision:**

- **Net pay.** Payouts, `planBulkPayout`, `remainingAdvanceCapacity` and the
  NACHA export keep paying what they pay today. The numbers get checked against
  a real pay period before a cent moves differently, and the NACHA file is the
  irreversible part.
- **W-2 form generation.** Needs a full year of reconciled withholding first.
- **A real state engine.** Flat rate only.
- **Pre-2020 W-4 support.** Pub 15-T carries a separate table set for those.
  Supporting both doubles the tables for a form six years obsolete; anyone still
  on one re-files.

## Decisions and why

### Tax tables are year-versioned code, not database rows

`lib/payroll/tax/tables/2026.ts`, selected by tax year. This matches the
codebase's established shape for consequential logic — `detect.ts`,
`payouts.ts`, `open-run.ts`, all pure and tested — and makes a tax table a
reviewable diff rather than mutable data that can differ per environment and is
awkward to test against.

### A missing tax year is a hard error

The named risk of the percentage-method approach is that a stale table silently
under-withholds for twelve months. So `tablesFor(year)` **throws** on a year it
does not have. It never falls back to the most recent table it happens to hold.

### The tax year is derived, never configured

From the pay period's end date. A stored year is a thing someone forgets to roll
over, and the failure is silent. Derived, January's first run asks for the 2027
tables and fails loudly before any money is wrong.

### Withholding is a layer, not part of `computePayroll`

`computeWithholding(...)` composes on top of an existing `PayrollEntry`.
`computePayroll` is already large and feeds `/books`, `/tax` and the employee
portal; threading tax through it would put tax math in the blast radius of all
of them. As a layer the engine is independently testable and `computePayroll` is
untouched.

### FICA gets one definition

The hardcoded rates in `app/(app)/app/tax/actions.ts` move to the shared tax
constants. Two implementations of FICA drifting apart is the failure this
codebase keeps writing down — `pos_config`'s two writers, `ServiceControl`
replacing `install-service.ps1`, `cash_tips_source`.

### The tax setup lives in the employee setup screen

Not a new Settings page. Per-employee classification and W-4 are edited in
`app/(app)/app/payroll/_components/employees-tab.tsx` (rendered by
Payroll → Employees, which absorbed the old top-level `/app/employees`), and
the org-level knobs render as a panel on that same screen so everything tax
sits in one place.

## Data model

### `employees` — new columns

All nullable, so every existing row stays valid.

```sql
tax_classification      TEXT     -- 'w2' | 'contractor_1099' | NULL
w4_filing_status        TEXT     -- 'single' | 'married_jointly' | 'head_of_household'
w4_multiple_jobs        BOOLEAN  -- Step 2(c) checkbox
w4_dependents_amount    NUMERIC  -- Step 3 total
w4_other_income         NUMERIC  -- Step 4(a)
w4_deductions           NUMERIC  -- Step 4(b)
w4_extra_withholding    NUMERIC  -- Step 4(c), per pay period
w4_exempt               BOOLEAN  -- claimed exempt from federal withholding
```

**`NULL` classification means unclassified, not "do not tax."** An employee
nobody has classified is a question, not an answer: the review screen names
them rather than silently treating them as a contractor. Same rule as an absent
`last_sync_summary` and a missing notification preference — absence means
"cannot say", never a convenient default.

### Org config — `organizations.bar_settings.tax`

Where `barbackFraction` and the cutoff hour already live.

```ts
tax: {
  enabled:      boolean,
  payFrequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly',
  stateEnabled: boolean,
  stateRate:    number,   // flat percentage
}
```

`payFrequency` is configured rather than derived because periods here are
arbitrary start/end dates and the percentage method must annualise. The engine
checks the period length roughly matches the stated frequency and returns a note
on a mismatch rather than silently annualising a 13-day period as biweekly.

**`bar_settings` is a JSONB blob with multiple writers — the `pos_config` bug
exactly.** Any writer must build from the latest read and return what it wrote.

### Withholding storage

Extends `payroll_runs.snapshot` (already JSONB). The snapshot exists to freeze
what an approver agreed to, which is exactly where a frozen tax figure belongs —
and it means changing a tax setting cannot restate an approved run, the same
protection `usage_logs.unit_cost` gives the books.

`run-diff.ts` compares withholding alongside the existing `PayBreakdown`, so a
changed W-4 between submit and approval is something the owner is shown rather
than something that moves underneath them.

The shortfall rides in the snapshot for this phase. A persistent shortfall
ledger belongs with the net-pay change, where it starts affecting what is paid.

## The engine

```
lib/payroll/tax/
  tables/2026.ts     percentage-method brackets + FICA constants for one year
  tables/index.ts    tablesFor(year) — throws on a year it does not have
  federal.ts         Pub 15-T Worksheet 1A
  fica.ts            Social Security + Medicare
  withholding.ts     computeWithholding(), composing the above
  types.ts
```

### Signature

```ts
computeWithholding(input: {
  grossForPeriod:      number,
  availableToWithhold: number,
  ytdWages:            number,
  profile:             EmployeeTaxProfile,
  config:              OrgTaxConfig,
  taxYear:             number,
}): Withholding

type Withholding = {
  status: 'withheld' | 'exempt' | 'not_taxed' | 'unclassified' | 'disabled',
  federalIncome:      number,
  socialSecurity:     number,
  medicare:           number,
  additionalMedicare: number,
  state:              number,
  total:              number,
  uncollected: {
    federalIncome: number, socialSecurity: number,
    medicare: number, state: number, total: number,
  },
  notes: string[],
}
```

Pure, no I/O.

### Federal — Pub 15-T Worksheet 1A

Annualise the period's wages; add Step 4(a); subtract Step 4(b) and the
standard-deduction adjustment; look up the bracket in the **Standard** or the
**Step 2 checkbox** table set according to `w4_multiple_jobs`; subtract the
Step 3 dependent amount, floored at zero; divide by periods per year; add
Step 4(c).

Each step is its own tested function rather than one expression. When a figure
disagrees with an accountant, the question is always *which step diverged*.

### FICA needs year-to-date wages

The Social Security wage base and the Additional Medicare threshold are both
annual, so the engine takes `ytdWages` and the caller supplies it. `/tax`
already computes a year with `computePayroll(\`${year}-01-01\`, …)`, so the
pattern exists; it costs an extra computation per run. Without it every high
earner is over-withheld all year and nobody finds out until a W-2.

Additional Medicare has no employer match and one threshold regardless of
filing status.

### Shortfall ordering is specified, not incidental

When `availableToWithhold` is below what is owed, taxes come out in a fixed
order — **FICA, then federal income, then state** — and whatever could not be
taken is recorded per tax rather than as one lump, because the W-2 boxes they
feed are different.

`availableToWithhold` is the employer-controlled portion, which in a bar is not
gross: cash tips an employee already walked out with cannot be withheld from.

### Statuses are explicit

`not_taxed` (a contractor), `unclassified` (nobody has said) and `disabled`
(the bar has not switched tax on; ruling R12) produce the same zero and mean
different things. `disabled` is not `not_taxed`: that would read as "everyone
here is a contractor". The review screen treats them differently: `not_taxed`
and `disabled` are decisions (about a person, and about the bar), while
`unclassified` is a question that should be answered before payroll is
approved.

## Transcribing the tables

**The bracket figures are not to be written from memory.** They decide what
comes out of a person's paycheck, and a plausible-looking wrong number is worse
than an absent one.

`tables/2026.ts` is a transcription task against the published IRS Publication
15-T: the structure, types and tests are written first, the figures entered from
the document, and the result checked against it.

Tests that actually prove a transcription:

- The worked examples printed in the publication reproduce exactly.
- Brackets are contiguous, non-overlapping and ascending in rate.
- Zero income withholds zero.
- The top bracket is open-ended.
- Both table sets (Standard, Step 2 checkbox) exist for all three filing
  statuses.

## Testing

Pure engine, so ordinary unit tests:

- Pub 15-T worked examples, per filing status and both table sets.
- Social Security stops at the wage base — below, crossing, above.
- Additional Medicare starts at its threshold.
- `w4_exempt` withholds no federal income but still withholds FICA.
- `contractor_1099` withholds nothing; `unclassified` withholds nothing and says
  so differently.
- Shortfall: ordering, per-tax `uncollected`, and never a negative net.
- Period length disagreeing with `payFrequency` produces a note.
- `tablesFor` throws on an unknown year rather than falling back.
- Snapshot round-trip: withholding frozen at submit survives a settings change.

## Risks

- **Transcription error in the tables.** Mitigated by the publication's own
  worked examples as tests, not by review alone.
- **Annual rollover.** Mitigated by deriving the year and throwing on a missing
  table — loud in January rather than silent until filing.
- **State flat rate is an approximation.** It is labelled as one in the UI. Real
  state withholding is a later project.
- **This is not filing-grade software.** It computes withholding; it does not
  file returns, remit deposits, or generate W-2s. The UI should not imply
  otherwise.
