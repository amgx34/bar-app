# Sales Stage A — Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture ticket-grain hourly and per-server sales from the 2Touch POS into Postgres, so the Sales views in later stages have something to read.

**Architecture:** The agent already reads `tblSalesHdrHist` and aggregates it in SQL via `SqlReader.ZReportSql`, grouping on `BusinessDate(col, cutoffHour)`. Two symmetric queries are added that group by the same business-date expression plus hour, and plus server. Both arrive as optional payload sections on the existing HMAC-authenticated ingest route and are written with a per-night replace into two new tables.

**Tech Stack:** Next.js 16 route handlers, Supabase (Postgres), TypeScript + vitest for the server side; .NET 9 + xunit for the agent.

**Spec:** `docs/superpowers/specs/2026-08-30-sales-system-design.md`

## Global Constraints

- **The business-day cutoff has exactly one owner per side.** Server: `cutoffHourFromSettings()` in `lib/business-date.ts` reading `bar_settings.business_day_cutoff_hour`, default `4`, valid range 0–12. Agent: `SqlReader.BusinessDate(column, cutoffHour)`. Never write a literal `4` anywhere else.
- **A POS date column without a time component yields no hour.** `SqlReader.FeedCutoff(dateHasTime, configured)` already encodes this. When `DateHasTime` is false the hourly feed must be **skipped entirely**, not emitted with hour 0.
- **Every ingest write must be idempotent.** The agent re-sends a 2-day window every 5 minutes.
- **New payload sections are optional.** An older agent omitting them must still get a `200`.
- **Service-role queries must filter `organization_id` by hand** (`npm run audit:scope` enforces this), or carry an `// admin-scope-ok:` justification.
- **Money is rounded to 2 decimal places on write** (`Math.round(n * 100) / 100`), matching the existing `pos_item_sales` write.
- **`hour` is the real clock hour 0–23**, paired with the business date it belongs to. A 01:30 ticket on Sunday is `business_date = Saturday, hour = 1`.

---

## File Structure

| file | responsibility |
|---|---|
| `supabase/migrations/20260830000000_add_pos_hourly_and_server_sales.sql` | create the two tables; drop the five dead `z_report_*` tables |
| `lib/pos/hourly-sales.ts` | **pure** — validate/normalise hourly payload rows into DB rows, group by night |
| `lib/pos/hourly-sales.test.ts` | its tests |
| `lib/pos/server-sales.ts` | **pure** — same for per-server rows |
| `lib/pos/server-sales.test.ts` | its tests |
| `app/api/2touch/ingest/route.ts` | thin — accept the sections, call the pure modules, replace-write |
| `2touch-agent-dotnet/Services/SqlReader.cs` | `HourlySalesSql`, `ServerSalesSql` |
| `2touch-agent-dotnet/Setup/FeedSpecs.cs` | two new feed keys |
| `2touch-agent-dotnet/Setup/TwoTouchProfile.cs` | two new `ProfileFeed`s |
| `2touch-agent-dotnet/tests/RailAgent.Tests/SqlReaderTests.cs` | agent SQL tests |

The transformation logic lives in `lib/pos/*.ts` as pure functions rather than inside the route, following `lib/pos/bundles.ts` (`resolveSales`) and `lib/payroll/manual-hours.ts` (`partitionShifts`). The route stays a thin caller. This is what makes the logic testable with vitest, since there is no HTTP-level test harness in this repo.

---

## Task 1: Migration

**Files:**
- Create: `supabase/migrations/20260830000000_add_pos_hourly_and_server_sales.sql`

**Interfaces:**
- Consumes: nothing
- Produces: tables `pos_hourly_sales` and `pos_server_sales` with the unique constraints later tasks upsert against:
  - `pos_hourly_sales (organization_id, business_date, hour)`
  - `pos_server_sales (organization_id, business_date, server_name)`

- [ ] **Step 1: Write the migration**

```sql
-- Ticket-grain sales capture.
--
-- pos_item_sales answers WHAT sold. These answer WHEN and WHO, which is what a
-- busy bar is actually managed by: when the rush lands, whether the bar is
-- staffed for it, what the average ticket is.
--
-- The source has always had this. tblSalesHdrHist carries dtmTicketDate
-- (a datetime), fkUserID and szTicketNo; the agent reads that table already and
-- collapses the time away to derive a business date.

CREATE TABLE IF NOT EXISTS pos_hourly_sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  -- The night the trade belongs to, already offset by the bar's cutoff hour.
  business_date   DATE NOT NULL,
  -- The real clock hour, 0-23. A 01:30 ticket on Sunday morning is
  -- (business_date = Saturday, hour = 1). Storing a shifted hour instead would
  -- make this column meaningless to anyone reading the table directly; display
  -- ordering is resolved from the cutoff hour at read time.
  hour            SMALLINT NOT NULL CHECK (hour BETWEEN 0 AND 23),
  net_sales       NUMERIC(14,2) NOT NULL DEFAULT 0,
  ticket_count    INTEGER       NOT NULL DEFAULT 0,
  tips            NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, business_date, hour)
);

CREATE INDEX IF NOT EXISTS idx_pos_hourly_org_date
  ON pos_hourly_sales(organization_id, business_date);

CREATE TABLE IF NOT EXISTS pos_server_sales (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  business_date   DATE NOT NULL,
  -- As the POS reports it, and the natural key. Resolution to an employee is
  -- done at READ time and left nullable here: a bartender who is not on the
  -- payroll list still sold the drinks, and a later rename must be able to fix
  -- historical rows without a backfill.
  server_name     TEXT NOT NULL,
  employee_id     UUID REFERENCES employees(id) ON DELETE SET NULL,
  net_sales       NUMERIC(14,2) NOT NULL DEFAULT 0,
  ticket_count    INTEGER       NOT NULL DEFAULT 0,
  tips            NUMERIC(14,2) NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, business_date, server_name)
);

CREATE INDEX IF NOT EXISTS idx_pos_server_org_date
  ON pos_server_sales(organization_id, business_date);

-- The five tables below were created in 20260424000001_expand_z_reports_schema
-- for exactly this data and have never held a row: nothing writes them and
-- nothing reads them. They hang off a z_report_id FK, so they need a settled Z
-- report to attach to and cannot hold live intraday trade, which is the point
-- of the tables above.
--
-- Dropped rather than left in place because two plausible homes for "hourly
-- sales" is the condition that produced the netOperating bug in Books, where
-- one name meant two different numbers in two files.
DROP TABLE IF EXISTS z_report_hourly_sales;
DROP TABLE IF EXISTS z_report_server_sales;
DROP TABLE IF EXISTS z_report_register_sales;
DROP TABLE IF EXISTS z_report_category_sales;
DROP TABLE IF EXISTS z_report_department_sales;
```

- [ ] **Step 2: Verify the dropped tables are genuinely unreferenced**

Run:
```bash
grep -rn "z_report_hourly_sales\|z_report_server_sales\|z_report_register_sales\|z_report_category_sales\|z_report_department_sales" --include=*.ts --include=*.tsx --include=*.cs --include=*.sql . | grep -v node_modules | grep -v 20260424000001 | grep -v 20260830000000
```
Expected: no output. If any line appears, **stop** — a reader exists and the drop must be reconsidered.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/20260830000000_add_pos_hourly_and_server_sales.sql
git commit -m "feat(sales): tables for hourly and per-server capture

Drops five z_report_* tables built for this data in April that have never
held a row. They hang off a z_report_id FK and so cannot hold live intraday
trade, which is what these are for."
```

---

## Task 2: Pure hourly transformation

**Files:**
- Create: `lib/pos/hourly-sales.ts`
- Test: `lib/pos/hourly-sales.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  ```ts
  export type HourlySalesRow = {
    business_date: string; hour: number;
    net_sales: number; ticket_count: number; tips: number;
  };
  export type RawHourlyRow = {
    business_date?: unknown; hour?: unknown;
    net_sales?: unknown; ticket_count?: unknown; tips?: unknown;
  };
  export function normaliseHourlyRows(raw: RawHourlyRow[]): HourlySalesRow[];
  export function groupByNight(rows: HourlySalesRow[]): Map<string, HourlySalesRow[]>;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/pos/hourly-sales.test.ts
import { describe, it, expect } from 'vitest';
import { normaliseHourlyRows, groupByNight } from './hourly-sales';

describe('normaliseHourlyRows', () => {
  it('keeps a well-formed row and rounds money to cents', () => {
    expect(normaliseHourlyRows([
      { business_date: '2026-08-29', hour: 23, net_sales: 890.005, ticket_count: 41, tips: 120.126 },
    ])).toEqual([
      { business_date: '2026-08-29', hour: 23, net_sales: 890.01, ticket_count: 41, tips: 120.13 },
    ]);
  });

  it('keeps hour 0 and hour 23, which bracket the night', () => {
    const out = normaliseHourlyRows([
      { business_date: '2026-08-29', hour: 0, net_sales: 10, ticket_count: 1, tips: 0 },
      { business_date: '2026-08-29', hour: 23, net_sales: 20, ticket_count: 2, tips: 0 },
    ]);
    expect(out.map((r) => r.hour)).toEqual([0, 23]);
  });

  it('drops rows the POS could not date or hour', () => {
    // These arrive over HTTP from an agent on someone else's hardware. A bad
    // row must not become an hour of trade attributed to the wrong night.
    expect(normaliseHourlyRows([
      { business_date: 'banana', hour: 3, net_sales: 10, ticket_count: 1, tips: 0 },
      { business_date: '2026-08-29', hour: 24, net_sales: 10, ticket_count: 1, tips: 0 },
      { business_date: '2026-08-29', hour: -1, net_sales: 10, ticket_count: 1, tips: 0 },
      { business_date: '2026-08-29', hour: 1.5, net_sales: 10, ticket_count: 1, tips: 0 },
      { business_date: '2026-08-29', net_sales: 10, ticket_count: 1, tips: 0 },
    ])).toEqual([]);
  });

  it('treats missing money as zero but never as a dropped row', () => {
    // An hour that traded no money still traded: it is a real, quiet hour, and
    // dropping it would make the curve claim the bar was shut.
    expect(normaliseHourlyRows([
      { business_date: '2026-08-29', hour: 15 },
    ])).toEqual([
      { business_date: '2026-08-29', hour: 15, net_sales: 0, ticket_count: 0, tips: 0 },
    ]);
  });

  it('sums duplicate hours rather than letting one win', () => {
    // The Hist and Daily tables are UNIONed at source, so the same hour can
    // arrive twice. An upsert would keep whichever landed last and silently
    // halve the night.
    expect(normaliseHourlyRows([
      { business_date: '2026-08-29', hour: 22, net_sales: 100, ticket_count: 5, tips: 10 },
      { business_date: '2026-08-29', hour: 22, net_sales: 50,  ticket_count: 3, tips: 5 },
    ])).toEqual([
      { business_date: '2026-08-29', hour: 22, net_sales: 150, ticket_count: 8, tips: 15 },
    ]);
  });

  it('coerces numeric strings, which JSON round-trips produce', () => {
    expect(normaliseHourlyRows([
      { business_date: '2026-08-29', hour: '22', net_sales: '100.50', ticket_count: '5', tips: '0' },
    ])).toEqual([
      { business_date: '2026-08-29', hour: 22, net_sales: 100.5, ticket_count: 5, tips: 0 },
    ]);
  });

  it('rejects a negative ticket count but keeps negative money', () => {
    // Net sales can legitimately go negative on a refund hour. A negative
    // ticket count cannot happen and signals a broken feed.
    expect(normaliseHourlyRows([
      { business_date: '2026-08-29', hour: 2, net_sales: -40, ticket_count: 1, tips: 0 },
    ])).toEqual([
      { business_date: '2026-08-29', hour: 2, net_sales: -40, ticket_count: 1, tips: 0 },
    ]);
    expect(normaliseHourlyRows([
      { business_date: '2026-08-29', hour: 2, net_sales: 40, ticket_count: -1, tips: 0 },
    ])).toEqual([]);
  });
});

describe('groupByNight', () => {
  it('groups rows by their business date', () => {
    const grouped = groupByNight([
      { business_date: '2026-08-29', hour: 22, net_sales: 1, ticket_count: 1, tips: 0 },
      { business_date: '2026-08-29', hour: 23, net_sales: 1, ticket_count: 1, tips: 0 },
      { business_date: '2026-08-30', hour: 22, net_sales: 1, ticket_count: 1, tips: 0 },
    ]);
    expect([...grouped.keys()].sort()).toEqual(['2026-08-29', '2026-08-30']);
    expect(grouped.get('2026-08-29')).toHaveLength(2);
  });

  it('returns an empty map for no rows', () => {
    expect(groupByNight([]).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/pos/hourly-sales.test.ts`
Expected: FAIL — "Failed to resolve import ./hourly-sales".

- [ ] **Step 3: Write the implementation**

```ts
// lib/pos/hourly-sales.ts
/**
 * Hourly trade, as sent by the POS agent.
 *
 * Pure — no database, no clock.
 *
 * These rows arrive over HTTP from an agent running on a bar's own POS box, so
 * nothing here trusts its input. A row that cannot be placed on a night and an
 * hour is dropped rather than defaulted: an hour of trade filed against the
 * wrong night is worse than an hour missing, because the missing one is visible
 * and the misfiled one is not.
 */

import { isIsoDate } from '@/lib/date-range';

export type HourlySalesRow = {
  /** The night the trade belongs to, already offset by the bar's cutoff. */
  business_date: string;
  /** Real clock hour, 0-23. */
  hour: number;
  net_sales: number;
  ticket_count: number;
  tips: number;
};

export type RawHourlyRow = {
  business_date?: unknown;
  hour?: unknown;
  net_sales?: unknown;
  ticket_count?: unknown;
  tips?: unknown;
};

function money(value: unknown): number {
  const n = Number(value ?? 0);
  // Absent is zero; unparseable is also zero rather than NaN, which would
  // spread through every sum downstream.
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function count(value: unknown): number | null {
  const n = Number(value ?? 0);
  // Negative tickets cannot happen and mean a broken feed. Net sales may go
  // negative on a refund hour, which is why only this one is guarded.
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/**
 * Validates and merges raw rows.
 *
 * Duplicate hours are SUMMED, not overwritten. The agent's source UNIONs the
 * history and daily tables, so one hour can legitimately arrive twice; letting
 * the last one win would silently halve that hour.
 */
export function normaliseHourlyRows(raw: RawHourlyRow[]): HourlySalesRow[] {
  const merged = new Map<string, HourlySalesRow>();

  for (const row of raw ?? []) {
    const date = row?.business_date;
    if (!isIsoDate(date)) continue;

    const hour = Number(row?.hour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;

    const tickets = count(row?.ticket_count);
    if (tickets === null) continue;

    const key = `${date}:${hour}`;
    const existing = merged.get(key);

    if (existing) {
      existing.net_sales    = money(existing.net_sales + money(row?.net_sales));
      existing.ticket_count = existing.ticket_count + tickets;
      existing.tips         = money(existing.tips + money(row?.tips));
      continue;
    }

    merged.set(key, {
      business_date: date,
      hour,
      net_sales: money(row?.net_sales),
      ticket_count: tickets,
      tips: money(row?.tips),
    });
  }

  return [...merged.values()];
}

/**
 * Rows bucketed by night.
 *
 * The write is a per-night REPLACE rather than an upsert, because an hour can
 * lose sales when a ticket is voided after the fact and a blind merge would
 * leave the old figure standing. That is only safe because the agent always
 * sends a whole night, never a delta — so the caller needs the nights.
 */
export function groupByNight(rows: HourlySalesRow[]): Map<string, HourlySalesRow[]> {
  const byNight = new Map<string, HourlySalesRow[]>();
  for (const row of rows) {
    const list = byNight.get(row.business_date);
    if (list) list.push(row);
    else byNight.set(row.business_date, [row]);
  }
  return byNight;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/pos/hourly-sales.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add lib/pos/hourly-sales.ts lib/pos/hourly-sales.test.ts
git commit -m "feat(sales): pure hourly payload normalisation

Duplicate hours are summed, not overwritten: the agent's source UNIONs the
history and daily tables, so one hour can arrive twice and last-write-wins
would halve it."
```

---

## Task 3: Pure per-server transformation

**Files:**
- Create: `lib/pos/server-sales.ts`
- Test: `lib/pos/server-sales.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  ```ts
  export type ServerSalesRow = {
    business_date: string; server_name: string;
    net_sales: number; ticket_count: number; tips: number;
  };
  export type RawServerRow = {
    business_date?: unknown; server_name?: unknown;
    net_sales?: unknown; ticket_count?: unknown; tips?: unknown;
  };
  export function normaliseServerRows(raw: RawServerRow[]): ServerSalesRow[];
  export function groupServerRowsByNight(rows: ServerSalesRow[]): Map<string, ServerSalesRow[]>;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/pos/server-sales.test.ts
import { describe, it, expect } from 'vitest';
import { normaliseServerRows, groupServerRowsByNight } from './server-sales';

describe('normaliseServerRows', () => {
  it('keeps a well-formed row and rounds money to cents', () => {
    expect(normaliseServerRows([
      { business_date: '2026-08-29', server_name: 'Kayla Chen', net_sales: 1840.005, ticket_count: 94, tips: 300.124 },
    ])).toEqual([
      { business_date: '2026-08-29', server_name: 'Kayla Chen', net_sales: 1840.01, ticket_count: 94, tips: 300.12 },
    ]);
  });

  it('trims and collapses whitespace in the name', () => {
    // The name is the natural key. '  Kayla  Chen ' and 'Kayla Chen' must not
    // become two bartenders who each sold half the night.
    expect(normaliseServerRows([
      { business_date: '2026-08-29', server_name: '  Kayla   Chen ', net_sales: 10, ticket_count: 1, tips: 0 },
      { business_date: '2026-08-29', server_name: 'Kayla Chen',      net_sales: 20, ticket_count: 2, tips: 0 },
    ])).toEqual([
      { business_date: '2026-08-29', server_name: 'Kayla Chen', net_sales: 30, ticket_count: 3, tips: 0 },
    ]);
  });

  it('merges names differing only by case', () => {
    expect(normaliseServerRows([
      { business_date: '2026-08-29', server_name: 'KAYLA CHEN', net_sales: 10, ticket_count: 1, tips: 0 },
      { business_date: '2026-08-29', server_name: 'Kayla Chen', net_sales: 20, ticket_count: 2, tips: 0 },
    ])).toHaveLength(1);
  });

  it('keeps the first spelling seen rather than upper-casing the display name', () => {
    const out = normaliseServerRows([
      { business_date: '2026-08-29', server_name: 'Kayla Chen', net_sales: 20, ticket_count: 2, tips: 0 },
      { business_date: '2026-08-29', server_name: 'KAYLA CHEN', net_sales: 10, ticket_count: 1, tips: 0 },
    ]);
    expect(out[0].server_name).toBe('Kayla Chen');
  });

  it('drops rows with no usable name or date', () => {
    expect(normaliseServerRows([
      { business_date: '2026-08-29', server_name: '   ', net_sales: 10, ticket_count: 1, tips: 0 },
      { business_date: '2026-08-29', net_sales: 10, ticket_count: 1, tips: 0 },
      { business_date: 'banana', server_name: 'Kayla Chen', net_sales: 10, ticket_count: 1, tips: 0 },
    ])).toEqual([]);
  });

  it('keeps a server who rang up nothing', () => {
    // Somebody clocked onto a till and sold nothing is a real, reportable fact.
    expect(normaliseServerRows([
      { business_date: '2026-08-29', server_name: 'Wes Berns' },
    ])).toEqual([
      { business_date: '2026-08-29', server_name: 'Wes Berns', net_sales: 0, ticket_count: 0, tips: 0 },
    ]);
  });

  it('rejects a negative ticket count but keeps negative money', () => {
    expect(normaliseServerRows([
      { business_date: '2026-08-29', server_name: 'Wes Berns', net_sales: -40, ticket_count: 1, tips: 0 },
    ])).toHaveLength(1);
    expect(normaliseServerRows([
      { business_date: '2026-08-29', server_name: 'Wes Berns', net_sales: 40, ticket_count: -1, tips: 0 },
    ])).toEqual([]);
  });
});

describe('groupServerRowsByNight', () => {
  it('groups rows by their business date', () => {
    const grouped = groupServerRowsByNight([
      { business_date: '2026-08-29', server_name: 'A', net_sales: 1, ticket_count: 1, tips: 0 },
      { business_date: '2026-08-30', server_name: 'A', net_sales: 1, ticket_count: 1, tips: 0 },
    ]);
    expect([...grouped.keys()].sort()).toEqual(['2026-08-29', '2026-08-30']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/pos/server-sales.test.ts`
Expected: FAIL — "Failed to resolve import ./server-sales".

- [ ] **Step 3: Write the implementation**

```ts
// lib/pos/server-sales.ts
/**
 * Per-bartender trade, as sent by the POS agent.
 *
 * Pure — no database, no clock.
 *
 * The server name is the natural key, and it is typed by whoever set the POS up.
 * Merging on a normalised form is therefore load-bearing: '  Kayla  Chen ' and
 * 'Kayla Chen' are one person, and treating them as two would show a bartender
 * selling half of what they sold.
 *
 * No attempt is made here to match the name to an employee. That is done at
 * read time and left nullable, so a bartender absent from the payroll list
 * still appears — they sold the drinks either way.
 */

import { isIsoDate } from '@/lib/date-range';

export type ServerSalesRow = {
  business_date: string;
  server_name: string;
  net_sales: number;
  ticket_count: number;
  tips: number;
};

export type RawServerRow = {
  business_date?: unknown;
  server_name?: unknown;
  net_sales?: unknown;
  ticket_count?: unknown;
  tips?: unknown;
};

function money(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function count(value: unknown): number | null {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

/** Collapses runs of whitespace so one person cannot become two rows. */
function cleanName(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

export function normaliseServerRows(raw: RawServerRow[]): ServerSalesRow[] {
  const merged = new Map<string, ServerSalesRow>();

  for (const row of raw ?? []) {
    const date = row?.business_date;
    if (!isIsoDate(date)) continue;

    const name = cleanName(row?.server_name);
    if (!name) continue;

    const tickets = count(row?.ticket_count);
    if (tickets === null) continue;

    // Case-insensitive so 'KAYLA CHEN' and 'Kayla Chen' merge, but the FIRST
    // spelling is kept for display — upper-casing every name because one till
    // shouts would be a worse report than the inconsistency it fixes.
    const key = `${date}:${name.toLowerCase()}`;
    const existing = merged.get(key);

    if (existing) {
      existing.net_sales    = money(existing.net_sales + money(row?.net_sales));
      existing.ticket_count = existing.ticket_count + tickets;
      existing.tips         = money(existing.tips + money(row?.tips));
      continue;
    }

    merged.set(key, {
      business_date: date,
      server_name: name,
      net_sales: money(row?.net_sales),
      ticket_count: tickets,
      tips: money(row?.tips),
    });
  }

  return [...merged.values()];
}

/** Rows bucketed by night, for the same per-night replace as the hourly write. */
export function groupServerRowsByNight(
  rows: ServerSalesRow[],
): Map<string, ServerSalesRow[]> {
  const byNight = new Map<string, ServerSalesRow[]>();
  for (const row of rows) {
    const list = byNight.get(row.business_date);
    if (list) list.push(row);
    else byNight.set(row.business_date, [row]);
  }
  return byNight;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/pos/server-sales.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add lib/pos/server-sales.ts lib/pos/server-sales.test.ts
git commit -m "feat(sales): pure per-server payload normalisation

Names are merged case- and whitespace-insensitively because the POS name is
the natural key and is typed by whoever set the till up."
```

---

## Task 4: Ingest the two sections

**Files:**
- Modify: `app/api/2touch/ingest/route.ts`

**Interfaces:**
- Consumes: `normaliseHourlyRows`, `groupByNight` from Task 2; `normaliseServerRows`, `groupServerRowsByNight` from Task 3; the tables from Task 1.
- Produces: payload accepts optional `hourlySales: RawHourlyRow[]` and `serverSales: RawServerRow[]`; `SyncSummary` gains `hoursRecorded: number` and `serversRecorded: number`.

- [ ] **Step 1: Add the payload types**

In the types block near `type ItemAuditRow`, add:

```ts
/**
 * Hourly and per-server trade. Both OPTIONAL: an agent older than the release
 * that added these sections sends neither, and its request must still succeed.
 * That is also what makes "this bar has no hourly data" a real state the Sales
 * screens can report rather than a theoretical one.
 */
type HourlySalesPayloadRow = {
  business_date: string;
  hour:          number;
  net_sales:     number;
  ticket_count:  number;
  tips:          number;
};

type ServerSalesPayloadRow = {
  business_date: string;
  server_name:   string;
  net_sales:     number;
  ticket_count:  number;
  tips:          number;
};
```

Extend `type Payload` with:

```ts
  hourlySales?: HourlySalesPayloadRow[];
  serverSales?: ServerSalesPayloadRow[];
```

- [ ] **Step 2: Add the imports**

```ts
import { normaliseHourlyRows, groupByNight } from '@/lib/pos/hourly-sales';
import { normaliseServerRows, groupServerRowsByNight } from '@/lib/pos/server-sales';
```

- [ ] **Step 3: Write the hourly section**

Add after the `pos_item_sales` block (around line 593), before the `pos_apply_item_sales` loop:

```ts
    // ── Hourly trade ────────────────────────────────────────────────────────
    //
    // A per-night REPLACE, not an upsert. An hour can LOSE sales when a ticket
    // is voided after the fact, and a blind merge leaves the old figure
    // standing — the night would only ever grow. This is safe precisely because
    // the agent always sends a whole night rather than a delta.
    const hourlyRows = normaliseHourlyRows(payload.hourlySales ?? []);
    for (const [night, rows] of groupByNight(hourlyRows)) {
      // admin-scope-ok: resolvedOrgId came from resolveOrgAndVerify above, which
      // matched the payload's org_id against that org's own agent_token. A
      // request cannot reach here for an org it cannot sign for.
      const { error: delErr } = await supabase
        .from('pos_hourly_sales')
        .delete()
        .eq('organization_id', resolvedOrgId)
        .eq('business_date', night);

      if (delErr) {
        result.errors.push(`pos_hourly_sales delete(${night}): ${delErr.message}`);
        // Skip the insert for THIS night only: inserting on top of rows that
        // were not cleared would double the night's takings.
        continue;
      }

      const { error: insErr } = await supabase
        .from('pos_hourly_sales')
        .insert(
          rows.map((r) => ({
            organization_id: resolvedOrgId,
            business_date:   r.business_date,
            hour:            r.hour,
            net_sales:       r.net_sales,
            ticket_count:    r.ticket_count,
            tips:            r.tips,
            updated_at:      new Date().toISOString(),
          })),
        );

      if (insErr) result.errors.push(`pos_hourly_sales(${night}): ${insErr.message}`);
      else result.hoursRecorded += rows.length;
    }
```

- [ ] **Step 4: Write the per-server section**

Immediately after the hourly block:

```ts
    // ── Per-server trade ────────────────────────────────────────────────────
    //
    // Same per-night replace, same reason: a server's night can shrink.
    // employee_id is deliberately NOT resolved here — see lib/pos/server-sales.ts.
    const serverRows = normaliseServerRows(payload.serverSales ?? []);
    for (const [night, rows] of groupServerRowsByNight(serverRows)) {
      // admin-scope-ok: as above, resolvedOrgId is the signing org.
      const { error: delErr } = await supabase
        .from('pos_server_sales')
        .delete()
        .eq('organization_id', resolvedOrgId)
        .eq('business_date', night);

      if (delErr) {
        result.errors.push(`pos_server_sales delete(${night}): ${delErr.message}`);
        continue;
      }

      const { error: insErr } = await supabase
        .from('pos_server_sales')
        .insert(
          rows.map((r) => ({
            organization_id: resolvedOrgId,
            business_date:   r.business_date,
            server_name:     r.server_name,
            net_sales:       r.net_sales,
            ticket_count:    r.ticket_count,
            tips:            r.tips,
            updated_at:      new Date().toISOString(),
          })),
        );

      if (insErr) result.errors.push(`pos_server_sales(${night}): ${insErr.message}`);
      else result.serversRecorded += rows.length;
    }
```

- [ ] **Step 5: Extend the summary counters**

In `lib/pos/sync-health.ts`, add to the `SyncSummary` type:

```ts
  /** Hourly rows written this sync. Zero for agents that do not send them. */
  hoursRecorded: number;
  /** Per-server rows written this sync. Zero for agents that do not send them. */
  serversRecorded: number;
```

Then initialise both to `0` wherever `result` is constructed in `route.ts` (search for the other `Recorded: 0` fields and follow the same shape).

- [ ] **Step 6: Typecheck, lint, and check tenancy**

```bash
npx tsc --noEmit
npx eslint "app/api/2touch/ingest/route.ts" lib/pos/hourly-sales.ts lib/pos/server-sales.ts
npm run audit:scope
```
Expected: tsc silent; eslint silent; audit reports **0 unscoped and unjustified**.

- [ ] **Step 7: Verify an old agent's payload still succeeds**

Run the repo's mock agent against a local dev server:
```bash
node 2touch-agent-dotnet/testdata/mock-ingest-server.js --help
```
Send one payload with **no** `hourlySales` and **no** `serverSales` key. Expected: `200`, and `hoursRecorded: 0`, `serversRecorded: 0` in the response. This is the backwards-compatibility guarantee — if it fails, every bar on the current agent breaks.

- [ ] **Step 8: Commit**

```bash
git add app/api/2touch/ingest/route.ts lib/pos/sync-health.ts
git commit -m "feat(sales): ingest hourly and per-server sections

Both optional, so agents predating this release keep working. Written as a
per-night replace rather than an upsert: an hour can lose sales to a void,
and a merge would let a night only ever grow."
```

---

## Task 5: Agent SQL

**Files:**
- Modify: `2touch-agent-dotnet/Services/SqlReader.cs`
- Test: `2touch-agent-dotnet/tests/RailAgent.Tests/SqlReaderTests.cs`

**Interfaces:**
- Consumes: existing `SqlReader.BusinessDate(column, cutoffHour)`, `SqlReader.Source(table, lookbackDays, cutoffHour)`, `SqlReader.Cutoff(lookbackDays)`, `SqlReader.Top(n)`.
- Produces:
  ```csharp
  public static string HourlySalesSql(string table, ZReportColumns c, int lookbackDays, int cutoffHour, int? top = null)
  public static string ServerSalesSql(string table, ServerSalesColumns c, int lookbackDays, int cutoffHour, int? top = null)
  // NOTE: ZReportColumns and the new ServerSalesColumns are sealed CLASSES with
  // settable properties (Config/AgentConfig.cs), not positional records.
  public sealed class ServerSalesColumns { Date, ServerName, Sales, Tips, TicketNo }
  ```

- [ ] **Step 1: Write the failing tests**

```csharp
// 2touch-agent-dotnet/tests/RailAgent.Tests/SqlReaderTests.cs — add to the existing class
[Fact]
public void HourlySalesSql_GroupsByBusinessDateAndClockHour()
{
    var sql = SqlReader.HourlySalesSql("dbo.tblSalesHdrHist", ZCols, lookbackDays: 2, cutoffHour: 4);

    // The hour must come off the RAW column, not the offset one. Taking
    // DATEPART on the shifted value reports 11pm trade as 7pm.
    Assert.Contains("DATEPART(HOUR, [dtmTicketDate])", sql);
    Assert.Contains("CAST(DATEADD(HOUR, -4, [dtmTicketDate]) AS DATE)", sql);
    Assert.Contains("COUNT(DISTINCT", sql);
}

[Fact]
public void HourlySalesSql_WithZeroCutoff_StillGroupsByHour()
{
    // A bar that closes before midnight has cutoff 0. It still has hours.
    var sql = SqlReader.HourlySalesSql("dbo.tblSalesHdrHist", ZCols, lookbackDays: 2, cutoffHour: 0);
    Assert.Contains("DATEPART(HOUR, [dtmTicketDate])", sql);
    Assert.DoesNotContain("DATEADD", sql);
}

[Fact]
public void ServerSalesSql_GroupsByBusinessDateAndServer()
{
    var sql = SqlReader.ServerSalesSql("dbo.tblSalesHdrHist", SrvCols, lookbackDays: 2, cutoffHour: 4);
    Assert.Contains("CAST(DATEADD(HOUR, -4, [dtmTicketDate]) AS DATE)", sql);
    Assert.Contains("COUNT(DISTINCT", sql);
    Assert.Contains("GROUP BY", sql);
}
```

Add these fixtures to the test class if not already present. `ZReportColumns`
is a **sealed class with settable properties** (`Config/AgentConfig.cs:77`), not
a positional record, so these use object-initializer syntax:

```csharp
private static readonly ZReportColumns ZCols = new()
{
    Date = "[dtmTicketDate]", Sales = "[fNetAmt]",
    CcTips = "0", CashTips = "0", CashSales = "0", CardSales = "0",
    TicketNo = "[szTicketNo]",
};

private static readonly ServerSalesColumns SrvCols = new()
{
    Date = "[dtmTicketDate]", ServerName = "[szServerName]",
    Sales = "[fNetAmt]", Tips = "[fTipAmt]", TicketNo = "[szTicketNo]",
};
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd 2touch-agent-dotnet && dotnet test`
Expected: FAIL — `HourlySalesSql` and `ServerSalesSql` do not exist.

- [ ] **Step 3: Write the implementation**

Add to `SqlReader.cs`:

```csharp
/// <summary>
/// Trade by hour of the night.
///
/// The business date is offset by the cutoff so a 1am ticket files against the
/// night before, but the HOUR is taken from the raw column. Reading the hour off
/// the shifted value would report an 11pm rush as 7pm — the two need different
/// treatments of the same column, which is the whole subtlety here.
///
/// COUNT(DISTINCT ticket) rather than COUNT(*): one ticket is one visit,
/// however many lines it has, and average ticket is the figure a busy bar is
/// actually managed by.
/// </summary>
public static string HourlySalesSql(
    string table, ZReportColumns c, int lookbackDays, int cutoffHour, int? top = null) => $"""
    SELECT {Top(top)}{BusinessDate(c.Date, cutoffHour)} AS business_date,
           DATEPART(HOUR, {c.Date})                     AS hour,
           SUM({c.Sales})                               AS net_sales,
           COUNT(DISTINCT {c.TicketNo})                 AS ticket_count,
           SUM({c.CcTips} + {c.CashTips})               AS tips
    FROM {Source(table, lookbackDays, cutoffHour)}
    WHERE {BusinessDate(c.Date, cutoffHour)} >= '{Cutoff(lookbackDays)}'
    GROUP BY {BusinessDate(c.Date, cutoffHour)}, DATEPART(HOUR, {c.Date})
    ORDER BY business_date DESC, hour
    """;

/// <summary>
/// Columns the per-server feed needs from a ticket header.
///
/// A class with settable properties rather than a positional record, to match
/// ZReportColumns and EwReportColumns — these are bound from appsettings.json,
/// and FeedSpecs mirrors their property names.
/// </summary>
public sealed class ServerSalesColumns
{
    public string Date       { get; set; } = "BusinessDate";
    public string ServerName { get; set; } = "ServerName";
    public string Sales      { get; set; } = "NetSales";
    public string Tips       { get; set; } = "Tips";
    public string TicketNo   { get; set; } = "TicketNo";
}

/// <summary>
/// Trade by whoever rang it up.
///
/// Grouped on the name rather than the user id: the id is meaningless outside
/// the POS database, and the name is what has to appear on a Rail screen.
/// </summary>
public static string ServerSalesSql(
    string table, ServerSalesColumns c, int lookbackDays, int cutoffHour, int? top = null) => $"""
    SELECT {Top(top)}{BusinessDate(c.Date, cutoffHour)} AS business_date,
           {c.ServerName}                               AS server_name,
           SUM({c.Sales})                               AS net_sales,
           COUNT(DISTINCT {c.TicketNo})                 AS ticket_count,
           SUM({c.Tips})                                AS tips
    FROM {Source(table, lookbackDays, cutoffHour)}
    WHERE {BusinessDate(c.Date, cutoffHour)} >= '{Cutoff(lookbackDays)}'
    GROUP BY {BusinessDate(c.Date, cutoffHour)}, {c.ServerName}
    ORDER BY business_date DESC, net_sales DESC
    """;
```

**`ZReportColumns` must gain a `TicketNo` property** for `HourlySalesSql`. It is a
sealed class (`Config/AgentConfig.cs:77`), so add a settable property. Default it
to the literal `"NULL"` rather than a column name, for the reason the existing
`CashSales`/`CardSales` comment gives: these strings are interpolated straight
into SQL, and a default naming a column a given schema lacks makes the whole
statement fail. `COUNT(DISTINCT NULL)` is valid SQL and returns 0, which reads
downstream as "tickets not reported" — the same honest-zero the tender split
already uses.

```csharp
/// <summary>
/// The ticket number column, for COUNT(DISTINCT) — one ticket is one visit
/// however many lines it has. Defaults to the literal NULL, not a column name:
/// see the CashSales note above for why a bad default here loses the whole feed.
/// </summary>
public string TicketNo { get; set; } = "NULL";
```

The 2Touch profile fills in the real expression (`TwoTouchProfile.cs`, alongside
where it sets `CashSales`/`CardSales`). Confirm with `dotnet build` before
running tests.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd 2touch-agent-dotnet && dotnet test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add 2touch-agent-dotnet/Services/SqlReader.cs 2touch-agent-dotnet/tests/RailAgent.Tests/SqlReaderTests.cs
git commit -m "feat(agent): hourly and per-server sales queries

The hour comes off the raw column while the business date comes off the
offset one — reading the hour from the shifted value would report an 11pm
rush as 7pm."
```

---

## Task 6: Wire the feeds into the profile and the payload

**Files:**
- Modify: `2touch-agent-dotnet/Setup/FeedSpecs.cs`
- Modify: `2touch-agent-dotnet/Setup/TwoTouchProfile.cs`
- Modify: `2touch-agent-dotnet/Worker.cs`

**Interfaces:**
- Consumes: `SqlReader.HourlySalesSql`, `SqlReader.ServerSalesSql` from Task 5; the ingest contract from Task 4 (`hourlySales`, `serverSales`).
- Produces: the agent emits both sections in its POST body.

- [ ] **Step 1: Add the feed keys**

In `FeedSpecs.cs`, beside `ItemAuditKey`:

```csharp
public const string HourlySalesKey = "HourlySales";
public const string ServerSalesKey = "ServerSales";
```

- [ ] **Step 2: Add the profile feeds**

In `TwoTouchProfile.cs`, following the shape of `ZReport`:

```csharp
public static readonly ProfileFeed HourlySales = new(
    FeedSpecs.HourlySalesKey,
    """
    (
        SELECT h.dtmTicketDate AS BusinessDate,
               h.fNetAmt       AS NetSales,
               h.szTicketNo    AS TicketNo,
               ISNULL(h.fTipAmt, 0) AS Tips
        FROM dbo.tblSalesHdrHist h
        WHERE h.dtmTicketDate >= '{cutoff}'
        UNION ALL
        SELECT h.dtmTicketDate, h.fNetAmt, h.szTicketNo, ISNULL(h.fTipAmt, 0)
        FROM dbo.tblSalesDailyHdr h
        WHERE h.dtmTicketDate >= '{cutoff}'
    ) t
    """,
    ["tblSalesHdrHist", "tblSalesDailyHdr"],
    "Trade by hour of the night, so the Sales screen can show when the rush lands.");

public static readonly ProfileFeed ServerSales = new(
    FeedSpecs.ServerSalesKey,
    """
    (
        SELECT h.dtmTicketDate AS BusinessDate,
               LTRIM(RTRIM(ISNULL(u.szFirstName, '') + ' ' + ISNULL(u.szLastName, ''))) AS ServerName,
               h.fNetAmt       AS NetSales,
               h.szTicketNo    AS TicketNo,
               ISNULL(h.fTipAmt, 0) AS Tips
        FROM dbo.tblSalesHdrHist h
        JOIN dbo.tblUser u ON u.pkID = h.fkUserID
        WHERE h.dtmTicketDate >= '{cutoff}'
    ) t
    """,
    ["tblSalesHdrHist", "tblUser"],
    "Trade by whoever rang it up.");
```

Extend the `All` array:

```csharp
public static readonly ProfileFeed[] All =
    [ZReport, EwReport, ItemAudit, HourlySales, ServerSales];
```

`Match()` already filters on `RequiredRelations`, so a POS without `tblUser` simply does not get the server feed — no code change needed for that case.

- [ ] **Step 3: Skip the hourly feed when the date column has no time**

In `Worker.cs`, where feeds are executed, guard the hourly feed:

```csharp
// A date column with no time component cannot yield an hour. Emitting hour 0
// for every ticket would draw a curve showing the whole night's trade landing
// at midnight — worse than showing no curve, because it looks like data.
if (!config.DateHasTime)
{
    log.LogInformation("Skipping {Feed}: the POS date column carries no time.", FeedSpecs.HourlySalesKey);
}
```

- [ ] **Step 4: Add both sections to the POST body**

Where the payload object is built, add:

```csharp
hourlySales = hourlyRows,   // omitted entirely when the feed did not run
serverSales = serverRows,
```

Both must be omitted (not sent as `null`) when their feed did not run, so the server's `?? []` treats them as absent rather than empty. An empty array means "this night genuinely had no trade" and would trigger a per-night replace that **deletes real rows**.

⚠️ This is the single most dangerous line in Stage A. An empty array where the feed simply did not run wipes the night.

- [ ] **Step 5: Build and test**

```bash
cd 2touch-agent-dotnet && dotnet build && dotnet test
```
Expected: build clean, tests pass.

- [ ] **Step 6: Commit**

```bash
git add 2touch-agent-dotnet/Setup/FeedSpecs.cs 2touch-agent-dotnet/Setup/TwoTouchProfile.cs 2touch-agent-dotnet/Worker.cs
git commit -m "feat(agent): emit hourly and per-server feeds

Both omitted entirely when their feed did not run. An empty array would
trigger the server's per-night replace and delete the night."
```

---

## Task 7: End-to-end verification

**Files:**
- Modify: none (verification only)

**Interfaces:**
- Consumes: everything above.
- Produces: confidence that a real payload lands in real tables.

- [ ] **Step 1: Apply the migration to the dev database**

Run the migration against your Supabase project, then confirm:
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name IN ('pos_hourly_sales','pos_server_sales',
                     'z_report_hourly_sales','z_report_server_sales');
```
Expected: the two `pos_*` tables present, both `z_report_*` absent.

- [ ] **Step 2: Post a signed payload twice**

Using the org's `pos_config.agent_token`, POST a payload containing one night with three hours and two servers. Then POST **the identical payload again**.

Expected after both: exactly 3 rows in `pos_hourly_sales` and 2 in `pos_server_sales` for that night. Any other count means the replace is not idempotent and the 5-minute re-send will multiply every bar's trade.

- [ ] **Step 3: Post the same night with one hour removed**

Expected: 2 rows for that night. A stale third row means the replace is not actually replacing, and a voided ticket would never disappear.

- [ ] **Step 4: Post a payload with neither section**

Expected: `200`, `hoursRecorded: 0`, `serversRecorded: 0`, and the rows from step 3 **untouched**. If the night is wiped, step 4 of Task 6 was implemented wrongly.

- [ ] **Step 5: Confirm the 1am ticket**

With `bar_settings.business_day_cutoff_hour = 4`, a ticket at 01:30 on Sunday 2026-08-30 must appear as `business_date = 2026-08-29, hour = 1`.

- [ ] **Step 6: Full check and commit**

```bash
npm test && npx tsc --noEmit && npm run build && npm run audit:scope
```
Expected: all pass, audit reports 0 unscoped.

```bash
git commit --allow-empty -m "test(sales): stage A verified end to end"
```

---

## Self-review notes

**Spec coverage.** Storage → Task 1. Idempotency and the void problem → Tasks 2, 4, 7. Agent queries → Task 5. Ingest optionality → Tasks 4, 6, 7. Server→employee linking → Task 1 (nullable column; resolution is Stage B, as the spec states). Business-day offset single-sourcing → Global Constraints, Tasks 5 and 7.

**Deferred to later stages, per the spec:** `SalesCapabilities`, all analytics modules, and the view. Stage A deliberately ships data nothing reads yet — the argument for building it first is that unrecorded hours are gone forever.

**Known gap:** there is no automated HTTP-level test for the ingest route (the repo has none for any route). Task 7 covers it manually. If that proves painful twice, extract the whole write path into a pure `planIngestWrites(payload)` and test that instead.
