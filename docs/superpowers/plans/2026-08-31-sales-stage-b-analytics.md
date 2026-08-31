# Sales Stage B — Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The pure functions that turn Stage A's captured rows into the answers the Sales screen asks for — when the bar trades, what a ticket is worth, who sold it, how tonight compares, and which drinks earn their place on the menu.

**Architecture:** Five independent modules in `lib/pos/`, each pure (no database, no clock, no I/O), each with its own vitest file. They take plain row arrays and return plain results. Nothing here imports from the ingest route or the agent; the only shared dependency is `lib/business-date.ts` for the cutoff hour. This stage ships no UI — Stage C consumes it.

**Tech Stack:** TypeScript, vitest.

**Spec:** `docs/superpowers/specs/2026-08-30-sales-system-design.md` (see "Stage B — Analytics")

## Global Constraints

- **Every module is PURE.** No database, no `Date.now()`, no I/O. "Today" and "now" are always parameters. This is what makes the whole stage cheaply testable and is the established pattern in `lib/pos/sales-analytics.ts`.
- **The business-day cutoff has one owner:** `cutoffHourFromSettings()` in `lib/business-date.ts`, reading `bar_settings.business_day_cutoff_hour`, default `4`, valid 0–12. Never write a literal `4`.
- **`hour` is the real clock hour 0–23**, paired with the business date it belongs to. A 01:30 ticket on Sunday is `business_date = Saturday, hour = 1`. Display ordering is derived from the cutoff, never from a shifted stored value.
- **Money is rounded to 2 decimals** via `Math.round(n * 100) / 100`, matching `round2` in `sales-analytics.ts`.
- **Null, never 0, for "unknown".** A percentage with no denominator is `null`. `sales-analytics.ts` and `books/cost-structure.ts` both do this deliberately: "0% margin" reads as a trading result when it actually means there was nothing to divide by.
- **Input rows use snake_case** (they come from Postgres): `business_date`, `hour`, `net_sales`, `ticket_count`, `tips`, `server_name`. Outputs use camelCase, matching the existing analytics modules.

---

## Input row shapes (produced by Stage A, consumed by every task here)

```ts
type HourlyRow = {
  business_date: string; hour: number;
  net_sales: number; ticket_count: number; tips: number;
};
type ServerRow = {
  business_date: string; server_name: string;
  net_sales: number; ticket_count: number; tips: number;
};
```

Each task defines the ones it needs locally rather than sharing a barrel file — they are five-field records, and a shared types module would couple five otherwise-independent units.

---

## File Structure

| file | responsibility |
|---|---|
| `lib/pos/daypart.ts` + `.test.ts` | order a night's hours on the bar's own clock; peak hour; share of night |
| `lib/pos/tickets.ts` + `.test.ts` | ticket count, average ticket, revenue per traded hour |
| `lib/pos/baselines.ts` + `.test.ts` | compare a night to the last N same-weekdays, whole or to-this-hour |
| `lib/pos/server-performance.ts` + `.test.ts` | per-bartender sales, tickets, average ticket, sales per hour worked |
| `lib/pos/menu-engineering.ts` + `.test.ts` | classify `ItemMargin[]` into stars / plowhorses / puzzles / dogs |

Tasks 1–5 are independent of each other. Only Task 3 (`baselines`) consumes another module's export, and only for a type.

---

## Task 1: Daypart — ordering a night on the bar's own clock

**Files:**
- Create: `lib/pos/daypart.ts`
- Test: `lib/pos/daypart.test.ts`

**Interfaces:**
- Consumes: `DEFAULT_BUSINESS_DAY_CUTOFF_HOUR` from `@/lib/business-date`
- Produces:
  ```ts
  export type HourlyRow = { business_date: string; hour: number; net_sales: number; ticket_count: number; tips: number };
  export type DaypartHour = { hour: number; label: string; netSales: number; ticketCount: number; sharePct: number | null; traded: boolean };
  export type Daypart = { hours: DaypartHour[]; peak: DaypartHour | null; totalNet: number; totalTickets: number };
  export function orderNightHours(cutoffHour?: number): number[];
  export function buildDaypart(rows: HourlyRow[], cutoffHour?: number): Daypart;
  export function hourLabel(hour: number): string;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/pos/daypart.test.ts
import { describe, it, expect } from 'vitest';
import { orderNightHours, buildDaypart, hourLabel, type HourlyRow } from './daypart';

const row = (hour: number, net: number, tickets = 1): HourlyRow => ({
  business_date: '2026-08-29', hour, net_sales: net, ticket_count: tickets, tips: 0,
});

describe('orderNightHours', () => {
  it('starts the night at the cutoff hour, not at midnight', () => {
    // A bar whose day rolls over at 4am trades 4am -> 3am. Ordering 0..23
    // would put closing time at the START of the chart and the evening in
    // the middle, which is not a night anyone recognises.
    const order = orderNightHours(4);
    expect(order).toHaveLength(24);
    expect(order[0]).toBe(4);
    expect(order[23]).toBe(3);
  });

  it('puts late-night hours after the evening, not before it', () => {
    const order = orderNightHours(4);
    expect(order.indexOf(23)).toBeLessThan(order.indexOf(1));
  });

  it('is a plain 0..23 when the day rolls at midnight', () => {
    expect(orderNightHours(0)).toEqual([...Array(24).keys()]);
  });

  it('defaults to the shared cutoff rather than hardcoding one', () => {
    expect(orderNightHours()).toEqual(orderNightHours(4));
  });
});

describe('hourLabel', () => {
  it('reads as a bar would say it', () => {
    expect(hourLabel(0)).toBe('12am');
    expect(hourLabel(1)).toBe('1am');
    expect(hourLabel(12)).toBe('12pm');
    expect(hourLabel(23)).toBe('11pm');
  });
});

describe('buildDaypart', () => {
  it('orders the hours on the bar clock and totals the night', () => {
    const d = buildDaypart([row(22, 100), row(1, 50), row(19, 25)], 4);
    const traded = d.hours.filter((h) => h.traded).map((h) => h.hour);
    expect(traded).toEqual([19, 22, 1]);
    expect(d.totalNet).toBe(175);
    expect(d.totalTickets).toBe(3);
  });

  it('marks hours with no row as untraded rather than zero', () => {
    // A zero reads as a dead hour. An hour the bar was shut, or an hour that
    // has not happened yet tonight, is not the same fact and must not draw
    // the same bar on a chart.
    const d = buildDaypart([row(22, 100)], 4);
    const twentyTwo = d.hours.find((h) => h.hour === 22)!;
    const three = d.hours.find((h) => h.hour === 3)!;
    expect(twentyTwo.traded).toBe(true);
    expect(three.traded).toBe(false);
    expect(three.netSales).toBe(0);
    expect(three.sharePct).toBeNull();
  });

  it('finds the peak by takings, not by ticket count', () => {
    // The busiest hour by headcount is often not the hour that made the money,
    // and staffing decisions follow the money.
    const d = buildDaypart([row(22, 100, 2), row(23, 300, 1)], 4);
    expect(d.peak?.hour).toBe(23);
  });

  it('reports each traded hour as a share of the night', () => {
    const d = buildDaypart([row(22, 250), row(23, 750)], 4);
    expect(d.hours.find((h) => h.hour === 22)!.sharePct).toBeCloseTo(25, 5);
    expect(d.hours.find((h) => h.hour === 23)!.sharePct).toBeCloseTo(75, 5);
  });

  it('returns a null peak and null shares for a night with no takings', () => {
    const d = buildDaypart([], 4);
    expect(d.peak).toBeNull();
    expect(d.totalNet).toBe(0);
    expect(d.hours.every((h) => h.sharePct === null)).toBe(true);
  });

  it('sums duplicate hours rather than letting one win', () => {
    const d = buildDaypart([row(22, 100, 2), row(22, 50, 3)], 4);
    const h = d.hours.find((x) => x.hour === 22)!;
    expect(h.netSales).toBe(150);
    expect(h.ticketCount).toBe(5);
  });

  it('ignores rows with an out-of-range hour', () => {
    const d = buildDaypart([row(22, 100), { ...row(0, 999), hour: 24 }], 4);
    expect(d.totalNet).toBe(100);
  });

  it('always returns 24 hours so a chart has a stable axis', () => {
    expect(buildDaypart([row(22, 1)], 4).hours).toHaveLength(24);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/pos/daypart.test.ts`
Expected: FAIL — "Failed to resolve import ./daypart".

- [ ] **Step 3: Write the implementation**

```ts
// lib/pos/daypart.ts
/**
 * A night's trade, hour by hour, on the bar's own clock.
 *
 * Pure — no database, no clock.
 *
 * WHY THE ORDER IS NOT 0..23
 *
 * A bar's night does not start at midnight. One that rolls its business day at
 * 4am trades from 4am round to 3am, so an axis running 0..23 puts closing time
 * at the far left and the evening in the middle — a shape nobody recognises as
 * their own night. The stored `hour` stays the honest clock hour; the ORDER is
 * derived here from the same cutoff the rest of the app reads.
 *
 * WHY UNTRADED IS NOT ZERO
 *
 * An hour with no row is not an hour that took nothing. It is an hour the bar
 * was shut, or an hour that has not happened yet on a night still in progress.
 * Drawing it as a zero bar tells the operator their 2am was dead when in fact
 * it is 11pm and 2am has not arrived. `traded` separates the two, and the share
 * is null rather than 0 for the same reason.
 */

import { DEFAULT_BUSINESS_DAY_CUTOFF_HOUR } from '@/lib/business-date';

export type HourlyRow = {
  business_date: string;
  hour: number;
  net_sales: number;
  ticket_count: number;
  tips: number;
};

export type DaypartHour = {
  hour: number;
  /** How a bar would say it: "11pm", not "23:00". */
  label: string;
  netSales: number;
  ticketCount: number;
  /** Share of the night's takings. Null when the night took nothing. */
  sharePct: number | null;
  /** False when no row exists for this hour — distinct from taking zero. */
  traded: boolean;
};

export type Daypart = {
  /** Always 24 entries, in bar-clock order, so a chart axis is stable. */
  hours: DaypartHour[];
  /** The hour that made the most money. Null when nothing was taken. */
  peak: DaypartHour | null;
  totalNet: number;
  totalTickets: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/** "11pm", "12am", "1am" — how the hour is said behind a bar. */
export function hourLabel(hour: number): string {
  const suffix = hour < 12 ? 'am' : 'pm';
  const h = hour % 12 === 0 ? 12 : hour % 12;
  return `${h}${suffix}`;
}

/**
 * The 24 clock hours in the order this bar lives them.
 *
 * Cutoff 4 gives 4,5,...,23,0,1,2,3. Cutoff 0 gives a plain 0..23.
 */
export function orderNightHours(
  cutoffHour: number = DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
): number[] {
  const start = ((Math.trunc(cutoffHour) % 24) + 24) % 24;
  return Array.from({ length: 24 }, (_, i) => (start + i) % 24);
}

export function buildDaypart(
  rows: HourlyRow[],
  cutoffHour: number = DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
): Daypart {
  const byHour = new Map<number, { net: number; tickets: number }>();

  for (const r of rows ?? []) {
    const hour = Number(r?.hour);
    // Junk is skipped, not defaulted to hour 0 — an unplaceable row would
    // otherwise pile onto midnight and invent a rush that never happened.
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;

    const net = Number(r?.net_sales);
    const tickets = Number(r?.ticket_count);
    const acc = byHour.get(hour) ?? { net: 0, tickets: 0 };
    acc.net += Number.isFinite(net) ? net : 0;
    acc.tickets += Number.isFinite(tickets) ? tickets : 0;
    byHour.set(hour, acc);
  }

  const totalNet = round2([...byHour.values()].reduce((s, v) => s + v.net, 0));
  const totalTickets = [...byHour.values()].reduce((s, v) => s + v.tickets, 0);

  const hours: DaypartHour[] = orderNightHours(cutoffHour).map((hour) => {
    const found = byHour.get(hour);
    return {
      hour,
      label: hourLabel(hour),
      netSales: round2(found?.net ?? 0),
      ticketCount: found?.tickets ?? 0,
      sharePct: found && totalNet > 0 ? (found.net / totalNet) * 100 : null,
      traded: found !== undefined,
    };
  });

  // By takings, not by headcount: the busiest hour by tickets is often not the
  // hour that made the money, and staffing follows the money.
  let peak: DaypartHour | null = null;
  for (const h of hours) {
    if (!h.traded) continue;
    if (peak === null || h.netSales > peak.netSales) peak = h;
  }
  if (totalNet <= 0) peak = null;

  return { hours, peak, totalNet, totalTickets };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/pos/daypart.test.ts`
Expected: PASS, 13 tests.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx eslint lib/pos/daypart.ts lib/pos/daypart.test.ts
git add lib/pos/daypart.ts lib/pos/daypart.test.ts
git commit -m "feat(sales): daypart curve on the bar's own clock

An axis running 0..23 puts closing time at the far left. The order comes
from the same cutoff hour the rest of the app reads. Untraded hours are
marked, not zeroed: an hour that has not happened yet is not a dead hour."
```

---

## Task 2: Tickets — what a visit is worth

**Files:**
- Create: `lib/pos/tickets.ts`
- Test: `lib/pos/tickets.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  ```ts
  export type TicketRow = { net_sales: number; ticket_count: number; tips: number };
  export type TicketMetrics = {
    netSales: number; ticketCount: number;
    averageTicket: number | null; tipRatePct: number | null;
    tradedHours: number; revenuePerHour: number | null;
  };
  export function summariseTickets(rows: (TicketRow & { hour?: number })[]): TicketMetrics;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/pos/tickets.test.ts
import { describe, it, expect } from 'vitest';
import { summariseTickets } from './tickets';

const r = (net: number, tickets: number, tips = 0, hour = 22) =>
  ({ net_sales: net, ticket_count: tickets, tips, hour });

describe('summariseTickets', () => {
  it('averages the ticket over the whole period, not per hour', () => {
    // 1000 across 50 tickets is $20, regardless of how the hours split.
    const m = summariseTickets([r(600, 30, 0, 22), r(400, 20, 0, 23)]);
    expect(m.netSales).toBe(1000);
    expect(m.ticketCount).toBe(50);
    expect(m.averageTicket).toBeCloseTo(20, 5);
  });

  it('reports a null average when nobody rang up, not zero', () => {
    // "$0 average ticket" reads as a catastrophic night. No tickets means the
    // question has no answer.
    const m = summariseTickets([r(0, 0)]);
    expect(m.ticketCount).toBe(0);
    expect(m.averageTicket).toBeNull();
  });

  it('counts only hours that actually traded', () => {
    // Revenue per hour must divide by hours the bar was OPEN. Dividing by 24
    // would report every bar as quiet.
    const m = summariseTickets([r(300, 10, 0, 21), r(300, 10, 0, 22)]);
    expect(m.tradedHours).toBe(2);
    expect(m.revenuePerHour).toBeCloseTo(300, 5);
  });

  it('treats repeated hours as one traded hour', () => {
    const m = summariseTickets([r(100, 5, 0, 22), r(100, 5, 0, 22)]);
    expect(m.tradedHours).toBe(1);
    expect(m.revenuePerHour).toBeCloseTo(200, 5);
  });

  it('reports null revenue-per-hour when no hour is known', () => {
    // The per-server feed has no hour. Asking it for revenue per hour is a
    // question it cannot answer, and inventing one would be a lie.
    const m = summariseTickets([{ net_sales: 500, ticket_count: 25, tips: 0 }]);
    expect(m.tradedHours).toBe(0);
    expect(m.revenuePerHour).toBeNull();
    expect(m.averageTicket).toBeCloseTo(20, 5);
  });

  it('expresses tips as a rate on net sales', () => {
    const m = summariseTickets([r(1000, 50, 180)]);
    expect(m.tipRatePct).toBeCloseTo(18, 5);
  });

  it('reports a null tip rate when there were no sales to tip on', () => {
    expect(summariseTickets([r(0, 0, 0)]).tipRatePct).toBeNull();
  });

  it('handles an empty period without dividing by zero', () => {
    const m = summariseTickets([]);
    expect(m).toEqual({
      netSales: 0, ticketCount: 0, averageTicket: null,
      tipRatePct: null, tradedHours: 0, revenuePerHour: null,
    });
  });

  it('keeps a negative net (a refund-heavy hour) rather than clamping', () => {
    const m = summariseTickets([r(-40, 1)]);
    expect(m.netSales).toBe(-40);
    expect(m.averageTicket).toBeCloseTo(-40, 5);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/pos/tickets.test.ts`
Expected: FAIL — "Failed to resolve import ./tickets".

- [ ] **Step 3: Write the implementation**

```ts
// lib/pos/tickets.ts
/**
 * What a visit is worth.
 *
 * Pure — no database, no clock.
 *
 * Average ticket is the figure a busy bar is actually managed by: it moves when
 * the mix changes, when an upsell lands, when a promotion drags spend down. Net
 * sales alone cannot tell those apart from a quieter night.
 *
 * One ticket is one visit however many lines it carries, which is why Stage A
 * captures COUNT(DISTINCT ticket) rather than a line count.
 */

export type TicketRow = {
  net_sales: number;
  ticket_count: number;
  tips: number;
};

export type TicketMetrics = {
  netSales: number;
  ticketCount: number;
  /** Null when nobody rang up — "$0 average" reads as a disaster instead. */
  averageTicket: number | null;
  /** Tips as a percentage of net sales. Null when there were no sales. */
  tipRatePct: number | null;
  /** Distinct hours that carried a row. Zero when the rows carry no hour. */
  tradedHours: number;
  /** Null when no hour is known — the per-server feed cannot answer this. */
  revenuePerHour: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function summariseTickets(
  rows: (TicketRow & { hour?: number })[],
): TicketMetrics {
  let netSales = 0;
  let ticketCount = 0;
  let tips = 0;

  // A set, not a count: the same hour can appear on more than one row, and
  // counting rows would divide the night's takings by an inflated hour count
  // and under-report how hard the bar was working.
  const hours = new Set<number>();

  for (const r of rows ?? []) {
    netSales += num(r?.net_sales);
    ticketCount += num(r?.ticket_count);
    tips += num(r?.tips);

    const hour = Number(r?.hour);
    if (Number.isInteger(hour) && hour >= 0 && hour <= 23) hours.add(hour);
  }

  netSales = round2(netSales);
  tips = round2(tips);

  return {
    netSales,
    ticketCount,
    averageTicket: ticketCount > 0 ? round2(netSales / ticketCount) : null,
    // Guarded on a POSITIVE net: a refund-only period would otherwise report a
    // tip rate computed against a negative denominator, which is meaningless.
    tipRatePct: netSales > 0 ? (tips / netSales) * 100 : null,
    tradedHours: hours.size,
    revenuePerHour: hours.size > 0 ? round2(netSales / hours.size) : null,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/pos/tickets.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx eslint lib/pos/tickets.ts lib/pos/tickets.test.ts
git add lib/pos/tickets.ts lib/pos/tickets.test.ts
git commit -m "feat(sales): ticket metrics

Revenue per hour divides by hours that actually traded, not by 24. Average
ticket is null rather than zero when nobody rang up."
```

---

## Task 3: Baselines — the number that makes tonight mean something

**Files:**
- Create: `lib/pos/baselines.ts`
- Test: `lib/pos/baselines.test.ts`

**Interfaces:**
- Consumes: `HourlyRow` type shape (redeclared locally — do NOT import from daypart, these modules stay independent)
- Produces:
  ```ts
  export type NightTotal = { business_date: string; netSales: number };
  export type Baseline = {
    /** Mean of the comparable nights. Null when there is not enough history. */
    average: number | null;
    /** How many nights the average is built from. */
    sampleSize: number;
    /** Percent difference of `actual` against `average`. Null when no baseline. */
    deltaPct: number | null;
    /** True when fewer than `minSample` nights were available. */
    thin: boolean;
  };
  export function sameWeekdayNights(target: string, all: string[], limit?: number): string[];
  export function totalToHour(rows: HourlyRow[], upToHour: number, cutoffHour?: number): number;
  export function compareToBaseline(actual: number, comparables: number[], minSample?: number): Baseline;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/pos/baselines.test.ts
import { describe, it, expect } from 'vitest';
import { sameWeekdayNights, totalToHour, compareToBaseline, type HourlyRow } from './baselines';

const row = (hour: number, net: number): HourlyRow => ({
  business_date: '2026-08-29', hour, net_sales: net, ticket_count: 1, tips: 0,
});

describe('sameWeekdayNights', () => {
  // 2026-08-29 is a Saturday.
  const history = [
    '2026-08-29', '2026-08-28', '2026-08-27', '2026-08-26',
    '2026-08-22', '2026-08-15', '2026-08-08', '2026-08-01', '2026-07-25',
  ];

  it('picks only the same weekday', () => {
    // A Saturday compared against a Tuesday is not a comparison, it is noise.
    const out = sameWeekdayNights('2026-08-29', history);
    expect(out).not.toContain('2026-08-28');
    expect(out).toContain('2026-08-22');
  });

  it('excludes the target night itself', () => {
    expect(sameWeekdayNights('2026-08-29', history)).not.toContain('2026-08-29');
  });

  it('takes the most recent first and honours the limit', () => {
    expect(sameWeekdayNights('2026-08-29', history, 2)).toEqual(['2026-08-22', '2026-08-15']);
  });

  it('never looks forward in time', () => {
    // A baseline built partly from the future is not a baseline.
    const out = sameWeekdayNights('2026-08-08', history);
    expect(out.every((d) => d < '2026-08-08')).toBe(true);
  });

  it('returns nothing when there is no history', () => {
    expect(sameWeekdayNights('2026-08-29', [])).toEqual([]);
  });
});

describe('totalToHour', () => {
  it('sums only the hours that have happened so far tonight', () => {
    // Comparing a half-finished Saturday against four complete ones reports a
    // disaster every single time. This is the whole point of the module.
    const rows = [row(19, 100), row(22, 400), row(1, 200)];
    expect(totalToHour(rows, 22, 4)).toBe(500);
  });

  it('includes the current hour itself', () => {
    expect(totalToHour([row(19, 100), row(20, 50)], 20, 4)).toBe(150);
  });

  it('counts a post-midnight hour as LATER than the evening', () => {
    // 1am comes after 11pm on a bar's night. Comparing raw hour numbers would
    // treat 1am as the earliest hour of the night and drop the whole evening.
    const rows = [row(22, 100), row(1, 50)];
    expect(totalToHour(rows, 1, 4)).toBe(150);
    expect(totalToHour(rows, 22, 4)).toBe(100);
  });

  it('sums the whole night when asked for the last hour of it', () => {
    const rows = [row(19, 100), row(23, 100), row(2, 100)];
    expect(totalToHour(rows, 3, 4)).toBe(300);
  });

  it('is zero for a night with no rows', () => {
    expect(totalToHour([], 22, 4)).toBe(0);
  });
});

describe('compareToBaseline', () => {
  it('reports the percentage difference against the mean', () => {
    expect(compareToBaseline(1180, [1000, 1000, 1000, 1000]).deltaPct).toBeCloseTo(18, 5);
  });

  it('reports a shortfall as negative', () => {
    expect(compareToBaseline(800, [1000, 1000, 1000, 1000]).deltaPct).toBeCloseTo(-20, 5);
  });

  it('flags a thin sample rather than hiding it', () => {
    // Four Saturdays is a baseline. One Saturday is an anecdote, and the
    // screen must be able to say so.
    const thin = compareToBaseline(1180, [1000]);
    expect(thin.sampleSize).toBe(1);
    expect(thin.thin).toBe(true);
    expect(thin.deltaPct).toBeCloseTo(18, 5);

    expect(compareToBaseline(1180, [1000, 1000, 1000, 1000]).thin).toBe(false);
  });

  it('has no answer when there is no history at all', () => {
    const none = compareToBaseline(1180, []);
    expect(none.average).toBeNull();
    expect(none.deltaPct).toBeNull();
    expect(none.sampleSize).toBe(0);
    expect(none.thin).toBe(true);
  });

  it('reports no delta when every comparable night took nothing', () => {
    // Dividing by a zero average yields Infinity, which would render as an
    // absurd percentage on a financial screen.
    const z = compareToBaseline(500, [0, 0]);
    expect(z.average).toBe(0);
    expect(z.deltaPct).toBeNull();
  });

  it('respects a custom minimum sample', () => {
    expect(compareToBaseline(100, [100, 100], 2).thin).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/pos/baselines.test.ts`
Expected: FAIL — "Failed to resolve import ./baselines".

- [ ] **Step 3: Write the implementation**

```ts
// lib/pos/baselines.ts
/**
 * What makes a live number mean anything.
 *
 * Pure — no database, no clock.
 *
 * "$3,240 tonight" is not information. "$3,240, up 18% on the last four
 * Saturdays at this hour" is a sentence somebody can act on. Without a baseline
 * the live view is a number nobody can do anything with, which is most of the
 * argument for capturing hourly data at all.
 *
 * COMPARING TO THIS HOUR, NOT TO THE WHOLE NIGHT
 *
 * The load-bearing detail. Measuring a half-finished Saturday against four
 * COMPLETE Saturdays reports a disaster every time, and would do so most
 * loudly at 9pm on the best night of the week. `totalToHour` exists so the
 * comparison is like for like.
 */

import { DEFAULT_BUSINESS_DAY_CUTOFF_HOUR } from '@/lib/business-date';

export type HourlyRow = {
  business_date: string;
  hour: number;
  net_sales: number;
  ticket_count: number;
  tips: number;
};

export type NightTotal = { business_date: string; netSales: number };

export type Baseline = {
  /** Mean of the comparable nights. Null when there is no history. */
  average: number | null;
  sampleSize: number;
  /** Percent difference against the average. Null when it cannot be computed. */
  deltaPct: number | null;
  /** Fewer comparable nights than asked for — the screen should say so. */
  thin: boolean;
};

/** Four same-weekdays is a month of that night. Fewer is an anecdote. */
export const DEFAULT_MIN_SAMPLE = 4;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Day of week for a YYYY-MM-DD, in UTC so a timezone cannot shift it. */
function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * The most recent nights that fall on the same weekday as `target`.
 *
 * Same weekday because a Saturday compared against a Tuesday is not a
 * comparison. Strictly earlier than the target, because a baseline built partly
 * from the future is not a baseline.
 */
export function sameWeekdayNights(
  target: string,
  all: string[],
  limit: number = DEFAULT_MIN_SAMPLE,
): string[] {
  const want = weekdayOf(target);
  return (all ?? [])
    .filter((d) => d < target && weekdayOf(d) === want)
    .sort((a, b) => b.localeCompare(a))
    .slice(0, limit);
}

/**
 * How far into the night an hour sits, given where the night starts.
 *
 * With a 4am cutoff, 7pm is position 15 and 1am is position 21 — so 1am is
 * correctly LATER than 11pm. Comparing raw clock hours would call 1am the
 * earliest hour of the night and silently drop the entire evening from the
 * running total.
 */
function nightPosition(hour: number, cutoffHour: number): number {
  const start = ((Math.trunc(cutoffHour) % 24) + 24) % 24;
  return (hour - start + 24) % 24;
}

/** The night's takings up to and including `upToHour`. */
export function totalToHour(
  rows: HourlyRow[],
  upToHour: number,
  cutoffHour: number = DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
): number {
  const limit = nightPosition(upToHour, cutoffHour);
  let total = 0;

  for (const r of rows ?? []) {
    const hour = Number(r?.hour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    if (nightPosition(hour, cutoffHour) > limit) continue;

    const net = Number(r?.net_sales);
    total += Number.isFinite(net) ? net : 0;
  }

  return round2(total);
}

export function compareToBaseline(
  actual: number,
  comparables: number[],
  minSample: number = DEFAULT_MIN_SAMPLE,
): Baseline {
  const sample = (comparables ?? []).filter((n) => Number.isFinite(n));
  const sampleSize = sample.length;

  if (sampleSize === 0) {
    return { average: null, sampleSize: 0, deltaPct: null, thin: true };
  }

  const average = round2(sample.reduce((s, n) => s + n, 0) / sampleSize);

  return {
    average,
    sampleSize,
    // Guarded on a positive average: dividing by zero yields Infinity, which
    // would render as an absurd percentage on a financial screen.
    deltaPct: average > 0 ? ((actual - average) / average) * 100 : null,
    thin: sampleSize < minSample,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/pos/baselines.test.ts`
Expected: PASS, 15 tests.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx eslint lib/pos/baselines.ts lib/pos/baselines.test.ts
git add lib/pos/baselines.ts lib/pos/baselines.test.ts
git commit -m "feat(sales): baselines against the last same-weekdays

Compared to THIS HOUR, not to whole nights: measuring a half-finished
Saturday against four complete ones reports a disaster every time. A thin
sample is flagged rather than hidden."
```

---

## Task 4: Server performance — including sales per hour worked

**Files:**
- Create: `lib/pos/server-performance.ts`
- Test: `lib/pos/server-performance.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  ```ts
  export type ServerRow = { business_date: string; server_name: string; net_sales: number; ticket_count: number; tips: number };
  export type ShiftHours = { employeeName: string; hours: number };
  export type ServerPerformance = {
    serverName: string; netSales: number; ticketCount: number;
    averageTicket: number | null; tips: number;
    hoursWorked: number | null; salesPerHour: number | null;
    sharePct: number | null; matchedEmployee: boolean;
  };
  export function buildServerPerformance(rows: ServerRow[], shifts?: ShiftHours[]): ServerPerformance[];
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/pos/server-performance.test.ts
import { describe, it, expect } from 'vitest';
import { buildServerPerformance, type ServerRow, type ShiftHours } from './server-performance';

const s = (name: string, net: number, tickets: number, tips = 0, date = '2026-08-29'): ServerRow =>
  ({ business_date: date, server_name: name, net_sales: net, ticket_count: tickets, tips });

describe('buildServerPerformance', () => {
  it('totals a server across the nights in the period', () => {
    const out = buildServerPerformance([
      s('Kayla Chen', 1000, 50, 100, '2026-08-29'),
      s('Kayla Chen', 500, 25, 50, '2026-08-30'),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].netSales).toBe(1500);
    expect(out[0].ticketCount).toBe(75);
    expect(out[0].tips).toBe(150);
  });

  it('ranks by takings, highest first', () => {
    const out = buildServerPerformance([s('Wes', 500, 20), s('Kayla', 1500, 60)]);
    expect(out.map((o) => o.serverName)).toEqual(['Kayla', 'Wes']);
  });

  it('computes each server as a share of the period', () => {
    const out = buildServerPerformance([s('Kayla', 750, 30), s('Wes', 250, 10)]);
    expect(out[0].sharePct).toBeCloseTo(75, 5);
    expect(out[1].sharePct).toBeCloseTo(25, 5);
  });

  it('divides sales by hours actually worked when payroll knows them', () => {
    // The metric nothing else gives them: both halves already live in Rail.
    const shifts: ShiftHours[] = [{ employeeName: 'Kayla Chen', hours: 8 }];
    const out = buildServerPerformance([s('Kayla Chen', 1600, 80)], shifts);
    expect(out[0].hoursWorked).toBe(8);
    expect(out[0].salesPerHour).toBeCloseTo(200, 5);
    expect(out[0].matchedEmployee).toBe(true);
  });

  it('keeps a server payroll has never heard of, with nulls', () => {
    // A bartender absent from the payroll list still sold the drinks. Dropping
    // them would make the column not add up to the night.
    const out = buildServerPerformance([s('Agency Temp', 400, 20)], [{ employeeName: 'Kayla Chen', hours: 8 }]);
    expect(out).toHaveLength(1);
    expect(out[0].matchedEmployee).toBe(false);
    expect(out[0].hoursWorked).toBeNull();
    expect(out[0].salesPerHour).toBeNull();
  });

  it('matches a payroll name case- and whitespace-insensitively', () => {
    const out = buildServerPerformance(
      [s('  KAYLA   CHEN ', 800, 40)],
      [{ employeeName: 'Kayla Chen', hours: 4 }],
    );
    expect(out[0].matchedEmployee).toBe(true);
    expect(out[0].salesPerHour).toBeCloseTo(200, 5);
  });

  it('sums a person who worked more than one shift in the period', () => {
    const out = buildServerPerformance(
      [s('Kayla Chen', 1000, 50)],
      [{ employeeName: 'Kayla Chen', hours: 5 }, { employeeName: 'Kayla Chen', hours: 5 }],
    );
    expect(out[0].hoursWorked).toBe(10);
    expect(out[0].salesPerHour).toBeCloseTo(100, 5);
  });

  it('reports null sales-per-hour for someone matched at zero hours', () => {
    // Dividing by zero hours yields Infinity, which is not a performance figure.
    const out = buildServerPerformance([s('Kayla', 500, 20)], [{ employeeName: 'Kayla', hours: 0 }]);
    expect(out[0].hoursWorked).toBe(0);
    expect(out[0].salesPerHour).toBeNull();
  });

  it('leaves hours null entirely when no shift data is supplied', () => {
    const out = buildServerPerformance([s('Kayla', 500, 20)]);
    expect(out[0].hoursWorked).toBeNull();
    expect(out[0].salesPerHour).toBeNull();
    expect(out[0].matchedEmployee).toBe(false);
  });

  it('reports a null average ticket for a server who rang up nothing', () => {
    const out = buildServerPerformance([s('Kayla', 0, 0)]);
    expect(out[0].averageTicket).toBeNull();
  });

  it('returns nothing for no rows', () => {
    expect(buildServerPerformance([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/pos/server-performance.test.ts`
Expected: FAIL — "Failed to resolve import ./server-performance".

- [ ] **Step 3: Write the implementation**

```ts
// lib/pos/server-performance.ts
/**
 * Trade by whoever rang it up.
 *
 * Pure — no database, no clock.
 *
 * SALES PER HOUR WORKED
 *
 * The figure that is genuinely hard to get anywhere else, and it falls out of
 * data Rail already holds for two different reasons: the POS knows who rang up
 * what, and payroll knows who was on. Neither half was collected for this.
 *
 * It is deliberately NOT presented as a league table. A bartender on the
 * service well and one on the front bar are not comparable, and a number that
 * invites that comparison without saying so does real damage to a room. The
 * shape here reports the figure; how it is framed is the screen's job.
 *
 * A server payroll has never heard of is KEPT, with nulls. They sold the
 * drinks, and dropping them would make the column stop adding up to the night.
 */

export type ServerRow = {
  business_date: string;
  server_name: string;
  net_sales: number;
  ticket_count: number;
  tips: number;
};

/** One person's hours over the same period, from `employee_shifts`. */
export type ShiftHours = { employeeName: string; hours: number };

export type ServerPerformance = {
  serverName: string;
  netSales: number;
  ticketCount: number;
  /** Null when they rang up nothing. */
  averageTicket: number | null;
  tips: number;
  /** Null when payroll has no matching person, or no shift data was given. */
  hoursWorked: number | null;
  /** Null when hours are unknown or zero. */
  salesPerHour: number | null;
  /** Share of the period's takings. Null when the period took nothing. */
  sharePct: number | null;
  /** Whether the POS name matched a payroll name at all. */
  matchedEmployee: boolean;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * The form two spellings of one person share.
 *
 * The POS name is typed by whoever set the till up and the payroll name by
 * whoever did the hiring; they agree on the person and disagree on the
 * spacing and the caps.
 */
function nameKey(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').toLowerCase()
    : '';
}

export function buildServerPerformance(
  rows: ServerRow[],
  shifts?: ShiftHours[],
): ServerPerformance[] {
  // Undefined means "payroll was not consulted", which is a different fact
  // from "payroll knows nobody" and must not silently become 0 hours.
  const haveShifts = Array.isArray(shifts);

  const hoursByName = new Map<string, number>();
  if (haveShifts) {
    for (const sh of shifts ?? []) {
      const key = nameKey(sh?.employeeName);
      if (!key) continue;
      // Summed: one person can work several shifts inside the period.
      hoursByName.set(key, (hoursByName.get(key) ?? 0) + num(sh?.hours));
    }
  }

  const byServer = new Map<string, { name: string; net: number; tickets: number; tips: number }>();

  for (const r of rows ?? []) {
    const key = nameKey(r?.server_name);
    if (!key) continue;

    const existing = byServer.get(key);
    if (existing) {
      existing.net += num(r?.net_sales);
      existing.tickets += num(r?.ticket_count);
      existing.tips += num(r?.tips);
      continue;
    }
    // First spelling seen is the one displayed — upper-casing every name
    // because one till shouts would be a worse report than the inconsistency.
    byServer.set(key, {
      name: String(r.server_name).trim().replace(/\s+/g, ' '),
      net: num(r?.net_sales),
      tickets: num(r?.ticket_count),
      tips: num(r?.tips),
    });
  }

  const totalNet = [...byServer.values()].reduce((s, v) => s + v.net, 0);

  const out: ServerPerformance[] = [];
  for (const [key, v] of byServer) {
    const matched = haveShifts && hoursByName.has(key);
    const hoursWorked = matched ? round2(hoursByName.get(key)!) : null;

    out.push({
      serverName: v.name,
      netSales: round2(v.net),
      ticketCount: v.tickets,
      averageTicket: v.tickets > 0 ? round2(v.net / v.tickets) : null,
      tips: round2(v.tips),
      hoursWorked,
      // Zero hours is not a performance figure — it is a division by zero.
      salesPerHour: hoursWorked !== null && hoursWorked > 0
        ? round2(v.net / hoursWorked)
        : null,
      sharePct: totalNet > 0 ? (v.net / totalNet) * 100 : null,
      matchedEmployee: matched,
    });
  }

  // By takings. The screen decides whether to present this as a ranking.
  return out.sort((a, b) => b.netSales - a.netSales);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/pos/server-performance.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx eslint lib/pos/server-performance.ts lib/pos/server-performance.test.ts
git add lib/pos/server-performance.ts lib/pos/server-performance.test.ts
git commit -m "feat(sales): per-server performance, including sales per hour worked

Crosses the POS's record of who rang up what with payroll's record of who
was on — both halves already in Rail, neither collected for this. A server
payroll has never heard of is kept with nulls; they sold the drinks."
```

---

## Task 5: Menu engineering

**Files:**
- Create: `lib/pos/menu-engineering.ts`
- Test: `lib/pos/menu-engineering.test.ts`

**Interfaces:**
- Consumes: `ItemMargin` from `@/lib/pos/sales-analytics` (existing; fields used: `matchKey`, `itemName`, `categoryName`, `unitsSold`, `revenue`, `margin`, `marginPct`, `costKnown`)
- Produces:
  ```ts
  export type MenuClass = 'star' | 'plowhorse' | 'puzzle' | 'dog' | 'unknown';
  export type MenuItem = { matchKey: string; itemName: string; categoryName: string | null; unitsSold: number; revenue: number; marginPct: number | null; menuClass: MenuClass; advice: string };
  export type MenuBoard = { items: MenuItem[]; medianUnits: number; medianMarginPct: number | null; uncosted: number };
  export function classifyMenu(items: ItemMargin[]): MenuBoard;
  export const MENU_CLASS_LABEL: Record<MenuClass, string>;
  ```

- [ ] **Step 1: Write the failing tests**

```ts
// lib/pos/menu-engineering.test.ts
import { describe, it, expect } from 'vitest';
import { classifyMenu, MENU_CLASS_LABEL } from './menu-engineering';
import type { ItemMargin } from './sales-analytics';

const item = (
  name: string, units: number, marginPct: number | null, costKnown = true,
): ItemMargin => ({
  matchKey: name.toLowerCase(),
  itemName: name,
  categoryName: null,
  unitsSold: units,
  revenue: units * 10,
  costPerDrink: costKnown ? 3 : null,
  cost: costKnown ? units * 3 : 0,
  margin: costKnown ? units * 7 : null,
  marginPct,
  costKnown,
});

describe('classifyMenu', () => {
  // Popularity and margin are each split at the MEDIAN of this bar's own menu,
  // not at an industry number: a dive bar and a cocktail bar sit in different
  // absolute ranges and both have stars.
  const menu = [
    item('House Vodka', 100, 80),  // popular, high margin  -> star
    item('Cheap Lager', 100, 20),  // popular, low margin   -> plowhorse
    item('Rare Whisky', 5, 80),    // unpopular, high margin-> puzzle
    item('Odd Liqueur', 5, 20),    // unpopular, low margin -> dog
  ];

  it('sorts the four quadrants', () => {
    const byName = new Map(classifyMenu(menu).items.map((i) => [i.itemName, i.menuClass]));
    expect(byName.get('House Vodka')).toBe('star');
    expect(byName.get('Cheap Lager')).toBe('plowhorse');
    expect(byName.get('Rare Whisky')).toBe('puzzle');
    expect(byName.get('Odd Liqueur')).toBe('dog');
  });

  it('splits at this bar\'s own medians, not an industry benchmark', () => {
    // Every item here would be "low margin" against a generic 70% target, yet
    // this menu still has stars — which is the entire point of the technique.
    const thin = [
      item('A', 100, 12), item('B', 100, 4), item('C', 5, 12), item('D', 5, 4),
    ];
    const byName = new Map(classifyMenu(thin).items.map((i) => [i.itemName, i.menuClass]));
    expect(byName.get('A')).toBe('star');
    expect(byName.get('D')).toBe('dog');
  });

  it('refuses to classify an item whose cost is unknown', () => {
    // Guessing here would tell an operator to delist a drink on no evidence.
    const out = classifyMenu([...menu, item('Mystery', 50, null, false)]);
    const mystery = out.items.find((i) => i.itemName === 'Mystery')!;
    expect(mystery.menuClass).toBe('unknown');
    expect(out.uncosted).toBe(1);
  });

  it('keeps uncosted items out of the median entirely', () => {
    // Letting them count as zero margin would drag the split down and
    // mis-sort every real item on the menu.
    const withUncosted = classifyMenu([...menu, item('Mystery', 100, null, false)]);
    expect(withUncosted.medianMarginPct).toBe(classifyMenu(menu).medianMarginPct);
  });

  it('gives each class advice an operator can act on', () => {
    const out = classifyMenu(menu);
    for (const i of out.items) {
      expect(i.advice.length).toBeGreaterThan(0);
    }
    expect(new Set(out.items.map((i) => i.advice)).size).toBe(4);
  });

  it('reports the medians it split on, so the screen can show its working', () => {
    const out = classifyMenu(menu);
    expect(out.medianUnits).toBeGreaterThan(0);
    expect(out.medianMarginPct).not.toBeNull();
  });

  it('handles an empty menu without dividing by zero', () => {
    const out = classifyMenu([]);
    expect(out.items).toEqual([]);
    expect(out.medianMarginPct).toBeNull();
    expect(out.uncosted).toBe(0);
  });

  it('classifies nothing when no item has a known cost', () => {
    const out = classifyMenu([item('A', 10, null, false), item('B', 20, null, false)]);
    expect(out.items.every((i) => i.menuClass === 'unknown')).toBe(true);
    expect(out.medianMarginPct).toBeNull();
  });

  it('puts an item exactly on the median on the favourable side', () => {
    // A boundary item should not be called a dog on a rounding accident.
    const out = classifyMenu([item('A', 10, 50), item('B', 10, 50)]);
    expect(out.items.every((i) => i.menuClass === 'star')).toBe(true);
  });

  it('labels every class', () => {
    for (const c of ['star', 'plowhorse', 'puzzle', 'dog', 'unknown'] as const) {
      expect(MENU_CLASS_LABEL[c].length).toBeGreaterThan(0);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/pos/menu-engineering.test.ts`
Expected: FAIL — "Failed to resolve import ./menu-engineering".

- [ ] **Step 3: Write the implementation**

```ts
// lib/pos/menu-engineering.ts
/**
 * Which drinks earn their place on the menu.
 *
 * Pure — no database, no clock.
 *
 * The classic four quadrants, popularity against margin:
 *
 *   star       popular, profitable    — protect it, never discount it
 *   plowhorse  popular, thin          — it brings people in; find cost, not price
 *   puzzle     profitable, ignored    — worth promoting or moving up the list
 *   dog        neither                — the candidate to delist
 *
 * WHY THE SPLIT IS THE MEDIAN AND NOT A BENCHMARK
 *
 * A dive bar and a cocktail bar sit in completely different absolute margin
 * ranges, and both have stars. Splitting at this bar's OWN median asks the only
 * useful question — "compared with the rest of what you sell" — and keeps the
 * output meaningful for a menu whose every item would fail an industry target.
 *
 * An item with no cost price is 'unknown', never a dog. Guessing would tell an
 * operator to delist a drink on no evidence, and uncosted items are excluded
 * from the medians entirely so they cannot drag the split and mis-sort the
 * items that ARE costed.
 */

import type { ItemMargin } from './sales-analytics';

export type MenuClass = 'star' | 'plowhorse' | 'puzzle' | 'dog' | 'unknown';

export const MENU_CLASS_LABEL: Record<MenuClass, string> = {
  star: 'Star',
  plowhorse: 'Plowhorse',
  puzzle: 'Puzzle',
  dog: 'Dog',
  unknown: 'Not costed',
};

const ADVICE: Record<MenuClass, string> = {
  star: 'Sells well and earns well. Protect it — never put this one on discount.',
  plowhorse: 'Popular but thin. Work on what it costs you before you touch the price.',
  puzzle: 'Earns well but nobody orders it. Move it up the list or push it at the bar.',
  dog: 'Neither popular nor profitable. The first candidate to come off the menu.',
  unknown: 'No cost price recorded, so its margin is unknown. Price it to classify it.',
};

export type MenuItem = {
  matchKey: string;
  itemName: string;
  categoryName: string | null;
  unitsSold: number;
  revenue: number;
  marginPct: number | null;
  menuClass: MenuClass;
  advice: string;
};

export type MenuBoard = {
  items: MenuItem[];
  /** The popularity split actually used. */
  medianUnits: number;
  /** The margin split actually used. Null when nothing was costed. */
  medianMarginPct: number | null;
  /** How many items could not be classified for want of a cost price. */
  uncosted: number;
};

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

export function classifyMenu(items: ItemMargin[]): MenuBoard {
  const all = items ?? [];

  // Only costed items define the splits. An uncosted item counted as zero
  // margin would drag the median down and mis-sort everything above it.
  const costed = all.filter((i) => i.costKnown && i.marginPct !== null);

  const medianUnits = median(costed.map((i) => i.unitsSold)) ?? 0;
  const medianMarginPct = median(costed.map((i) => i.marginPct as number));

  const classified: MenuItem[] = all.map((i) => {
    const known = i.costKnown && i.marginPct !== null && medianMarginPct !== null;

    // Ties go to the favourable side: an item sitting exactly on the median
    // should not be called a dog on a rounding accident.
    const popular = i.unitsSold >= medianUnits;
    const profitable = known && (i.marginPct as number) >= medianMarginPct;

    const menuClass: MenuClass = !known
      ? 'unknown'
      : popular && profitable ? 'star'
      : popular ? 'plowhorse'
      : profitable ? 'puzzle'
      : 'dog';

    return {
      matchKey: i.matchKey,
      itemName: i.itemName,
      categoryName: i.categoryName,
      unitsSold: i.unitsSold,
      revenue: i.revenue,
      marginPct: i.marginPct,
      menuClass,
      advice: ADVICE[menuClass],
    };
  });

  return {
    items: classified,
    medianUnits,
    medianMarginPct,
    uncosted: classified.filter((i) => i.menuClass === 'unknown').length,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/pos/menu-engineering.test.ts`
Expected: PASS, 10 tests.

- [ ] **Step 5: Typecheck, lint, run the whole suite, commit**

```bash
npx tsc --noEmit
npx eslint lib/pos/menu-engineering.ts lib/pos/menu-engineering.test.ts
npm test
git add lib/pos/menu-engineering.ts lib/pos/menu-engineering.test.ts
git commit -m "feat(sales): menu engineering quadrants

Split at this bar's own medians, not an industry benchmark: a dive bar and
a cocktail bar sit in different absolute ranges and both have stars. An
uncosted item is 'unknown', never a dog, and is excluded from the medians
so it cannot drag the split."
```

---

## Self-review notes

**Spec coverage.** `daypart.ts` → Task 1. `tickets.ts` → Task 2. `baselines.ts` → Task 3. `server-performance.ts` → Task 4. `menu-engineering.ts` → Task 5. Every module named in the spec's Stage B table has a task.

**The spec's load-bearing testing cases, and where they live:**
- "the half-finished Saturday" (compare to-this-hour, not to complete nights) → Task 3, `totalToHour`
- the 1am ticket ordering later than 11pm → Task 1 `orderNightHours`, Task 3 `nightPosition`
- "the unmatched server" → Task 4
- "not enough history yet" as a first-class state → Task 3, `thin`

**Deliberately deferred to Stage C, per the spec:** `SalesCapabilities`, the "as of" staleness line from `sync-health.ts`, and every rendering decision. This stage adds no UI and no database reads.

**Type consistency check:** `HourlyRow` is declared independently in `daypart.ts` and `baselines.ts` with identical fields. That duplication is deliberate — the two modules are otherwise unrelated, and a shared barrel would couple them for the sake of a five-field record. Task 3's brief says explicitly not to import it from Task 1. `ServerRow` in Task 4 matches Stage A's `pos_server_sales` columns. `ItemMargin` is imported from the existing `sales-analytics.ts`, not redeclared.

**Known gap:** nothing here reads a database, so none of it is exercised against real rows until Stage C. The row shapes are pinned to Stage A's migration, which is written but not yet applied.
