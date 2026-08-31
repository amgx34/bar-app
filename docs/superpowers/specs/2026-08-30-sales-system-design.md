# Sales system — design

**Date:** 2026-08-30
**Status:** approved for planning

One Sales screen that answers a bar's questions at whatever time horizon it is
asking them on, backed by ticket-grain data the POS already holds and the
pipeline currently throws away.

---

## Why

Sales today has three screens — Overview, Categories, Margins — sitting on a
capable pure-analytics layer (`lib/pos/sales-analytics.ts`, 463 lines, 495 lines
of tests). What it cannot answer is anything about *time within a night* or
*who poured it*, because `pos_item_sales.sale_date` is a `DATE` and carries no
hour, no ticket and no server.

Those are the questions a busy bar runs on: when does the rush hit, is the bar
staffed for it, what is the average ticket, who is selling.

### What is already there

Three findings shaped this design, and each one makes the work smaller than it
looks:

1. **The POS has the grain.** `tblSalesHdrHist` carries `dtmTicketDate`
   (smalldatetime), `fkUserID`, `szTicketNo` and `fkTerminal`. The agent already
   reads this table. The time component is being *deliberately discarded* — the
   profile does `CAST(DATEADD(HOUR, -4, [dtmTicketDate]) AS DATE)` to derive a
   business date, and a test asserts it must not use a plain cast. Nothing new
   needs to be reached; a projection needs to stop collapsing.

2. **Five tables for exactly this already exist and are dead.**
   `z_report_hourly_sales`, `z_report_server_sales`, `z_report_register_sales`,
   `z_report_category_sales`, `z_report_department_sales` were created in
   `20260424000001_expand_z_reports_schema.sql`. Nothing writes them. Nothing
   reads them. They are not reused here — see *Storage* below.

3. **The business-day offset is already solved.** `lib/business-date.ts` has
   `DEFAULT_BUSINESS_DAY_CUTOFF_HOUR = 4` and `cutoffHourFromSettings()` reading
   `bar_settings.business_day_cutoff_hour`. Every part of this system reads that
   one function. This is the single highest-risk detail in the project and it
   already has an owner.

---

## Scope

Three stages, built in order. Each has its own implementation plan. Stage A is
useless alone and ships behind the fact that no bar has history until it runs —
which is the argument for building it first, not last.

| stage | delivers | depends on |
|---|---|---|
| A · Capture | ticket-grain hourly and per-server data flowing into Postgres | — |
| B · Analytics | pure functions answering the new questions | A for real data; testable without it |
| C · View | one period-driven Sales screen | B |

### Not in scope

- Per-item hourly breakdown. `pos_item_sales` stays daily-grain; the volume of
  item × hour rows is not justified by any question asked here.
- Clover parity. Clover bars get the degraded view (see *Degradation*).
- Backfill. Historical hours are not recoverable from data already aggregated
  away; the agent's 2-day re-send window will fill in the recent past and no
  further.

---

## Stage A — Capture

### Storage

Two new tables, keyed on natural keys and upserted:

```
pos_hourly_sales
  organization_id, business_date, hour (0-23)
  net_sales, ticket_count, tips
  UNIQUE (organization_id, business_date, hour)

pos_server_sales
  organization_id, business_date, server_name
  employee_id (nullable FK), net_sales, ticket_count, tips
  UNIQUE (organization_id, business_date, server_name)
```

`hour` is the real clock hour, 0–23, paired with the business date it belongs
to. A ticket at 01:30 on Sunday morning is `business_date = Saturday, hour = 1`.
Ordering for display is a presentation concern resolved by the cutoff hour, not
by storing a shifted hour — storing a shifted hour would make the column
meaningless to anyone reading the table directly.

**Why not the existing `z_report_*` tables.** They hang off a `z_report_id`
foreign key, so they require a settled Z report row to attach to. During service
there is no such row, and live intraday data is the point of this project.
Their shape also follows the emailed-Z format rather than the agent feed.
Making them work would mean dropping the FK, at which point they are these
tables with worse names.

**The five dead tables are dropped in the same migration.** They have never held
a row and nothing reads them. Two plausible homes for "hourly sales" is exactly
the condition that produced the `netOperating` bug in Books, where one name
meant two different numbers in two files.

### Idempotency, and the void problem

The agent re-sends a 2-day window every 5 minutes. Every write must be
idempotent against the natural key — the same contract `pos_item_sales` and
`pos_stock_applications` already follow.

Upsert alone is not sufficient. An hour can *lose* sales when a ticket is
voided after the fact, and a blind merge leaves the old row standing. The write
is therefore a **per-night replace**: for each business date in the payload,
delete the rows for that date and insert what was sent, in one transaction.
This is correct precisely because the agent always sends a whole night, never a
delta.

### Agent

Two profile queries added, both grouping on the same business-date expression
the Z query already uses:

- **Hourly** — `GROUP BY businessDate, DATEPART(HOUR, dtmTicketDate)`, selecting
  `SUM(fNetAmt)`, `COUNT(DISTINCT szTicketNo)`, `SUM(fTipAmt)`.
- **Server** — `GROUP BY businessDate, u.szName` via `fkUserID → tblUser`, same
  aggregates.

`COUNT(DISTINCT szTicketNo)` is where average ticket comes from, and it is the
metric a high-volume bar is actually managed by.

Both queries are added to the profile the same way the Z source is, so
`ProfileMigration` can recognise and upgrade older installs.

### Ingest

`POST /api/2touch/ingest` gains two **optional** payload sections. Optional is
load-bearing: bars on older agents send nothing, the request still succeeds, and
the degradation in *Degradation* below becomes a real state rather than a
theoretical one. Auth is unchanged — HMAC over the raw body, per-org token.

### Server → employee linking

`server_name` is stored as text and is the natural key. `employee_id` is a
nullable resolution against `employees.name`, done at read time rather than
write time so a later rename or a new hire fixes historical rows.

An unmatched server name is displayed as-is, never dropped. A bartender absent
from the payroll list still sold the drinks.

---

## Stage B — Analytics

All pure, all in `lib/pos/`, all unit-tested — the pattern
`sales-analytics.ts` and its 495 lines of tests already establish. This stage
carries the project's confidence; a bug here is a wrong number on a financial
screen, and it is the only stage that can be exhaustively tested cheaply.

| module | responsibility |
|---|---|
| `daypart.ts` | trade curve ordered on the bar's own clock, peak hour, share of night |
| `tickets.ts` | ticket count, average ticket, revenue per traded hour |
| `server-performance.ts` | sales and tickets per bartender; sales per hour worked |
| `baselines.ts` | comparison against the last N same-weekdays, whole-night or to-this-hour |
| `menu-engineering.ts` | classify `ItemMargin[]` into stars / plowhorses / puzzles / dogs |

### `baselines.ts` is not optional

"$3,240 tonight" is not information. "$3,240, up 18% on the last four Saturdays
at this hour" is a sentence someone can act on. A live number with no baseline
is a number nobody can do anything with, and the live view is the main
justification for Stage A.

Comparing *to this hour* rather than to the whole night is the load-bearing
detail: measuring a half-finished Saturday against four complete ones reports a
disaster every time.

### `server-performance.ts` crosses two domains

Sales per hour worked requires `pos_server_sales` joined to `employee_shifts`.
Both halves already exist. This is the metric that is genuinely hard to get
anywhere else, and it falls out of data Rail already holds for payroll.

It must not be presented as a ranking of people without context — a bartender on
the service well and one on the front bar are not comparable, and the design
shows the figure without a leaderboard framing.

---

## Stage C — View

`/app/sales?view=tonight|day|week|month`, extending the helpers added to
`lib/date-range.ts` for Payroll (`resolvePayrollView`, `monthRange`,
`shiftPeriod`, `defaultPeriod`) rather than duplicating them. Those become
generic over a view type that includes `tonight`.

The period is the organising idea: the same operator asks different questions at
different horizons, and a bar's size mostly determines *which horizon it lives
at*, not which screen it needs.

### Tonight / Day

- Live band: net, ticket count, average ticket — each against its baseline.
- Hourly curve. Hours not yet traded are **empty, not zero** — a zero reads as a
  dead hour rather than an hour that has not happened.
- Top movers tonight.
- By-server table.
- An "as of 23:47" line driven by the existing `lib/pos/sync-health.ts`, so a
  stale agent is visible rather than silently reporting an old night as current.

Never extrapolate a partial night to a projected total.

### Week / Month

Category mix, margin, the menu-engineering quadrant, slow movers, revenue trend.

### This absorbs the Categories and Margins tabs

Both fold into Week/Month. That is the point of one screen, but it is a real
change to screens that work today. `/app/sales/categories` and
`/app/sales/margins` redirect, the way `/app/payroll/split` now does, and the
tab strip in `nav-config.ts` loses those entries.

---

## Degradation

Not every bar has this data: bars on the email fallback, Clover bars, bars on
an older agent, and every bar's history before Stage A ships.

A `SalesCapabilities` value — `{ hasHourly, hasServer, hasTickets }` — is
computed server-side from whether any rows exist for the period, and decides
which panels render at all.

A panel with no data shows **one sentence** naming what is missing and how to
get it. Never an empty chart. Never a zero standing in for an unknown.

This follows the precedent set in `lib/books/sales-tax.ts`: reporting a figure
as unknown is better than assuming one, because a confident wrong number on a
financial screen is actively harmful. Every bar gets a working Sales screen on
day one; better-equipped bars get more panels.

---

## Error handling

| condition | behaviour |
|---|---|
| tax-inclusive POS prices | existing `TaxInclusiveNotice` carries through; margins flagged as overstated |
| agent stale / not reporting | "as of" line from `sync-health.ts`; Tonight does not claim to be live |
| partial night | shown as partial; never extrapolated |
| server name with no employee | displayed as sent, `employee_id` null |
| hour with no sales | rendered as untraded, distinct from zero |
| payload without the new sections | accepted; capabilities report false |

---

## Testing

Stage B is where the confidence lives. Load-bearing cases:

- **The 1am ticket.** Business date and hour both correct on either side of the
  cutoff, at cutoff values other than the default 4.
- **The voided hour.** A night re-sent with fewer sales in an hour leaves no
  stale row.
- **The half-finished Saturday.** A baseline compared to-this-hour, not to four
  complete nights.
- **The unmatched server.** Present in output with a null employee link.
- **The bar with nothing.** Capabilities all false, no panel renders a zero.
- **Idempotency.** The same payload applied twice produces identical rows.

Stage A adds ingest route tests and extends the agent's own suite. Stage C is
driven in a browser against the demo org.

---

## Risks

- **The cutoff hour must stay single-sourced.** Every consumer reads
  `cutoffHourFromSettings`. A second copy of `4` anywhere silently misfiles late
  trade in one place and not another, and the discrepancy is invisible from
  either screen — the exact failure mode of the Day Split / pay run divergence.
- **No history until Stage A ships.** For the first weeks Tonight is the only
  period with hourly data. Baselines need four same-weekdays to be meaningful,
  so the comparison line must handle "not enough history yet" as a first-class
  state rather than dividing by a thin sample.
- **POS server names are not employee names.** Expect a manual mapping need; the
  nullable link is the pressure valve, not a bug.
- **Scope of Stage C.** Folding four screens into one is where this project can
  overrun. The period control and capability gating are the deliverable; the
  menu-engineering quadrant is the first thing to cut if it does.
