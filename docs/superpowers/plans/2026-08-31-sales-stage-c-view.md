# Sales Stage C — View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Sales screen, switched by period, that answers a bar's questions at whatever horizon it is asking them — and that tells the truth about what it cannot answer.

**Architecture:** `/app/sales?view=tonight|day|week|month`. A server component resolves the period, computes a `SalesCapabilities` value from what data actually exists, and renders only the panels that value supports. Stage B's pure modules do all the arithmetic; this stage adds the queries that feed them and the components that show them. The existing Categories and Margins tabs are absorbed into Week/Month.

**Tech Stack:** Next.js 16 (App Router, server components), Supabase, TypeScript, vitest, Recharts (already used by `books-charts.tsx` and `trend-chart.tsx`).

**Spec:** `docs/superpowers/specs/2026-08-30-sales-system-design.md` (see "Stage C — View" and "Degradation")

## Global Constraints

- **Never render a zero in place of an unknown.** A panel with no data shows one sentence naming what is missing and how to get it — never an empty chart, never a 0. This is the spec's central rule and follows `lib/books/sales-tax.ts`: a confident wrong number on a financial screen is actively harmful.
- **`createAdminClient()` bypasses RLS.** Every query through it MUST filter `.eq('organization_id', org.id)` by hand, or carry an `// admin-scope-ok:` justification. `npm run audit:scope` enforces this and must report 0.
- **The business-day cutoff has one owner:** `cutoffHourFromSettings()` in `lib/business-date.ts`. Never write a literal `4`.
- **All arithmetic lives in Stage B.** `lib/pos/{daypart,tickets,baselines,server-performance,menu-engineering}.ts` are already built and tested. This stage calls them; it does not re-implement or duplicate any of their logic.
- **Never extrapolate a partial night.** Tonight shows what has happened, never a projected total.
- Server pages start with `const { org, role } = await getCurrentOrg()` (`lib/org.ts`).
- `components/ui` is **Base UI**, not Radix. No `asChild`; use `render` and controlled dialogs.

---

## File Structure

| file | responsibility |
|---|---|
| `lib/pos/sales-capabilities.ts` + `.test.ts` | **pure** — decide which panels the data can support |
| `lib/date-range.ts` (extend) + `.test.ts` | generalise the period helpers to include `tonight` |
| `app/(app)/app/_components/period-toggle.tsx` | shared Day/Week/Month control, moved out of payroll |
| `app/(app)/app/sales/actions.ts` (extend) | queries for hourly, per-server and shift rows |
| `app/(app)/app/sales/_components/live-band.tsx` | tonight's headline figures against their baselines |
| `app/(app)/app/sales/_components/hourly-curve.tsx` | the trade curve, untraded hours left empty |
| `app/(app)/app/sales/_components/server-table.tsx` | per-bartender panel |
| `app/(app)/app/sales/_components/menu-quadrant.tsx` | star / plowhorse / puzzle / dog |
| `app/(app)/app/sales/_components/missing-panel.tsx` | the one-sentence "we cannot answer this" card |
| `app/(app)/app/sales/page.tsx` | branches on view; composes the above |
| `app/(app)/app/sales/categories/page.tsx`, `margins/page.tsx` | → redirects |
| `app/(app)/app/_components/nav-config.ts` | drop the two absorbed tabs |
| `app/(app)/app/sales/loading.tsx` | skeleton matching the new shape |

Tasks 1–2 are pure and independent. Task 3 is the data layer. Tasks 4–7 build the screen.

---

## Task 1: Sales capabilities

**Files:**
- Create: `lib/pos/sales-capabilities.ts`
- Test: `lib/pos/sales-capabilities.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  ```ts
  export type SalesCapabilities = { hasHourly: boolean; hasServer: boolean; hasTickets: boolean };
  export type CapabilityInput = {
    hourlyRowCount: number; serverRowCount: number; totalTicketCount: number;
  };
  export function assessCapabilities(input: CapabilityInput): SalesCapabilities;
  export const CAPABILITY_HELP: Record<keyof SalesCapabilities, string>;
  ```

- [x] **Step 1: Write the failing tests**

```ts
// lib/pos/sales-capabilities.test.ts
import { describe, it, expect } from 'vitest';
import { assessCapabilities, CAPABILITY_HELP } from './sales-capabilities';

describe('assessCapabilities', () => {
  it('reports every capability when all the data is present', () => {
    expect(assessCapabilities({ hourlyRowCount: 8, serverRowCount: 3, totalTicketCount: 210 }))
      .toEqual({ hasHourly: true, hasServer: true, hasTickets: true });
  });

  it('reports nothing for a bar whose feed sends daily totals only', () => {
    // Email-fallback bars, Clover bars, and every bar's history before the
    // capture shipped. This is the common case on day one, not an edge case.
    expect(assessCapabilities({ hourlyRowCount: 0, serverRowCount: 0, totalTicketCount: 0 }))
      .toEqual({ hasHourly: false, hasServer: false, hasTickets: false });
  });

  it('treats the three capabilities independently', () => {
    // A POS can report hours without naming servers, and vice versa. Gating
    // all three on one flag would hide a panel the bar could actually have.
    expect(assessCapabilities({ hourlyRowCount: 8, serverRowCount: 0, totalTicketCount: 100 }))
      .toEqual({ hasHourly: true, hasServer: false, hasTickets: true });
    expect(assessCapabilities({ hourlyRowCount: 0, serverRowCount: 3, totalTicketCount: 100 }))
      .toEqual({ hasHourly: false, hasServer: true, hasTickets: true });
  });

  it('reports no tickets when rows exist but every ticket count is zero', () => {
    // An older agent maps TicketNo to the literal NULL, so COUNT(DISTINCT NULL)
    // returns 0 for every hour. Rows arrive, but the average ticket would be
    // a division by zero dressed up as a figure.
    expect(assessCapabilities({ hourlyRowCount: 8, serverRowCount: 2, totalTicketCount: 0 }))
      .toEqual({ hasHourly: true, hasServer: true, hasTickets: false });
  });

  it('does not trust a negative or fractional count', () => {
    expect(assessCapabilities({ hourlyRowCount: -1, serverRowCount: 0, totalTicketCount: 0 }).hasHourly)
      .toBe(false);
    expect(assessCapabilities({ hourlyRowCount: 0.5, serverRowCount: 0, totalTicketCount: 0 }).hasHourly)
      .toBe(false);
  });

  it('has help text for every capability', () => {
    for (const key of ['hasHourly', 'hasServer', 'hasTickets'] as const) {
      expect(CAPABILITY_HELP[key].length).toBeGreaterThan(0);
    }
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/pos/sales-capabilities.test.ts`
Expected: FAIL — "Failed to resolve import ./sales-capabilities".

- [x] **Step 3: Write the implementation**

```ts
// lib/pos/sales-capabilities.ts
/**
 * What this bar's data can actually answer.
 *
 * Pure — no database, no clock.
 *
 * Not every bar has ticket-grain data: bars on the email fallback, Clover bars,
 * bars on an agent older than the release that added the feeds, and every bar's
 * history from before it shipped. On day one that is MOST bars, which is why
 * this is a first-class value and not an afterthought.
 *
 * A panel the data cannot support is not rendered at all. The alternative —
 * an empty chart, or a zero standing in for an unknown — tells an operator
 * their 2am was dead when the truth is nobody ever recorded it. Reporting a
 * figure as unavailable is better than assuming one; the same rule
 * lib/books/sales-tax.ts follows for an unconfigured tax rate.
 */

export type SalesCapabilities = {
  /** The trade curve, the peak hour, revenue per traded hour. */
  hasHourly: boolean;
  /** The per-bartender panel. */
  hasServer: boolean;
  /** Ticket count and average ticket, wherever they appear. */
  hasTickets: boolean;
};

export type CapabilityInput = {
  hourlyRowCount: number;
  serverRowCount: number;
  /** Summed across every row in the period, hourly and per-server alike. */
  totalTicketCount: number;
};

export const CAPABILITY_HELP: Record<keyof SalesCapabilities, string> = {
  hasHourly:
    'Your POS feed sends daily totals only, so there is no record of when in the night the money came in. The Rail agent on the bar PC records the hour each ticket rang up.',
  hasServer:
    'Your POS feed does not say who rang each ticket up, so sales cannot be split by bartender. The Rail agent on the bar PC records it.',
  hasTickets:
    'Your POS feed does not report a ticket count, so average spend per visit cannot be worked out. Updating the Rail agent on the bar PC adds it.',
};

/** A count is only evidence if it is a whole number above zero. */
function present(count: unknown): boolean {
  const n = Number(count);
  return Number.isInteger(n) && n > 0;
}

export function assessCapabilities(input: CapabilityInput): SalesCapabilities {
  return {
    hasHourly: present(input?.hourlyRowCount),
    hasServer: present(input?.serverRowCount),
    // Deliberately NOT implied by the other two. An agent that maps the ticket
    // column to the literal NULL sends rows whose COUNT(DISTINCT NULL) is 0 —
    // real hours, no tickets — and an average ticket built on that would be a
    // division by zero presented as a figure.
    hasTickets: present(input?.totalTicketCount),
  };
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/pos/sales-capabilities.test.ts`
Expected: PASS, 6 tests.

- [x] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx eslint lib/pos/sales-capabilities.ts lib/pos/sales-capabilities.test.ts
git add lib/pos/sales-capabilities.ts lib/pos/sales-capabilities.test.ts
git commit -m "feat(sales): capability detection

Three independent flags, because a POS can report hours without naming
servers. hasTickets is not implied by the others: an older agent sends real
hours whose ticket count is zero, and an average built on that is a division
by zero dressed up as a figure."
```

---

## Task 2: The `tonight` period

**Files:**
- Modify: `lib/date-range.ts`
- Test: `lib/date-range.test.ts` (extend)

**Interfaces:**
- Consumes: existing `addDays`, `isIsoDate`, `todayIso`, `monthRange`, `PayrollView` helpers in the same file
- Produces:
  ```ts
  export type SalesView = 'tonight' | 'day' | 'week' | 'month';
  export function resolveSalesView(raw: unknown): SalesView;
  export function defaultSalesPeriod(view: SalesView, today: string): { start: string; end: string };
  export function shiftSalesPeriod(view: SalesView, start: string, end: string, dir: 'prev' | 'next'): { start: string; end: string };
  ```

- [x] **Step 1: Write the failing tests**

Append to `lib/date-range.test.ts`, and add the four names to its existing import from `'./date-range'`:

```ts
describe('resolveSalesView', () => {
  it('takes the four real views', () => {
    for (const v of ['tonight', 'day', 'week', 'month'] as const) {
      expect(resolveSalesView(v)).toBe(v);
    }
  });

  it('defaults to tonight for anything else', () => {
    // Sales opens on tonight because the question a bar asks most often is
    // "how is tonight going", and the answer is only useful during service.
    expect(resolveSalesView('banana')).toBe('tonight');
    expect(resolveSalesView(undefined)).toBe('tonight');
    expect(resolveSalesView(['tonight'])).toBe('tonight');
  });
});

describe('defaultSalesPeriod', () => {
  it('makes tonight and day a single night', () => {
    expect(defaultSalesPeriod('tonight', TODAY)).toEqual({ start: TODAY, end: TODAY });
    expect(defaultSalesPeriod('day', TODAY)).toEqual({ start: TODAY, end: TODAY });
  });

  it('gives the Monday-to-Sunday week for week', () => {
    // 2026-08-20 is a Thursday.
    expect(defaultSalesPeriod('week', TODAY)).toEqual({ start: '2026-08-17', end: '2026-08-23' });
  });

  it('gives the calendar month for month', () => {
    expect(defaultSalesPeriod('month', TODAY)).toEqual({ start: '2026-08-01', end: '2026-08-31' });
  });
});

describe('shiftSalesPeriod', () => {
  it('steps tonight and day by one night', () => {
    expect(shiftSalesPeriod('tonight', TODAY, TODAY, 'prev'))
      .toEqual({ start: '2026-08-19', end: '2026-08-19' });
    expect(shiftSalesPeriod('day', TODAY, TODAY, 'next'))
      .toEqual({ start: '2026-08-21', end: '2026-08-21' });
  });

  it('steps a week by seven days', () => {
    expect(shiftSalesPeriod('week', '2026-08-17', '2026-08-23', 'next'))
      .toEqual({ start: '2026-08-24', end: '2026-08-30' });
  });

  it('steps a month to the next month, not thirty days on', () => {
    expect(shiftSalesPeriod('month', '2026-01-01', '2026-01-31', 'next'))
      .toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/date-range.test.ts`
Expected: FAIL — the four new names are not exported.

- [x] **Step 3: Write the implementation**

Append to `lib/date-range.ts`:

```ts
// ── Sales period views ────────────────────────────────────────────────────────

/**
 * Which period the Sales screen is showing.
 *
 * `tonight` and `day` are the same range — one night — and differ only in what
 * the screen does with it: tonight refreshes during service and compares to the
 * same hour on past nights, day reports a night that is finished. Keeping them
 * as separate views rather than one plus a flag means the URL says which
 * question was asked, and a link to a past night cannot start polling.
 */
export type SalesView = 'tonight' | 'day' | 'week' | 'month';

const SALES_VIEWS: SalesView[] = ['tonight', 'day', 'week', 'month'];

export function resolveSalesView(raw: unknown): SalesView {
  return SALES_VIEWS.includes(raw as SalesView) ? (raw as SalesView) : 'tonight';
}

export function defaultSalesPeriod(
  view: SalesView,
  today: string,
): { start: string; end: string } {
  if (view === 'month') return monthRange(today);
  if (view === 'week') return defaultPeriod('week', today);
  return { start: today, end: today };
}

export function shiftSalesPeriod(
  view: SalesView,
  start: string,
  end: string,
  dir: 'prev' | 'next',
): { start: string; end: string } {
  if (view === 'month') return shiftPeriod('month', start, end, dir);
  if (view === 'week') return shiftPeriod('week', start, end, dir);

  const step = dir === 'prev' ? -1 : 1;
  const moved = addDays(start, step);
  return { start: moved, end: moved };
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/date-range.test.ts`
Expected: PASS — the whole file, including its existing cases.

- [x] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx eslint lib/date-range.ts lib/date-range.test.ts
git add lib/date-range.ts lib/date-range.test.ts
git commit -m "feat(sales): the tonight period

tonight and day are the same range and differ in what the screen does with
it. Separate views so the URL says which question was asked, and a link to a
past night cannot start polling."
```

---

## Task 3: The data layer

**Files:**
- Modify: `app/(app)/app/sales/actions.ts`

**Interfaces:**
- Consumes: `assessCapabilities` (Task 1); `buildDaypart`, `summariseTickets`, `sameWeekdayNights`, `totalToHour`, `compareToBaseline`, `buildServerPerformance`, `classifyMenu` from Stage B; `cutoffHourFromSettings` from `lib/business-date`; the existing `getSalesData`.
- Produces:
  ```ts
  export type PeriodSalesData = {
    capabilities: SalesCapabilities;
    cutoffHour: number;
    daypart: Daypart | null;
    tickets: TicketMetrics | null;
    servers: ServerPerformance[] | null;
    baseline: { netSales: Baseline; sampleDates: string[] } | null;
    menu: MenuBoard | null;
  };
  export async function getPeriodSalesData(
    view: SalesView, start: string, end: string, upToHour?: number,
  ): Promise<PeriodSalesData>;
  ```

- [x] **Step 1: Add the imports**

```ts
import { createAdminClient } from '@/lib/supabase/admin';
import { cutoffHourFromSettings } from '@/lib/business-date';
import { assessCapabilities, type SalesCapabilities } from '@/lib/pos/sales-capabilities';
import { buildDaypart, type Daypart } from '@/lib/pos/daypart';
import { summariseTickets, type TicketMetrics } from '@/lib/pos/tickets';
import {
  sameWeekdayNights, totalToHour, compareToBaseline, type Baseline,
} from '@/lib/pos/baselines';
import { buildServerPerformance, type ServerPerformance } from '@/lib/pos/server-performance';
import { classifyMenu, type MenuBoard } from '@/lib/pos/menu-engineering';
import type { SalesView } from '@/lib/date-range';
```

- [x] **Step 2: Write the loader**

Append to `app/(app)/app/sales/actions.ts`:

```ts
export type PeriodSalesData = {
  capabilities: SalesCapabilities;
  /** The bar's own day-rollover hour, so the client orders the night correctly. */
  cutoffHour: number;
  daypart: Daypart | null;
  tickets: TicketMetrics | null;
  servers: ServerPerformance[] | null;
  /** Only ever computed for a single night. Null for week and month. */
  baseline: { netSales: Baseline; sampleDates: string[] } | null;
  /** Only computed for week and month, where a menu has enough sales to rank. */
  menu: MenuBoard | null;
};

/**
 * Everything the Sales screen needs for one period.
 *
 * Every arithmetic decision here is delegated to lib/pos/* — this function's
 * only jobs are to fetch rows, decide what the data can support, and hand the
 * pure functions their arguments. Any calculation that appears in this file is
 * a calculation that will eventually disagree with the one in lib.
 *
 * `upToHour` is how a live night compares fairly. Passing it makes the baseline
 * measure past nights only as far into the evening as tonight has reached;
 * omitting it compares whole nights. Measuring a half-finished Saturday against
 * four complete ones reports a disaster every time — see lib/pos/baselines.ts.
 */
export async function getPeriodSalesData(
  view: SalesView,
  start: string,
  end: string,
  upToHour?: number,
): Promise<PeriodSalesData> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();
  const orgId = org.id;
  const cutoffHour = cutoffHourFromSettings(org.bar_settings ?? {});

  const singleNight = view === 'tonight' || view === 'day';

  // Baselines need history well before the period, so the hourly fetch reaches
  // back five weeks on a single night. Anything less cannot find four
  // same-weekday nights, and four is what separates a baseline from an anecdote.
  const hourlyFrom = singleNight ? addDays(start, -35) : start;

  const [{ data: hourly }, { data: servers }, { data: shifts }] = await Promise.all([
    supabase
      .from('pos_hourly_sales')
      .select('business_date, hour, net_sales, ticket_count, tips')
      .eq('organization_id', orgId)
      .gte('business_date', hourlyFrom)
      .lte('business_date', end),
    supabase
      .from('pos_server_sales')
      .select('business_date, server_name, net_sales, ticket_count, tips')
      .eq('organization_id', orgId)
      .gte('business_date', start)
      .lte('business_date', end),
    supabase
      .from('employee_shifts')
      .select('regular_hours, overtime_hours, employees(name)')
      .eq('organization_id', orgId)
      .gte('shift_date', start)
      .lte('shift_date', end),
  ]);

  const allHourly = hourly ?? [];
  const inPeriod = allHourly.filter((r) => r.business_date >= start && r.business_date <= end);
  const serverRows = servers ?? [];

  const capabilities = assessCapabilities({
    hourlyRowCount: inPeriod.length,
    serverRowCount: serverRows.length,
    totalTicketCount:
      inPeriod.reduce((s, r) => s + (Number(r.ticket_count) || 0), 0) +
      serverRows.reduce((s, r) => s + (Number(r.ticket_count) || 0), 0),
  });

  // Payroll hours, so the per-server panel can report sales per hour worked.
  // Left undefined rather than [] when nothing came back: "payroll was not
  // consulted" and "payroll knows nobody" are different facts, and
  // buildServerPerformance distinguishes them. See lib/pos/server-performance.ts.
  const shiftHours = (shifts ?? []).map((s) => {
    const emp = Array.isArray(s.employees) ? s.employees[0] : s.employees;
    return {
      employeeName: (emp as { name?: string } | null)?.name ?? '',
      hours: (Number(s.regular_hours) || 0) + (Number(s.overtime_hours) || 0),
    };
  }).filter((s) => s.employeeName);

  const daypart = capabilities.hasHourly && singleNight
    ? buildDaypart(inPeriod, cutoffHour)
    : null;

  const tickets = capabilities.hasHourly
    ? summariseTickets(inPeriod)
    : capabilities.hasServer
      // The per-server feed carries no hour, so revenuePerHour comes back null
      // from it — which is the honest answer rather than an invented one.
      ? summariseTickets(serverRows)
      : null;

  let baseline: PeriodSalesData['baseline'] = null;
  if (capabilities.hasHourly && singleNight) {
    const history = [...new Set(allHourly.map((r) => r.business_date as string))];
    const sampleDates = sameWeekdayNights(start, history);

    const actual = upToHour === undefined
      ? inPeriod.reduce((s, r) => s + (Number(r.net_sales) || 0), 0)
      : totalToHour(inPeriod, upToHour, cutoffHour);

    const comparables = sampleDates.map((d) => {
      const night = allHourly.filter((r) => r.business_date === d);
      return upToHour === undefined
        ? night.reduce((s, r) => s + (Number(r.net_sales) || 0), 0)
        : totalToHour(night, upToHour, cutoffHour);
    });

    baseline = { netSales: compareToBaseline(actual, comparables), sampleDates };
  }

  // Menu engineering needs a period long enough for a median to mean something.
  // One night's mix is noise; a week's is a menu.
  const menu = singleNight
    ? null
    : classifyMenu((await getSalesData('custom', start, end)).items);

  return {
    capabilities,
    cutoffHour,
    daypart,
    tickets,
    servers: capabilities.hasServer ? buildServerPerformance(serverRows, shiftHours) : null,
    baseline,
    menu,
  };
}
```

- [x] **Step 3: Verify tenancy and types**

```bash
npx tsc --noEmit
npx eslint "app/(app)/app/sales/actions.ts"
npm run audit:scope
```
Expected: tsc silent, eslint silent, audit reports **0 unscoped and unjustified**. All three new queries filter `organization_id` directly, so no `admin-scope-ok` comment should be needed — if the audit disagrees, read its output rather than adding a comment to silence it.

- [x] **Step 4: Commit**

```bash
git add "app/(app)/app/sales/actions.ts"
git commit -m "feat(sales): period data layer

Fetches rows, decides what the data can support, and hands the pure functions
their arguments. Every calculation stays in lib/pos — one that appeared here
would eventually disagree with the one in lib.

The hourly fetch reaches back five weeks on a single night: fewer cannot find
four same-weekday nights, and four is what separates a baseline from an
anecdote."
```

---

## Task 4: Share the period toggle

**Files:**
- Create: `app/(app)/app/_components/period-toggle.tsx`
- Modify: `app/(app)/app/payroll/_components/payroll-tab.tsx`, `app/(app)/app/payroll/_components/day-split-tab.tsx`
- Delete: `app/(app)/app/payroll/_components/period-toggle.tsx`

**Interfaces:**
- Produces:
  ```ts
  export function PeriodToggle<T extends string>(
    props: { view: T; items: { key: T; label: string }[]; hrefs: Record<T, string> },
  ): JSX.Element;
  ```

- [x] **Step 1: Move and generalise**

Payroll already has a Day/Week/Month toggle at `app/(app)/app/payroll/_components/period-toggle.tsx`. Sales needs the same control with a fourth option. Copying it would give two components that drift; this task moves it up to the shared `_components` directory and makes the item list a prop.

Create `app/(app)/app/_components/period-toggle.tsx` with the existing component's markup and comments preserved verbatim, changing only the signature:

```tsx
'use client';

import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * A period switcher, shared by Payroll and Sales.
 *
 * Deliberately dumb: it takes the destination for each view rather than
 * computing one. The views do not agree on what "the current period" means —
 * Payroll's day view holds its date in client state so the arrows stay instant,
 * while the week and month are rendered from the query string — so only the
 * caller can say where each link should go.
 *
 * Generic over the view type so Sales can add `tonight` without Payroll
 * gaining a period it does not have.
 */
export function PeriodToggle<T extends string>({
  view,
  items,
  hrefs,
}: {
  view: T;
  items: { key: T; label: string }[];
  hrefs: Record<T, string>;
}) {
  return (
    <div
      role="group"
      aria-label="Period"
      className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5"
    >
      {items.map(({ key, label }) => {
        const active = key === view;
        return (
          <Link
            key={key}
            href={hrefs[key]}
            aria-current={active ? 'page' : undefined}
            // min-h-8 rather than padding alone: this sits on the same row as
            // the date arrows, which are 32px, and a shorter control next to
            // them reads as a different kind of thing.
            className={cn(
              'flex min-h-8 items-center rounded-md px-3 text-sm font-medium transition-colors',
              active
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
```

- [x] **Step 2: Update Payroll's two call sites**

In both `payroll-tab.tsx` and `day-split-tab.tsx`, change the import to
`import { PeriodToggle } from '../../_components/period-toggle';`
and pass the item list explicitly:

```tsx
<PeriodToggle
  view={view}
  items={[
    { key: 'day', label: 'Day' },
    { key: 'week', label: 'Week' },
    { key: 'month', label: 'Month' },
  ]}
  hrefs={hrefs}
/>
```

In `day-split-tab.tsx` the view is the literal `"day"`; keep it, and give the array the same three entries.

- [x] **Step 3: Delete the old component**

```bash
rm "app/(app)/app/payroll/_components/period-toggle.tsx"
```

- [x] **Step 4: Verify Payroll still works**

```bash
npx tsc --noEmit
npx eslint "app/(app)/app/_components/period-toggle.tsx" "app/(app)/app/payroll/_components/payroll-tab.tsx" "app/(app)/app/payroll/_components/day-split-tab.tsx"
npm test
npm run build
```
Expected: all clean. This task changes no behaviour — Payroll must look and act exactly as before. If anything about Payroll's toggle changes visually, something was lost in the move.

- [x] **Step 5: Commit**

```bash
git add -A "app/(app)/app/_components/period-toggle.tsx" "app/(app)/app/payroll/_components"
git commit -m "refactor(ui): share the period toggle between Payroll and Sales

Generic over the view type so Sales can add 'tonight' without Payroll
gaining a period it does not have. Copying it would have given two
components that drift."
```

---

## Task 5: The missing-panel card and the live band

**Files:**
- Create: `app/(app)/app/sales/_components/missing-panel.tsx`
- Create: `app/(app)/app/sales/_components/live-band.tsx`

**Interfaces:**
- Consumes: `CAPABILITY_HELP`, `SalesCapabilities` (Task 1); `TicketMetrics` (Stage B); `Baseline` (Stage B)
- Produces:
  ```tsx
  export function MissingPanel(props: { title: string; capability: keyof SalesCapabilities }): JSX.Element;
  export function LiveBand(props: {
    title: string; netSales: number; tickets: TicketMetrics | null;
    baseline: Baseline | null; hasTickets: boolean; asOf: string | null; live: boolean;
  }): JSX.Element;
  ```

- [x] **Step 1: Write the missing-panel card**

```tsx
// app/(app)/app/sales/_components/missing-panel.tsx
import { Info } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { CAPABILITY_HELP, type SalesCapabilities } from '@/lib/pos/sales-capabilities';

/**
 * What stands in for a panel this bar's data cannot support.
 *
 * One sentence naming what is missing and how to get it — never an empty
 * chart, never a zero. A zero on a financial screen is a claim, and the claim
 * "your 2am took nothing" is false when the truth is that nobody recorded it.
 */
export function MissingPanel({
  title,
  capability,
}: {
  title: string;
  capability: keyof SalesCapabilities;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 py-6">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm font-medium">{title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{CAPABILITY_HELP[capability]}</p>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [x] **Step 2: Write the live band**

```tsx
// app/(app)/app/sales/_components/live-band.tsx
import { Radio } from 'lucide-react';
import type { TicketMetrics } from '@/lib/pos/tickets';
import type { Baseline } from '@/lib/pos/baselines';

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * Tonight's headline, against the only thing that makes it mean anything.
 *
 * "$3,240" is not information. "$3,240, up 18% on the last four Saturdays at
 * this hour" is a sentence somebody can act on. When there is not enough
 * history to say that, the band says THAT instead — a comparison against one
 * previous night is an anecdote and is labelled as one.
 *
 * Never shows a projected total. A partial night is reported as what has
 * happened, because an extrapolation is a guess and an operator will act on it.
 */
export function LiveBand({
  title,
  netSales,
  tickets,
  baseline,
  hasTickets,
  asOf,
  live,
}: {
  title: string;
  netSales: number;
  tickets: TicketMetrics | null;
  baseline: Baseline | null;
  hasTickets: boolean;
  /** "11:47pm" — when the POS last reported. Null when unknown. */
  asOf: string | null;
  live: boolean;
}) {
  const delta = baseline?.deltaPct ?? null;
  const up = delta !== null && delta >= 0;

  return (
    <section
      aria-labelledby="sales-live-heading"
      className="rounded-xl border border-primary/30 bg-primary/5 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p
            id="sales-live-heading"
            className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground"
          >
            {live && <Radio className="h-3.5 w-3.5 text-primary" aria-hidden />}
            {title}
          </p>
          <p className="mt-1 text-3xl font-bold tabular-nums text-primary sm:text-4xl">
            {money(netSales)}
          </p>
          {asOf && (
            <p className="mt-1 text-xs text-muted-foreground">
              {live ? `as of ${asOf} · still trading` : `last reported ${asOf}`}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-6">
          {hasTickets && tickets && (
            <>
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Tickets</p>
                <p className="text-2xl font-bold tabular-nums">
                  {tickets.ticketCount.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-widest text-muted-foreground">Avg ticket</p>
                <p className="text-2xl font-bold tabular-nums">
                  {/* Null, not $0. Nobody ringing up is not a $0 average. */}
                  {tickets.averageTicket === null ? '—' : money(tickets.averageTicket)}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mt-4 border-t pt-3 text-xs">
        {baseline === null || baseline.average === null ? (
          <span className="text-muted-foreground">
            No comparable nights recorded yet, so there is nothing to measure this against.
          </span>
        ) : (
          <span className={up ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
            {up ? '▲' : '▼'} {Math.abs(delta as number).toFixed(0)}% on the last{' '}
            {baseline.sampleSize} {baseline.sampleSize === 1 ? 'night' : 'nights'} like this
            {/* Said out loud: one night is an anecdote, not a baseline. */}
            {baseline.thin && (
              <span className="ml-1 text-muted-foreground">
                — thin sample, treat with caution
              </span>
            )}
          </span>
        )}
      </div>
    </section>
  );
}
```

- [x] **Step 3: Verify**

```bash
npx tsc --noEmit
npx eslint "app/(app)/app/sales/_components/missing-panel.tsx" "app/(app)/app/sales/_components/live-band.tsx"
```
Expected: silent.

- [x] **Step 4: Commit**

```bash
git add "app/(app)/app/sales/_components/missing-panel.tsx" "app/(app)/app/sales/_components/live-band.tsx"
git commit -m "feat(sales): live band and the missing-panel card

A panel the data cannot support shows one sentence saying so, never an empty
chart and never a zero — a zero is a claim, and the claim is false. The band
labels a thin baseline as thin rather than presenting one night as a trend."
```

---

## Task 6: Hourly curve, server table, menu quadrant

**Files:**
- Create: `app/(app)/app/sales/_components/hourly-curve.tsx`
- Create: `app/(app)/app/sales/_components/server-table.tsx`
- Create: `app/(app)/app/sales/_components/menu-quadrant.tsx`

**Interfaces:**
- Consumes: `Daypart` (Stage B), `ServerPerformance` (Stage B), `MenuBoard` + `MENU_CLASS_LABEL` (Stage B)

- [x] **Step 1: Write the hourly curve**

Follow `app/(app)/app/sales/_components/trend-chart.tsx` for the Recharts import style and the `'use client'` boundary. The load-bearing rule: an hour with `traded === false` must render as a GAP, not a zero-height bar.

```tsx
// app/(app)/app/sales/_components/hourly-curve.tsx
'use client';

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Daypart } from '@/lib/pos/daypart';

/**
 * The night's trade, hour by hour.
 *
 * Hours that have not traded are dropped from the series rather than plotted
 * at zero. A zero-height bar says "this hour took nothing"; an hour the bar was
 * shut, or an hour that has not happened yet on a night still in progress, is a
 * different fact and must not draw the same mark. The axis still spans the
 * whole night, so the shape of the evening stays readable.
 */
export function HourlyCurve({ daypart }: { daypart: Daypart }) {
  const data = daypart.hours.map((h) => ({
    label: h.label,
    // null, not 0 — Recharts leaves a gap for null and draws a bar for 0.
    net: h.traded ? h.netSales : null,
    peak: daypart.peak?.hour === h.hour,
  }));

  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11 }}
            interval={2}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `$${Math.round(v / 100) / 10}k`}
            tickLine={false}
            axisLine={false}
            width={44}
          />
          <Tooltip
            formatter={(v: number) => [`$${v.toFixed(2)}`, 'Net sales']}
            contentStyle={{ fontSize: 12 }}
          />
          <Bar dataKey="net" radius={[3, 3, 0, 0]}>
            {data.map((d, i) => (
              <Cell
                key={i}
                className={d.peak ? 'fill-primary' : 'fill-primary/40'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [x] **Step 2: Write the server table**

```tsx
// app/(app)/app/sales/_components/server-table.tsx
import type { ServerPerformance } from '@/lib/pos/server-performance';

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/**
 * Trade by whoever rang it up.
 *
 * Presented as a record of the period, not a leaderboard. A bartender on the
 * service well and one on the front bar are not comparable, and a table that
 * invites that comparison without saying so does real damage to a room. Hence
 * no ranking numbers, no medals, and the sales-per-hour column carrying an
 * explicit caveat rather than a trophy.
 *
 * Somebody the payroll list has never heard of still appears — they sold the
 * drinks. Their hours column simply reads as unknown.
 */
export function ServerTable({ servers }: { servers: ServerPerformance[] }) {
  const anyHours = servers.some((s) => s.hoursWorked !== null);

  return (
    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left">
            <th className="px-3 py-3 font-medium sm:px-4">Bartender</th>
            <th className="px-3 py-3 text-right font-medium sm:px-4">Sales</th>
            <th className="px-3 py-3 text-right font-medium sm:px-4">Tickets</th>
            <th className="hidden px-3 py-3 text-right font-medium sm:table-cell sm:px-4">Avg</th>
            {anyHours && (
              <th className="px-3 py-3 text-right font-medium sm:px-4">Per hour</th>
            )}
          </tr>
        </thead>
        <tbody>
          {servers.map((s) => (
            <tr key={s.serverName} className="border-b last:border-b-0">
              <td className="px-3 py-3 font-medium sm:px-4">
                {s.serverName}
                {!s.matchedEmployee && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    not on payroll
                  </span>
                )}
              </td>
              <td className="px-3 py-3 text-right tabular-nums sm:px-4">{money(s.netSales)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-muted-foreground sm:px-4">
                {s.ticketCount.toLocaleString()}
              </td>
              <td className="hidden px-3 py-3 text-right tabular-nums text-muted-foreground sm:table-cell sm:px-4">
                {s.averageTicket === null ? '—' : money(s.averageTicket)}
              </td>
              {anyHours && (
                <td className="px-3 py-3 text-right tabular-nums sm:px-4">
                  {s.salesPerHour === null ? '—' : money(s.salesPerHour)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {anyHours && (
        <p className="border-t px-3 py-2 text-xs text-muted-foreground sm:px-4">
          Sales per hour uses recorded shift hours. It is not a ranking — a well
          and a front bar are not comparable, and the busier station is not the
          better bartender.
        </p>
      )}
    </div>
  );
}
```

- [x] **Step 3: Write the menu quadrant**

```tsx
// app/(app)/app/sales/_components/menu-quadrant.tsx
import { MENU_CLASS_LABEL, type MenuBoard, type MenuClass } from '@/lib/pos/menu-engineering';

const ORDER: MenuClass[] = ['star', 'plowhorse', 'puzzle', 'dog'];

const TONE: Record<MenuClass, string> = {
  star: 'border-l-emerald-600 dark:border-l-emerald-400',
  plowhorse: 'border-l-sky-600 dark:border-l-sky-400',
  puzzle: 'border-l-amber-600 dark:border-l-amber-400',
  dog: 'border-l-rose-600 dark:border-l-rose-400',
  unknown: 'border-l-muted',
};

/**
 * Which drinks earn their place.
 *
 * Grouped rather than plotted on a scatter: the four groups ARE the answer, and
 * a scatter would invite reading precision into a split that is a median, not a
 * measurement.
 *
 * The medians are shown because the classification is only meaningful against
 * them — an operator who cannot see where the line was drawn cannot judge
 * whether an item sitting just the wrong side of it really is a dog.
 */
export function MenuQuadrant({ board }: { board: MenuBoard }) {
  const grouped = ORDER.map((cls) => ({
    cls,
    items: board.items
      .filter((i) => i.menuClass === cls)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 6),
  })).filter((g) => g.items.length > 0);

  if (grouped.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nothing sold in this period has a cost price yet, so no drink can be
        classified. Price your items to see this.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Split at this bar&rsquo;s own median — {Math.round(board.medianUnits)} sold and{' '}
        {board.medianMarginPct === null ? '—' : `${board.medianMarginPct.toFixed(0)}%`} margin.
        Not an industry target: a dive bar and a cocktail bar sit in different
        ranges and both have stars.
        {board.uncosted > 0 && (
          <>
            {' '}
            {board.uncosted} item{board.uncosted === 1 ? '' : 's'} could not be
            classified for want of a cost price.
          </>
        )}
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {grouped.map(({ cls, items }) => (
          <div key={cls} className={`rounded-xl border border-l-4 bg-card p-4 ${TONE[cls]}`}>
            <p className="text-sm font-semibold">{MENU_CLASS_LABEL[cls]}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{items[0].advice}</p>
            <ul className="mt-3 space-y-1">
              {items.map((i) => (
                <li key={i.matchKey} className="flex justify-between gap-3 text-sm">
                  <span className="min-w-0 truncate">{i.itemName}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {Math.round(i.unitsSold).toLocaleString()}
                    {i.marginPct !== null && ` · ${i.marginPct.toFixed(0)}%`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [x] **Step 4: Verify**

```bash
npx tsc --noEmit
npx eslint "app/(app)/app/sales/_components/hourly-curve.tsx" "app/(app)/app/sales/_components/server-table.tsx" "app/(app)/app/sales/_components/menu-quadrant.tsx"
```
Expected: silent.

- [x] **Step 5: Commit**

```bash
git add "app/(app)/app/sales/_components"
git commit -m "feat(sales): hourly curve, server table, menu quadrant

Untraded hours are dropped from the series rather than plotted at zero —
Recharts gaps a null and bars a 0, and the two say different things. The
server table is a record, not a leaderboard: a well and a front bar are not
comparable."
```

---

## Task 7: The page, the redirects, the nav

**Files:**
- Modify: `app/(app)/app/sales/page.tsx`
- Modify: `app/(app)/app/sales/loading.tsx`
- Replace: `app/(app)/app/sales/categories/page.tsx`, `app/(app)/app/sales/margins/page.tsx`
- Modify: `app/(app)/app/_components/nav-config.ts`

- [x] **Step 1: Rewrite the Sales page**

```tsx
// app/(app)/app/sales/page.tsx
import type { Metadata } from 'next';
import { TrendingUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getSalesData, getPeriodSalesData } from './actions';
import { getCurrentOrg } from '@/lib/org';
import { PeriodToggle } from '../_components/period-toggle';
import { LiveBand } from './_components/live-band';
import { MissingPanel } from './_components/missing-panel';
import { HourlyCurve } from './_components/hourly-curve';
import { ServerTable } from './_components/server-table';
import { MenuQuadrant } from './_components/menu-quadrant';
import { Stat, CostCoverageNotice, TaxInclusiveNotice, money, pct } from './_components/sales-bits';
import {
  resolveSalesView, defaultSalesPeriod, shiftSalesPeriod,
  payPeriodFromParams, todayIso, type SalesView,
} from '@/lib/date-range';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sales' };

const VIEW_ITEMS: { key: SalesView; label: string }[] = [
  { key: 'tonight', label: 'Tonight' },
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

/**
 * One Sales screen, switched by period.
 *
 * The same operator asks different questions at different horizons: a busy
 * club asks how tonight is going and whether the bar is staffed for the rush; a
 * neighbourhood pub asks how the month went and what to stop ordering. A bar's
 * size mostly decides which horizon it lives at, not which screen it needs.
 *
 * Every panel is gated on what the data can actually support. See
 * lib/pos/sales-capabilities.ts — a bar whose POS sends daily totals only still
 * gets a working screen, with the hourly panels replaced by one sentence
 * saying what is missing and how to get it.
 */
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const view = resolveSalesView(params.view);
  const today = todayIso();

  const period = payPeriodFromParams(params.start, params.end)
    ?? defaultSalesPeriod(view, today);

  const { org } = await getCurrentOrg();
  if (!org?.id) return <div className="p-6">Organization not found</div>;

  const singleNight = view === 'tonight' || view === 'day';
  // Tonight compares like for like: past nights are measured only as far into
  // the evening as tonight has reached. Comparing a half-finished Saturday
  // against four complete ones reports a disaster every time.
  const upToHour = view === 'tonight' ? new Date().getHours() : undefined;

  const [data, legacy] = await Promise.all([
    getPeriodSalesData(view, period.start, period.end, upToHour),
    getSalesData('custom', period.start, period.end),
  ]);

  const prev = shiftSalesPeriod(view, period.start, period.end, 'prev');
  const next = shiftSalesPeriod(view, period.start, period.end, 'next');
  const href = (v: SalesView) => {
    const p = defaultSalesPeriod(v, singleNight ? period.start : today);
    return `/app/sales?view=${v}&start=${p.start}&end=${p.end}`;
  };

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Sales</p>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <TrendingUp className="h-6 w-6 text-primary" aria-hidden />
            {singleNight ? 'The night' : view === 'week' ? 'The week' : 'The month'}
          </h1>
        </div>
        <PeriodToggle
          view={view}
          items={VIEW_ITEMS}
          hrefs={Object.fromEntries(VIEW_ITEMS.map((i) => [i.key, href(i.key)])) as Record<SalesView, string>}
        />
      </div>

      <div className="flex items-center gap-2 text-sm">
        <a className="rounded-md border px-2 py-1 hover:bg-muted"
           href={`/app/sales?view=${view}&start=${prev.start}&end=${prev.end}`}>←</a>
        <span className="min-w-[180px] text-center font-medium">
          {period.start === period.end ? period.start : `${period.start} – ${period.end}`}
        </span>
        <a className="rounded-md border px-2 py-1 hover:bg-muted"
           href={`/app/sales?view=${view}&start=${next.start}&end=${next.end}`}>→</a>
      </div>

      {legacy.revenueIncludesTax && <TaxInclusiveNotice rate={legacy.salesTaxRate} />}

      {singleNight ? (
        data.capabilities.hasHourly && data.daypart ? (
          <>
            <LiveBand
              title={view === 'tonight' ? 'Tonight' : period.start}
              netSales={data.daypart.totalNet}
              tickets={data.tickets}
              baseline={data.baseline?.netSales ?? null}
              hasTickets={data.capabilities.hasTickets}
              asOf={data.daypart.peak ? null : null}
              live={view === 'tonight'}
            />
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">When the money came in</CardTitle>
                {data.daypart.peak && (
                  <p className="text-xs text-muted-foreground">
                    Busiest hour {data.daypart.peak.label} — {money(data.daypart.peak.netSales)}
                  </p>
                )}
              </CardHeader>
              <CardContent><HourlyCurve daypart={data.daypart} /></CardContent>
            </Card>
          </>
        ) : (
          <MissingPanel title="When the money came in" capability="hasHourly" />
        )
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Revenue" value={money(legacy.summary.revenue)} sub={`${legacy.summary.itemCount} items sold`} />
            <Stat label="Cost to pour" value={money(legacy.summary.cost)} sub="Ingredient cost" />
            <Stat label="Margin" value={money(legacy.summary.margin)} tone="good" />
            <Stat label="Margin %" value={pct(legacy.summary.marginPct)}
                  tone={legacy.summary.itemsMissingCost > 0 ? 'warn' : 'good'} />
          </div>
          <CostCoverageNotice
            itemsMissingCost={legacy.summary.itemsMissingCost}
            revenueMissingCost={legacy.summary.revenueMissingCost}
            revenue={legacy.summary.revenue}
          />
          {data.menu && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">What earns its place</CardTitle>
              </CardHeader>
              <CardContent><MenuQuadrant board={data.menu} /></CardContent>
            </Card>
          )}
        </>
      )}

      {data.capabilities.hasServer && data.servers ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Who was pouring</CardTitle>
          </CardHeader>
          <CardContent><ServerTable servers={data.servers} /></CardContent>
        </Card>
      ) : (
        <MissingPanel title="Who was pouring" capability="hasServer" />
      )}
    </main>
  );
}
```

- [x] **Step 2: Replace the two absorbed pages with redirects**

```tsx
// app/(app)/app/sales/categories/page.tsx
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * Categories folded into the week and month views of /app/sales.
 *
 * Kept as a redirect rather than deleted: the path has been in the sidebar and
 * in links sent to staff, the same reason LEGACY_TAB_ROUTES exists in Payroll.
 */
export default function CategoriesRedirect() {
  redirect('/app/sales?view=week');
}
```

```tsx
// app/(app)/app/sales/margins/page.tsx
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/** Margins folded into the week and month views of /app/sales. */
export default function MarginsRedirect() {
  redirect('/app/sales?view=month');
}
```

- [x] **Step 3: Drop the two tabs from the nav**

In `app/(app)/app/_components/nav-config.ts`, remove the Categories and Margins entries from the Sales section's `tabs` array, leaving the Sales root. Remove any lucide icon import that becomes unused — `npx eslint` will name it.

- [x] **Step 4: Update the loading skeleton**

Rewrite `app/(app)/app/sales/loading.tsx` to match the new shape: a header row, a band, one tall card, one table card. Follow the existing file's `Skeleton` usage.

- [x] **Step 5: Full verification**

```bash
npx tsc --noEmit
npx eslint "app/(app)/app/sales" "app/(app)/app/_components/nav-config.ts"
npm test
npm run build
npm run audit:scope
```
Expected: all clean, audit 0 unscoped.

- [x] **Step 6: Commit**

```bash
git add -A "app/(app)/app/sales" "app/(app)/app/_components/nav-config.ts"
git commit -m "feat(sales): one period-driven Sales screen

Tonight / Day / Week / Month on one route, with every panel gated on what
the bar's data can actually support. Categories and Margins are absorbed
into Week and Month; both paths redirect.

A bar whose POS sends daily totals only still gets a working screen — the
hourly panels are replaced by one sentence saying what is missing and how
to get it, never an empty chart."
```

---

## Self-review notes

**Spec coverage.** Period-driven single screen → Tasks 2, 7. Capability gating and honest degradation → Tasks 1, 5, 7. Hourly curve with untraded hours empty → Task 6. Live band with baselines → Task 5. Per-server panel → Task 6. Menu engineering → Task 6. Absorbing Categories/Margins with redirects → Task 7. Reusing `lib/date-range` rather than duplicating → Task 2.

**Known gaps, deliberately left:**
- **The "as of" line is wired but not fed.** `LiveBand` takes an `asOf` prop and Task 7 passes `null`. Feeding it means reading `pos_config.last_sync_summary` through `assessSyncHealth` in `lib/pos/sync-health.ts`, which is a self-contained follow-up. The prop exists so the component does not need reopening.
- **Tonight does not yet auto-refresh.** `upToHour` is computed per request and the page is `force-dynamic`, so a reload is current. Polling is a small client addition once the shape is proven against real data; adding it before the panels exist would be guessing at what to poll.
- **No browser verification in this plan.** The screens need real hourly rows to look right, and no bar has them until an updated agent runs. Drive it against the demo org after Task 7 and expect the degraded path — which is itself the most important case to see, since it is what most bars get on day one.

**Type consistency:** `SalesView` is defined once in `lib/date-range.ts` and imported by Tasks 3 and 7. `SalesCapabilities` is defined once in Task 1 and imported by Tasks 3, 5, 7. Every Stage B type (`Daypart`, `TicketMetrics`, `Baseline`, `ServerPerformance`, `MenuBoard`) is imported from its existing module, never redeclared.
