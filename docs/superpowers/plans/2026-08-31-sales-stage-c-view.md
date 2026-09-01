# Sales Stage C — View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One Sales screen organised by period — `/app/sales?view=tonight|day|week|month` — that answers the live questions (what is tonight worth, against what it usually is) and the retrospective ones (mix, margin, what to cut), absorbing the Categories and Margins tabs.

**Architecture:** The period is the organising idea. Stage B's five pure modules already compute every figure; this stage adds the period arithmetic (pure, tested), one server loader that fetches the rows each view needs, and thin presentational components. Decision logic that could be got wrong — which hours are "not yet traded", how a view maps to a date range, what the band compares against — lives in tested pure functions in `lib/`, never inside a component. This matches the repo's toolchain: vitest covers `lib/`, and there is no component-test harness.

**Tech Stack:** Next.js 16 (App Router, server components), TypeScript, Base UI (`@base-ui/react`), Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-08-30-sales-system-design.md` (see "Stage C — View")

## Global Constraints

- **Pure logic is pure.** No database, no `Date.now()`, no I/O in `lib/`. "Today" and "now" are always parameters. Established by `lib/pos/sales-analytics.ts` and every Stage B module.
- **The business-day cutoff has one owner:** `cutoffHourFromSettings()` in `lib/business-date.ts`, reading `bar_settings.business_day_cutoff_hour`, default `4`, valid 0–12. Never write a literal `4`.
- **`hour` is the real clock hour 0–23**, paired with the business date it belongs to. Display ordering comes from `orderNightHours(cutoffHour)`, never from a shifted stored value.
- **Money is rounded to 2 decimals** via `Math.round(n * 100) / 100`, matching `round2` in `sales-analytics.ts`.
- **Hours not yet traded are empty, not zero.** `DaypartHour.traded` already carries this. A zero reads as a dead hour rather than an hour that has not happened.
- **Never extrapolate a partial night to a projected total.** Compare to-this-hour against the baseline's same-hour figure instead (`totalToHour`).
- **`createAdminClient()` bypasses RLS.** Every query added here MUST filter `.eq('organization_id', org.id)`. `npm run audit:scope` enforces it and must stay at 0 unjustified.
- **`components/ui` is Base UI, not Radix.** No `asChild`; use `render` and controlled dialogs.
- **Null is not zero.** `averageTicket`, `salesPerHour`, `marginPct` and `Baseline.average` are null when unknowable; render `—`, never `$0`.

## Prerequisite (blocking, not a task)

The migration `supabase/migrations/20260831000000_add_pos_size_variants.sql` is **not yet applied**. `getSalesData` selects `base_match_key` / `size_token` and queries `pos_size_tokens`; until that SQL runs, every Sales screen errors at the query. Apply it before verifying any task here against a real database. Code and vitest are unaffected.

## Input row shapes (produced by Stage A, consumed here)

| table | columns this stage reads |
|---|---|
| `pos_hourly_sales` | `business_date`, `hour`, `net_sales`, `ticket_count`, `tips` |
| `pos_server_sales` | `business_date`, `server_name`, `employee_id`, `net_sales`, `ticket_count`, `tips` |
| `pos_item_sales` | `match_key`, `base_match_key`, `size_token`, `item_name`, `category_name`, `qty_sold`, `net_sales`, `sale_date` |

## File Structure

| file | responsibility |
|---|---|
| `lib/sales-view.ts` + `.test.ts` | the period: `SalesView`, resolution from a query string, default and shifted ranges |
| `lib/pos/live-night.ts` + `.test.ts` | the Tonight band — headline figures paired with their baselines, and the "as of" hour |
| `app/(app)/app/sales/actions.ts` | one loader per view; the only file here that touches Supabase |
| `app/(app)/app/sales/page.tsx` | dispatches on `view`, renders one of the two view components |
| `app/(app)/app/sales/_components/view-switcher.tsx` | the four period links + prev/next arrows |
| `app/(app)/app/sales/_components/live-band.tsx` | net / tickets / average ticket, each against baseline |
| `app/(app)/app/sales/_components/hourly-curve.tsx` | the daypart bars, untraded hours blank |
| `app/(app)/app/sales/_components/server-table.tsx` | by-server rows |
| `app/(app)/app/sales/_components/menu-quadrant.tsx` | the menu-engineering board |
| `app/(app)/app/sales/categories/page.tsx` | redirect to `?view=week` |
| `app/(app)/app/sales/margins/page.tsx` | redirect to `?view=week` |
| `app/(app)/app/_components/nav-config.ts` | drop the Categories and Margins tabs |

Tasks 1 and 2 are pure and independent of each other. Task 3 consumes both. Tasks 4–6 build on Task 3.

---

## Task 1: The period — `SalesView` and its ranges

`lib/date-range.ts` already has `resolvePayrollView`, `monthRange`, `defaultPeriod` and `shiftPeriod` for Payroll's `'day' | 'week' | 'month'`. Sales needs the same arithmetic plus `'tonight'`. Rather than widening `PayrollView` — which would let a caller pass `'tonight'` to Payroll, where it means nothing — this adds a Sales-specific module that reuses `monthRange` and `addDays`.

**Files:**
- Create: `lib/sales-view.ts`
- Test: `lib/sales-view.test.ts`

**Interfaces:**
- Consumes: `addDays(date: string, days: number): string`, `monthRange(iso: string): { start: string; end: string }`, `isIsoDate(value: unknown): value is string` — all from `@/lib/date-range`.
- Produces:
  - `type SalesView = 'tonight' | 'day' | 'week' | 'month'`
  - `type SalesPeriod = { view: SalesView; start: string; end: string; label: string }`
  - `resolveSalesView(raw: unknown): SalesView`
  - `defaultSalesPeriod(view: SalesView, today: string): { start: string; end: string }`
  - `shiftSalesPeriod(view: SalesView, start: string, end: string, dir: 'prev' | 'next'): { start: string; end: string }`
  - `resolveSalesPeriod(raw: unknown, today: string, from?: unknown, to?: unknown): SalesPeriod`
  - `isLivePeriod(period: SalesPeriod, today: string): boolean`

- [ ] **Step 1: Write the failing tests**

Create `lib/sales-view.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  resolveSalesView,
  defaultSalesPeriod,
  shiftSalesPeriod,
  resolveSalesPeriod,
  isLivePeriod,
} from './sales-view';

/**
 * The period is the organising idea of the Sales screen, so getting it wrong
 * shows the operator a different night than the one they asked for.
 */

describe('resolveSalesView', () => {
  it('defaults to tonight', () => {
    // The screen a bar opens mid-shift is the one about right now.
    expect(resolveSalesView(undefined)).toBe('tonight');
    expect(resolveSalesView(null)).toBe('tonight');
  });

  it('accepts each known view', () => {
    expect(resolveSalesView('tonight')).toBe('tonight');
    expect(resolveSalesView('day')).toBe('day');
    expect(resolveSalesView('week')).toBe('week');
    expect(resolveSalesView('month')).toBe('month');
  });

  it('falls back rather than erroring on junk', () => {
    // ?view= comes off a URL, where a typo or a stale bookmark is ordinary.
    expect(resolveSalesView('yesteryear')).toBe('tonight');
    expect(resolveSalesView(7)).toBe('tonight');
  });
});

describe('defaultSalesPeriod', () => {
  // 2026-08-31 is a Monday.
  it('tonight and day are a single night', () => {
    expect(defaultSalesPeriod('tonight', '2026-08-31')).toEqual({
      start: '2026-08-31', end: '2026-08-31',
    });
    expect(defaultSalesPeriod('day', '2026-08-31')).toEqual({
      start: '2026-08-31', end: '2026-08-31',
    });
  });

  it('the week is Monday to Sunday', () => {
    // Matches defaultPeriod() in date-range.ts: a bar's Sunday trade is the
    // tail of the week just worked, not the head of the next.
    expect(defaultSalesPeriod('week', '2026-08-31')).toEqual({
      start: '2026-08-31', end: '2026-09-06',
    });
  });

  it('puts a Sunday in the week that preceded it', () => {
    // 2026-09-06 is a Sunday.
    expect(defaultSalesPeriod('week', '2026-09-06')).toEqual({
      start: '2026-08-31', end: '2026-09-06',
    });
  });

  it('the month is a calendar month, not a rolling 30 days', () => {
    expect(defaultSalesPeriod('month', '2026-08-31')).toEqual({
      start: '2026-08-01', end: '2026-08-31',
    });
  });
});

describe('shiftSalesPeriod', () => {
  it('steps a single night for tonight and day', () => {
    expect(shiftSalesPeriod('day', '2026-08-31', '2026-08-31', 'prev'))
      .toEqual({ start: '2026-08-30', end: '2026-08-30' });
    expect(shiftSalesPeriod('tonight', '2026-08-31', '2026-08-31', 'next'))
      .toEqual({ start: '2026-09-01', end: '2026-09-01' });
  });

  it('steps seven days for a week', () => {
    expect(shiftSalesPeriod('week', '2026-08-31', '2026-09-06', 'prev'))
      .toEqual({ start: '2026-08-24', end: '2026-08-30' });
  });

  it('steps whole months without skipping February', () => {
    // Anchored on the 1st: month arithmetic from the 31st has no 31st to land
    // on in February and silently skips it.
    expect(shiftSalesPeriod('month', '2026-01-01', '2026-01-31', 'next'))
      .toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });
});

describe('resolveSalesPeriod', () => {
  it('builds the default period for the view', () => {
    const p = resolveSalesPeriod('week', '2026-08-31');
    expect(p.view).toBe('week');
    expect(p.start).toBe('2026-08-31');
    expect(p.end).toBe('2026-09-06');
  });

  it('accepts explicit bounds from the URL', () => {
    const p = resolveSalesPeriod('month', '2026-08-31', '2026-07-01', '2026-07-31');
    expect(p.start).toBe('2026-07-01');
    expect(p.end).toBe('2026-07-31');
  });

  it('accepts the bounds whichever way round they were given', () => {
    const p = resolveSalesPeriod('week', '2026-08-31', '2026-09-06', '2026-08-31');
    expect(p.start).toBe('2026-08-31');
    expect(p.end).toBe('2026-09-06');
  });

  it('ignores half-given or malformed bounds', () => {
    // One bound cannot describe a range, and a bad one must not silently
    // become today.
    expect(resolveSalesPeriod('week', '2026-08-31', '2026-07-01', undefined).start)
      .toBe('2026-08-31');
    expect(resolveSalesPeriod('week', '2026-08-31', 'garbage', '2026-07-31').start)
      .toBe('2026-08-31');
  });

  it('labels tonight as Tonight and a past night by its date', () => {
    expect(resolveSalesPeriod('tonight', '2026-08-31').label).toBe('Tonight');
    expect(resolveSalesPeriod('day', '2026-08-31', '2026-08-29', '2026-08-29').label)
      .toBe('2026-08-29');
  });
});

describe('isLivePeriod', () => {
  it('is live when the period contains the current business date', () => {
    // This is what gates the "as of" line and the to-this-hour baseline.
    expect(isLivePeriod(resolveSalesPeriod('tonight', '2026-08-31'), '2026-08-31')).toBe(true);
    expect(isLivePeriod(resolveSalesPeriod('week', '2026-08-31'), '2026-08-31')).toBe(true);
  });

  it('is not live for a period that has closed', () => {
    expect(isLivePeriod(resolveSalesPeriod('day', '2026-08-31', '2026-08-29', '2026-08-29'), '2026-08-31'))
      .toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/sales-view.test.ts`
Expected: FAIL — `Failed to resolve import "./sales-view"`.

- [ ] **Step 3: Write the implementation**

Create `lib/sales-view.ts`:

```ts
/**
 * The period a Sales screen is about.
 *
 * Pure — no database, no clock. "Today" is always a parameter.
 *
 * Payroll has the same arithmetic for 'day' | 'week' | 'month' in
 * lib/date-range.ts. This is deliberately a separate type rather than a widened
 * PayrollView: 'tonight' means nothing to Payroll, and letting it be passed
 * there would compile and then behave as a plain day.
 */
import { addDays, isIsoDate, monthRange } from './date-range';

export type SalesView = 'tonight' | 'day' | 'week' | 'month';

export type SalesPeriod = {
  view: SalesView;
  /** Inclusive business date. */
  start: string;
  /** Inclusive business date. */
  end: string;
  /** What the switcher shows. */
  label: string;
};

const SALES_VIEWS: SalesView[] = ['tonight', 'day', 'week', 'month'];

/**
 * The view a query string names, defaulting to tonight.
 *
 * Anything unrecognised falls back rather than erroring — `?view=` comes off a
 * URL, where a typo or a stale bookmark is ordinary, and the screen a bar opens
 * mid-shift is the one about right now.
 */
export function resolveSalesView(raw: unknown): SalesView {
  return SALES_VIEWS.includes(raw as SalesView) ? (raw as SalesView) : 'tonight';
}

/**
 * The default range for a view, given today's business date.
 *
 * The week is Monday–Sunday, matching `defaultPeriod()` in date-range.ts:
 * a bar's Sunday trade is the tail of the week just worked, not the head of
 * the next. The month is a calendar month, so it ties out against the figures
 * the bar's accountant already has.
 */
export function defaultSalesPeriod(
  view: SalesView,
  today: string,
): { start: string; end: string } {
  if (view === 'tonight' || view === 'day') return { start: today, end: today };
  if (view === 'month') return monthRange(today);

  const [y, m, d] = today.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const start = addDays(today, -(day === 0 ? 6 : day - 1));
  return { start, end: addDays(start, 6) };
}

/**
 * The next or previous period of the same kind.
 *
 * The month case rebuilds from the month number rather than adding days:
 * stepping from the 31st has no 31st to land on in February and would skip it.
 */
export function shiftSalesPeriod(
  view: SalesView,
  start: string,
  end: string,
  dir: 'prev' | 'next',
): { start: string; end: string } {
  const delta = dir === 'prev' ? -1 : 1;

  if (view === 'month') {
    const [y, m] = start.split('-').map(Number);
    const anchor = new Date(Date.UTC(y, m - 1 + delta, 1)).toISOString().slice(0, 10);
    return monthRange(anchor);
  }

  const step = view === 'week' ? delta * 7 : delta;
  return { start: addDays(start, step), end: addDays(end, step) };
}

/** How the switcher names a period. */
function labelFor(view: SalesView, start: string, end: string, today: string): string {
  if (view === 'tonight' && start === today) return 'Tonight';
  if (view === 'tonight' || view === 'day') return start;
  if (view === 'month') return start.slice(0, 7);
  return `${start} → ${end}`;
}

/**
 * The period a request is asking for.
 *
 * Explicit bounds win when BOTH are valid ISO dates — one bound cannot describe
 * a range, and a malformed one must fall back rather than silently becoming
 * today, which would show the operator a different period than the URL says.
 */
export function resolveSalesPeriod(
  raw: unknown,
  today: string,
  from?: unknown,
  to?: unknown,
): SalesPeriod {
  const view = resolveSalesView(raw);

  let { start, end } = defaultSalesPeriod(view, today);
  if (isIsoDate(from) && isIsoDate(to)) {
    // Accept the range whichever way round it was given, as resolveDateRange does.
    [start, end] = from <= to ? [from, to] : [to, from];
  }

  return { view, start, end, label: labelFor(view, start, end, today) };
}

/**
 * Whether the period is still being traded.
 *
 * Gates the "as of" line and the to-this-hour baseline: a closed night is
 * compared whole, a live one only as far as it has got.
 */
export function isLivePeriod(period: SalesPeriod, today: string): boolean {
  return period.start <= today && today <= period.end;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/sales-view.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx eslint lib/sales-view.ts lib/sales-view.test.ts
git add lib/sales-view.ts lib/sales-view.test.ts
git commit -m "feat(sales): the period a Sales screen is about"
```

---

## Task 2: The live band — figures paired with their baselines

The Tonight view's headline is three numbers, each meaningless without what it usually is. Stage B has `compareToBaseline`, `sameWeekdayNights` and `totalToHour`; this composes them into the shape the band renders, and owns the one rule that is easy to get wrong: a live night is compared **to the same hour** of its comparable nights, never whole.

**Files:**
- Create: `lib/pos/live-night.ts`
- Test: `lib/pos/live-night.test.ts`

**Interfaces:**
- Consumes, from `./baselines`: `sameWeekdayNights(target: string, all: string[], limit?: number): string[]`, `totalToHour(rows: HourlyRow[], upToHour: number, cutoffHour?: number): number`, `compareToBaseline(actual: number, comparables: number[], minSample?: number): Baseline`, `type Baseline`, `DEFAULT_MIN_SAMPLE`. From `./daypart`: `type HourlyRow`. From `@/lib/business-date`: `DEFAULT_BUSINESS_DAY_CUTOFF_HOUR`.
- Produces:
  - `type LiveFigure = { value: number | null; baseline: Baseline }`
  - `type LiveNight = { netSales: LiveFigure; ticketCount: LiveFigure; averageTicket: LiveFigure; asOfHour: number | null; comparedToHour: boolean; comparableNights: string[] }`
  - `buildLiveNight(input: LiveNightInput): LiveNight`
  - `type LiveNightInput = { targetDate: string; rows: HourlyRow[]; history: HourlyRow[]; cutoffHour?: number; asOfHour?: number | null; minSample?: number }`

- [ ] **Step 1: Write the failing tests**

Create `lib/pos/live-night.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildLiveNight } from './live-night';
import type { HourlyRow } from './daypart';

/**
 * Tonight's headline, against what tonight usually is.
 *
 * The load-bearing rule: a night still being traded is compared only as far as
 * it has got. Comparing a half-finished Saturday against four whole Saturdays
 * reports a catastrophe every week at 9pm.
 */

const hr = (business_date: string, hour: number, net: number, tickets = 10): HourlyRow =>
  ({ business_date, hour, net_sales: net, ticket_count: tickets, tips: 0 });

// Four previous Saturdays, each taking 1000 across two hours (20:00 and 22:00).
const history: HourlyRow[] = ['2026-08-01', '2026-08-08', '2026-08-15', '2026-08-22']
  .flatMap((d) => [hr(d, 20, 400), hr(d, 22, 600)]);

// 2026-08-29 is a Saturday.
const TARGET = '2026-08-29';

describe('buildLiveNight', () => {
  it('compares a closed night whole', () => {
    const out = buildLiveNight({
      targetDate: TARGET,
      rows: [hr(TARGET, 20, 500), hr(TARGET, 22, 700)],
      history,
      asOfHour: null,
    });

    expect(out.comparedToHour).toBe(false);
    expect(out.netSales.value).toBe(1200);
    expect(out.netSales.baseline.average).toBe(1000);
    expect(out.netSales.baseline.sampleSize).toBe(4);
    expect(out.netSales.baseline.deltaPct).toBeCloseTo(20, 4);
  });

  it('compares a live night only as far as it has got', () => {
    // 9pm on a Saturday: tonight has 500, and the comparable Saturdays had 400
    // by 9pm — not the 1000 they finished on.
    const out = buildLiveNight({
      targetDate: TARGET,
      rows: [hr(TARGET, 20, 500)],
      history,
      asOfHour: 21,
    });

    expect(out.comparedToHour).toBe(true);
    expect(out.netSales.value).toBe(500);
    expect(out.netSales.baseline.average).toBe(400);
    expect(out.netSales.baseline.deltaPct).toBeCloseTo(25, 4);
  });

  it('never reports a half night as a collapse', () => {
    // The regression this exists to prevent: whole-night comparison at 9pm.
    const live = buildLiveNight({
      targetDate: TARGET, rows: [hr(TARGET, 20, 400)], history, asOfHour: 21,
    });
    expect(live.netSales.baseline.deltaPct).toBe(0);
  });

  it('orders the night by the bar clock, not the wall clock', () => {
    // With a 4am cutoff, 1am is LATER than 11pm. A raw hour comparison would
    // call 1am the earliest hour and drop the whole evening from the total.
    const lateHistory: HourlyRow[] = ['2026-08-01', '2026-08-08']
      .flatMap((d) => [hr(d, 23, 300), hr(d, 1, 200)]);

    const out = buildLiveNight({
      targetDate: TARGET,
      rows: [hr(TARGET, 23, 300), hr(TARGET, 1, 100)],
      history: lateHistory,
      asOfHour: 1,
      cutoffHour: 4,
    });

    expect(out.netSales.value).toBe(400);
    expect(out.netSales.baseline.average).toBe(500);
  });

  it('reports the average ticket and its baseline', () => {
    const out = buildLiveNight({
      targetDate: TARGET,
      rows: [hr(TARGET, 20, 500, 20)],
      history,
      asOfHour: null,
    });
    expect(out.averageTicket.value).toBe(25);
  });

  it('is null, not zero, for an average ticket nobody rang up', () => {
    // "$0 average" reads as a disaster instead of as no data.
    const out = buildLiveNight({
      targetDate: TARGET, rows: [], history, asOfHour: null,
    });
    expect(out.averageTicket.value).toBeNull();
    expect(out.netSales.value).toBe(0);
    expect(out.ticketCount.value).toBe(0);
  });

  it('flags a thin sample rather than hiding it', () => {
    const out = buildLiveNight({
      targetDate: TARGET,
      rows: [hr(TARGET, 20, 500)],
      history: [hr('2026-08-22', 20, 400)],
      asOfHour: null,
    });
    expect(out.netSales.baseline.sampleSize).toBe(1);
    expect(out.netSales.baseline.thin).toBe(true);
  });

  it('reports no baseline at all on a bar with no history', () => {
    const out = buildLiveNight({
      targetDate: TARGET, rows: [hr(TARGET, 20, 500)], history: [], asOfHour: null,
    });
    expect(out.netSales.baseline.average).toBeNull();
    expect(out.netSales.baseline.deltaPct).toBeNull();
    expect(out.comparableNights).toEqual([]);
  });

  it('only compares against the same weekday', () => {
    // A Saturday against a Tuesday is not a comparison.
    const mixed = [...history, hr('2026-08-25', 20, 50), hr('2026-08-26', 20, 50)];
    const out = buildLiveNight({
      targetDate: TARGET, rows: [hr(TARGET, 20, 500)], history: mixed, asOfHour: null,
    });
    expect(out.comparableNights).toEqual(
      ['2026-08-22', '2026-08-15', '2026-08-08', '2026-08-01'],
    );
  });

  it('never counts the target night as its own baseline', () => {
    const withTarget = [...history, hr(TARGET, 20, 500)];
    const out = buildLiveNight({
      targetDate: TARGET, rows: [hr(TARGET, 20, 500)], history: withTarget, asOfHour: null,
    });
    expect(out.comparableNights).not.toContain(TARGET);
    expect(out.netSales.baseline.sampleSize).toBe(4);
  });

  it('carries the as-of hour through for the UI to state', () => {
    const out = buildLiveNight({
      targetDate: TARGET, rows: [hr(TARGET, 20, 500)], history, asOfHour: 21,
    });
    expect(out.asOfHour).toBe(21);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run lib/pos/live-night.test.ts`
Expected: FAIL — `Failed to resolve import "./live-night"`.

- [ ] **Step 3: Write the implementation**

Create `lib/pos/live-night.ts`:

```ts
/**
 * Tonight's headline, against what tonight usually is.
 *
 * Pure — no database, no clock.
 *
 * ── THE RULE THIS FILE EXISTS TO HOLD ────────────────────────────────────────
 *
 * A night still being traded is compared ONLY AS FAR AS IT HAS GOT. Comparing a
 * half-finished Saturday against four whole Saturdays reports a catastrophe
 * every week at 9pm, and an operator who is told the sky is falling every
 * Saturday stops reading the screen.
 *
 * The spec is explicit that a partial night is never extrapolated to a
 * projected total either. Both sides of the comparison are truncated instead,
 * which is an honest number rather than a guessed one.
 */
import { DEFAULT_BUSINESS_DAY_CUTOFF_HOUR } from '@/lib/business-date';
import type { HourlyRow } from './daypart';
import {
  sameWeekdayNights,
  totalToHour,
  compareToBaseline,
  DEFAULT_MIN_SAMPLE,
  type Baseline,
} from './baselines';

export type LiveFigure = {
  /** Null when the figure is not computable — never 0 standing in for unknown. */
  value: number | null;
  baseline: Baseline;
};

export type LiveNight = {
  netSales: LiveFigure;
  ticketCount: LiveFigure;
  averageTicket: LiveFigure;
  /** The hour the night has reached, or null when it has closed. */
  asOfHour: number | null;
  /** True when both sides were truncated to `asOfHour`. */
  comparedToHour: boolean;
  /** The nights the baseline was built from, most recent first. */
  comparableNights: string[];
};

export type LiveNightInput = {
  targetDate: string;
  /** Hourly rows for the target night. */
  rows: HourlyRow[];
  /** Hourly rows for every other night available, any date. */
  history: HourlyRow[];
  cutoffHour?: number;
  /** The hour reached, or null for a closed night compared whole. */
  asOfHour?: number | null;
  minSample?: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** Net and tickets for a set of rows, truncated to an hour when one is given. */
function totals(
  rows: HourlyRow[],
  upToHour: number | null,
  cutoffHour: number,
): { net: number; tickets: number } {
  if (upToHour === null) {
    let net = 0;
    let tickets = 0;
    for (const r of rows ?? []) {
      net += num(r?.net_sales);
      tickets += num(r?.ticket_count);
    }
    return { net: round2(net), tickets };
  }

  // totalToHour already owns the bar-clock ordering, so the evening is not
  // dropped when the night has run past midnight.
  const net = totalToHour(rows, upToHour, cutoffHour);

  // Tickets need the same truncation; totalToHour only answers for money, so
  // the hour filter is repeated here rather than summing the whole night and
  // quietly comparing a full ticket count against a partial one.
  const limit = nightPositionLocal(upToHour, cutoffHour);
  let tickets = 0;
  for (const r of rows ?? []) {
    const hour = Number(r?.hour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) continue;
    if (nightPositionLocal(hour, cutoffHour) > limit) continue;
    tickets += num(r?.ticket_count);
  }

  return { net, tickets };
}

/**
 * Local copy of baselines.nightPosition.
 *
 * Imported rather than duplicated would be better, and it IS exported there —
 * but re-exporting it through this module would give the codebase two names for
 * one idea. Kept as a thin private alias instead.
 */
function nightPositionLocal(hour: number, cutoffHour: number): number {
  const start = ((Math.trunc(cutoffHour) % 24) + 24) % 24;
  return (hour - start + 24) % 24;
}

/** Average ticket, or null when nobody rang up. */
function average(net: number, tickets: number): number | null {
  return tickets > 0 ? round2(net / tickets) : null;
}

export function buildLiveNight(input: LiveNightInput): LiveNight {
  const {
    targetDate,
    rows,
    history,
    cutoffHour = DEFAULT_BUSINESS_DAY_CUTOFF_HOUR,
    asOfHour = null,
    minSample = DEFAULT_MIN_SAMPLE,
  } = input;

  // Every night the history knows about, so the comparables can be picked.
  const nights = [...new Set((history ?? []).map((r) => String(r?.business_date)))]
    .filter((d) => d && d !== targetDate);

  const comparableNights = sameWeekdayNights(targetDate, nights, minSample);

  const byNight = new Map<string, HourlyRow[]>();
  for (const r of history ?? []) {
    const d = String(r?.business_date);
    if (!byNight.has(d)) byNight.set(d, []);
    byNight.get(d)!.push(r);
  }

  const mine = totals(rows ?? [], asOfHour, cutoffHour);
  const theirs = comparableNights.map((d) => totals(byNight.get(d) ?? [], asOfHour, cutoffHour));

  const myAverage = average(mine.net, mine.tickets);

  return {
    netSales: {
      value: mine.net,
      baseline: compareToBaseline(mine.net, theirs.map((t) => t.net), minSample),
    },
    ticketCount: {
      value: mine.tickets,
      baseline: compareToBaseline(mine.tickets, theirs.map((t) => t.tickets), minSample),
    },
    averageTicket: {
      value: myAverage,
      baseline: compareToBaseline(
        myAverage ?? 0,
        // A night nobody rang up on contributes no average, rather than a zero
        // that would drag the baseline down and flatter tonight by comparison.
        theirs.map((t) => average(t.net, t.tickets)).filter((n): n is number => n !== null),
        minSample,
      ),
    },
    asOfHour,
    comparedToHour: asOfHour !== null,
    comparableNights,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run lib/pos/live-night.test.ts`
Expected: PASS, 11 tests.

- [ ] **Step 5: Typecheck, lint, commit**

```bash
npx tsc --noEmit
npx eslint lib/pos/live-night.ts lib/pos/live-night.test.ts
git add lib/pos/live-night.ts lib/pos/live-night.test.ts
git commit -m "feat(sales): tonight's figures against what tonight usually is"
```

---

## Task 3: The loader — one function per view

`getSalesData` already loads item sales, inventory, categories, bundles and size tokens for a date range. This adds a sibling that loads what the period views need on top: hourly rows (for the target night AND its history), server rows, and shift hours. Both are exported from the same file, and the page picks by view.

**Files:**
- Modify: `app/(app)/app/sales/actions.ts`

**Interfaces:**
- Consumes: `getCurrentOrg()` from `@/lib/org`; `createAdminClient()` from `@/lib/supabase/admin`; `resolveSalesPeriod`, `isLivePeriod`, `type SalesPeriod` from `@/lib/sales-view`; `cutoffHourFromSettings`, `businessDateFromParts` from `@/lib/business-date`; `buildDaypart`, `type Daypart` from `@/lib/pos/daypart`; `summariseTickets`, `type TicketMetrics` from `@/lib/pos/tickets`; `buildServerPerformance`, `type ServerPerformance` from `@/lib/pos/server-performance`; `buildLiveNight`, `type LiveNight` from `@/lib/pos/live-night`; `classifyMenu`, `type MenuBoard` from `@/lib/pos/menu-engineering`; `assessSyncHealth`, `type SyncHealth` from `@/lib/pos/sync-health`; the existing `getSalesData(rangeKey?, from?, to?)`.
- Produces:
  - `type PeriodSalesData = { period: SalesPeriod; live: boolean; today: string; cutoffHour: number; daypart: Daypart; tickets: TicketMetrics; servers: ServerPerformance[]; liveNight: LiveNight | null; menu: MenuBoard; sync: SyncHealth; sales: SalesData }`
  - `getPeriodSalesData(view?: string, from?: string, to?: string): Promise<PeriodSalesData>`

- [ ] **Step 1: Add the loader**

Append to `app/(app)/app/sales/actions.ts`:

```ts
/**
 * The period views.
 *
 * Wraps getSalesData rather than replacing it: the item-level margin work is
 * identical at every horizon and only the framing differs. The extra queries
 * here are the ones the item feed cannot answer — WHEN the bar traded and WHO
 * sold it.
 *
 * The hourly history deliberately reaches back 8 weeks rather than only over
 * the period: the baseline needs four previous same-weekdays, and a window that
 * only covered the period itself would report every night as having no history.
 */
export async function getPeriodSalesData(
  view?: string,
  from?: string,
  to?: string,
): Promise<PeriodSalesData> {
  const { org } = await getCurrentOrg();
  const supabase = createAdminClient();
  const orgId = org.id;

  const barSettings = (org.bar_settings ?? {}) as Record<string, unknown>;
  const cutoffHour = cutoffHourFromSettings(barSettings);

  const now = new Date();
  // The bar's own idea of "now": at 01:30 with a 4am cutoff, tonight is still
  // yesterday's date, and using the calendar date would show an empty screen
  // during the busiest hours of the week.
  const today = businessDateFromParts(
    now.getFullYear(), now.getMonth() + 1, now.getDate(), now.getHours(), cutoffHour,
  );

  const period = resolveSalesPeriod(view, today, from, to);
  const live = isLivePeriod(period, today);

  // 8 weeks back from the period start, so four same-weekdays are always in
  // reach even when a bar is closed some weeks.
  const historyFrom = addDays(period.start, -56);

  const [{ data: hourly }, { data: serverRows }, { data: shifts }] = await Promise.all([
    supabase
      .from('pos_hourly_sales')
      .select('business_date, hour, net_sales, ticket_count, tips')
      .eq('organization_id', orgId)
      .gte('business_date', historyFrom)
      .lte('business_date', period.end),
    supabase
      .from('pos_server_sales')
      .select('business_date, server_name, net_sales, ticket_count, tips')
      .eq('organization_id', orgId)
      .gte('business_date', period.start)
      .lte('business_date', period.end),
    // The name lives on `employees`, not on the shift, and hours are split
    // across two columns. `buildServerPerformance` matches POS names to payroll
    // names, so the join is what makes sales-per-hour possible at all.
    supabase
      .from('employee_shifts')
      .select('regular_hours, overtime_hours, employees(name)')
      .eq('organization_id', orgId)
      .gte('shift_date', period.start)
      .lte('shift_date', period.end),
  ]);

  const allHourly = (hourly ?? []).map((r) => ({
    business_date: String(r.business_date),
    hour: Number(r.hour),
    net_sales: Number(r.net_sales) || 0,
    ticket_count: Number(r.ticket_count) || 0,
    tips: Number(r.tips) || 0,
  }));

  // Rows inside the period drive the curve and the ticket metrics; everything
  // older is history and exists only for the baseline.
  const inPeriod = allHourly.filter(
    (r) => r.business_date >= period.start && r.business_date <= period.end,
  );
  const history = allHourly.filter((r) => r.business_date < period.start);

  // The hour the night has reached. Null for a closed period, which is what
  // makes the baseline compare whole nights instead of truncating them.
  const asOfHour = live && (period.view === 'tonight' || period.view === 'day')
    ? now.getHours()
    : null;

  const liveNight = period.view === 'tonight' || period.view === 'day'
    ? buildLiveNight({
        targetDate: period.start,
        rows: inPeriod,
        history,
        cutoffHour,
        asOfHour,
      })
    : null;

  const sales = await getSalesData('custom', period.start, period.end);

  return {
    period,
    live,
    today,
    cutoffHour,
    daypart: buildDaypart(inPeriod, cutoffHour),
    tickets: summariseTickets(inPeriod),
    servers: buildServerPerformance(
      (serverRows ?? []).map((r) => ({
        business_date: String(r.business_date),
        server_name: String(r.server_name ?? ''),
        net_sales: Number(r.net_sales) || 0,
        ticket_count: Number(r.ticket_count) || 0,
        tips: Number(r.tips) || 0,
      })),
      (shifts ?? []).map((s) => {
        // Supabase types an embedded to-one relation as either an object or a
        // single-element array depending on the inferred shape; normalise both.
        const emp = Array.isArray(s.employees) ? s.employees[0] : s.employees;
        return {
          employeeName: String((emp as { name?: string } | null)?.name ?? ''),
          // Overtime is still hours worked. Dropping it would overstate every
          // busy bartender's sales-per-hour by exactly their overtime.
          hours: (Number(s.regular_hours) || 0) + (Number(s.overtime_hours) || 0),
        };
      }),
    ),
    liveNight,
    menu: classifyMenu(sales.items),
    sync: assessSyncHealth(
      (org.pos_config ?? null) as PosConfigShape | null,
      (org.pos_provider ?? null) as string | null,
      now,
    ),
    sales,
  };
}
```

Add the type above it:

```ts
export type PeriodSalesData = {
  period: SalesPeriod;
  /** The period is still being traded. */
  live: boolean;
  /** The bar's own current business date. */
  today: string;
  cutoffHour: number;
  daypart: Daypart;
  tickets: TicketMetrics;
  servers: ServerPerformance[];
  /** Null for the week and month views, which are not about one night. */
  liveNight: LiveNight | null;
  menu: MenuBoard;
  sync: SyncHealth;
  /** Everything the item-level screens already showed. */
  sales: SalesData;
};
```

And extend the import block at the top of the file:

```ts
import { addDays } from '@/lib/date-range';
import { resolveSalesPeriod, isLivePeriod, type SalesPeriod } from '@/lib/sales-view';
import { cutoffHourFromSettings, businessDateFromParts } from '@/lib/business-date';
import { buildDaypart, type Daypart } from '@/lib/pos/daypart';
import { summariseTickets, type TicketMetrics } from '@/lib/pos/tickets';
import { buildServerPerformance, type ServerPerformance } from '@/lib/pos/server-performance';
import { buildLiveNight, type LiveNight } from '@/lib/pos/live-night';
import { classifyMenu, type MenuBoard } from '@/lib/pos/menu-engineering';
import { assessSyncHealth, type SyncHealth, type PosConfigShape } from '@/lib/pos/sync-health';
```

- [ ] **Step 2: Confirm the shift join returns names and hours**

The schema is already verified — `employee_shifts` (migration `20260424000000_create_payroll_tables.sql:19`) has `employee_id`, `shift_date`, `regular_hours`, `overtime_hours` and **no** name or total-hours column; the name is `employees.name`. The query above reflects that.

What still needs checking at runtime is that the embedded join actually resolves, because a failed embed returns rows with `employees: null` and every server silently reports null hours — indistinguishable from "payroll has no match".

Add a temporary assertion while developing:

```ts
if ((shifts ?? []).length > 0 && (shifts ?? []).every((s) => !s.employees)) {
  console.warn('employee_shifts join returned no employee names — check the FK embed');
}
```

Remove it once confirmed against a bar that has both shifts and POS server rows in the period.

- [ ] **Step 3: Typecheck and confirm tenancy scoping**

Run:
```bash
npx tsc --noEmit
npm run audit:scope
```
Expected: tsc clean; audit reports `unscoped and unjustified : 0`. All three new queries filter `.eq('organization_id', orgId)`.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/app/sales/actions.ts"
git commit -m "feat(sales): load what the period views need"
```

---

## Task 4: Tonight / Day

**Files:**
- Create: `app/(app)/app/sales/_components/view-switcher.tsx`
- Create: `app/(app)/app/sales/_components/live-band.tsx`
- Create: `app/(app)/app/sales/_components/hourly-curve.tsx`
- Create: `app/(app)/app/sales/_components/server-table.tsx`
- Modify: `app/(app)/app/sales/page.tsx`

**Interfaces:**
- Consumes: `getPeriodSalesData`, `PeriodSalesData` from `../actions`; `money`, `pct` from `./sales-bits`; `shiftSalesPeriod`, `type SalesView` from `@/lib/sales-view`; `hourLabel` from `@/lib/pos/daypart`; `describeAge` from `@/lib/pos/sync-health`.
- Produces: `ViewSwitcher`, `LiveBand`, `HourlyCurve`, `ServerTable` — all presentational.

- [ ] **Step 1: The view switcher**

Create `app/(app)/app/sales/_components/view-switcher.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { shiftSalesPeriod, type SalesPeriod, type SalesView } from '@/lib/sales-view';

const VIEWS: { key: SalesView; label: string }[] = [
  { key: 'tonight', label: 'Tonight' },
  { key: 'day', label: 'Day' },
  { key: 'week', label: 'Week' },
  { key: 'month', label: 'Month' },
];

/**
 * The period, in the query string.
 *
 * Links rather than client state, for the reason RangeFilter gives: the period
 * survives a refresh, can be sent to somebody, and cannot quietly show a
 * different window than the one just read.
 */
export function ViewSwitcher({ period }: { period: SalesPeriod }) {
  const pathname = usePathname();
  const params = useSearchParams();

  const href = (view: SalesView, from?: string, to?: string) => {
    const next = new URLSearchParams(params.toString());
    next.set('view', view);
    // Switching view discards explicit bounds: a month's dates are not a
    // sensible week, and carrying them over shows a period nobody asked for.
    if (from && to) {
      next.set('from', from);
      next.set('to', to);
    } else {
      next.delete('from');
      next.delete('to');
    }
    return `${pathname}?${next.toString()}`;
  };

  const step = (dir: 'prev' | 'next') => {
    const s = shiftSalesPeriod(period.view, period.start, period.end, dir);
    return href(period.view, s.start, s.end);
  };

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-1 rounded-lg border border-border/60 bg-card p-1">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={href(v.key)}
            className={cn(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              period.view === v.key
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted',
            )}
          >
            {v.label}
          </Link>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <Link
          href={step('prev')}
          aria-label="Previous period"
          className="rounded-md border border-border/60 p-1.5 hover:bg-muted"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden />
        </Link>
        <span className="min-w-32 text-center text-sm font-medium tabular-nums">
          {period.label}
        </span>
        <Link
          href={step('next')}
          aria-label="Next period"
          className="rounded-md border border-border/60 p-1.5 hover:bg-muted"
        >
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: The live band**

Create `app/(app)/app/sales/_components/live-band.tsx`:

```tsx
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { money } from './sales-bits';
import { hourLabel } from '@/lib/pos/daypart';
import type { LiveNight, LiveFigure } from '@/lib/pos/live-night';

/**
 * A figure and what it usually is.
 *
 * The delta is the point. A bar that took $4,200 does not know whether that is
 * good; a bar that took 18% more than its last four Saturdays does.
 */
function Figure({
  label, figure, format,
}: {
  label: string;
  figure: LiveFigure;
  format: (n: number) => string;
}) {
  const delta = figure.baseline.deltaPct;
  const Icon = delta === null ? Minus : delta >= 0 ? TrendingUp : TrendingDown;

  return (
    <div className="rounded-lg border border-border/60 bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">
        {figure.value === null ? '—' : format(figure.value)}
      </p>
      <p
        className={cn(
          'mt-1 flex items-center gap-1 text-xs',
          delta === null ? 'text-muted-foreground'
            : delta >= 0 ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-destructive',
        )}
      >
        <Icon className="h-3 w-3" aria-hidden />
        {delta === null || figure.baseline.average === null ? (
          'No comparable nights yet'
        ) : (
          <>
            {delta >= 0 ? '+' : ''}{delta.toFixed(1)}% vs {format(figure.baseline.average)}
            {figure.baseline.thin && (
              <span className="text-muted-foreground">
                {' '}({figure.baseline.sampleSize} night{figure.baseline.sampleSize === 1 ? '' : 's'})
              </span>
            )}
          </>
        )}
      </p>
    </div>
  );
}

export function LiveBand({ night }: { night: LiveNight }) {
  return (
    <div className="space-y-2">
      <div className="grid gap-3 sm:grid-cols-3">
        <Figure label="Net sales" figure={night.netSales} format={money} />
        <Figure
          label="Tickets"
          figure={night.ticketCount}
          format={(n) => Math.round(n).toLocaleString()}
        />
        <Figure label="Average ticket" figure={night.averageTicket} format={money} />
      </div>

      {night.comparedToHour && night.asOfHour !== null && (
        <p className="text-xs text-muted-foreground">
          Compared to the same {night.comparableNights.length === 1 ? 'night' : 'nights'} at{' '}
          {hourLabel(night.asOfHour)} — not to their totals. Tonight is not projected forward.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: The hourly curve**

Create `app/(app)/app/sales/_components/hourly-curve.tsx`:

```tsx
import { cn } from '@/lib/utils';
import { money } from './sales-bits';
import type { Daypart } from '@/lib/pos/daypart';

/**
 * The night's shape.
 *
 * An hour that has not happened is BLANK, not a zero bar — a zero reads as a
 * dead hour the bar should worry about, rather than an hour still to come.
 * `traded` carries that distinction from buildDaypart; do not substitute a
 * `netSales === 0` check, which cannot tell the two apart.
 */
export function HourlyCurve({ daypart }: { daypart: Daypart }) {
  const peak = daypart.peak?.netSales ?? 0;

  if (daypart.totalNet === 0 && !daypart.hours.some((h) => h.traded)) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Nothing rung up yet.
      </p>
    );
  }

  return (
    <div className="flex items-end gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {daypart.hours.map((h) => (
        <div key={h.hour} className="flex min-w-7 flex-1 flex-col items-center gap-1">
          <div className="flex h-28 w-full items-end">
            {h.traded ? (
              <div
                className={cn(
                  'w-full rounded-t',
                  h.hour === daypart.peak?.hour ? 'bg-primary' : 'bg-primary/40',
                )}
                style={{ height: `${peak > 0 ? Math.max(2, (h.netSales / peak) * 100) : 2}%` }}
                title={`${h.label} — ${money(h.netSales)}, ${h.ticketCount} tickets`}
              />
            ) : (
              // Deliberately empty: this hour has not happened.
              <div className="w-full rounded-t border-b border-dashed border-border/60" />
            )}
          </div>
          <span className="text-[10px] text-muted-foreground">{h.label}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: The server table**

Create `app/(app)/app/sales/_components/server-table.tsx`:

```tsx
import { money } from './sales-bits';
import type { ServerPerformance } from '@/lib/pos/server-performance';

/**
 * Who sold it.
 *
 * `hoursWorked` and `salesPerHour` are null when payroll has no matching
 * person — a different fact from zero hours, and shown as such. A bartender who
 * is not on the payroll list still sold the drinks.
 */
export function ServerTable({ servers }: { servers: ServerPerformance[] }) {
  if (servers.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No per-server data for this period.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2 pr-3 font-medium">Server</th>
            <th className="px-3 py-2 text-right font-medium">Net</th>
            <th className="px-3 py-2 text-right font-medium">Tickets</th>
            <th className="hidden px-3 py-2 text-right font-medium sm:table-cell">Avg ticket</th>
            <th className="hidden px-3 py-2 text-right font-medium md:table-cell">Sales/hr</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {servers.map((s) => (
            <tr key={s.serverName}>
              <td className="py-2.5 pr-3 font-medium">
                {s.serverName}
                {!s.matchedEmployee && (
                  <span className="block text-xs font-normal text-muted-foreground">
                    Not matched to payroll
                  </span>
                )}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums">{money(s.netSales)}</td>
              <td className="px-3 py-2.5 text-right tabular-nums">
                {s.ticketCount.toLocaleString()}
              </td>
              <td className="hidden px-3 py-2.5 text-right tabular-nums text-muted-foreground sm:table-cell">
                {s.averageTicket === null ? '—' : money(s.averageTicket)}
              </td>
              <td className="hidden px-3 py-2.5 text-right tabular-nums text-muted-foreground md:table-cell">
                {s.salesPerHour === null ? '—' : money(s.salesPerHour)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 5: Wire the page**

Rewrite `app/(app)/app/sales/page.tsx` so it dispatches on the view. Keep the existing overview content (`Stat` band, `CostCoverageNotice`, `TaxInclusiveNotice`, slow movers) for the week and month views; render the new components for tonight and day.

```tsx
import type { Metadata } from 'next';
import { TrendingUp } from 'lucide-react';
import { getPeriodSalesData } from './actions';
import { ViewSwitcher } from './_components/view-switcher';
import { LiveBand } from './_components/live-band';
import { HourlyCurve } from './_components/hourly-curve';
import { ServerTable } from './_components/server-table';
import { CostCoverageNotice, TaxInclusiveNotice } from './_components/sales-bits';
import { describeAge } from '@/lib/pos/sync-health';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Sales' };

export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; from?: string; to?: string }>;
}) {
  const sp = await searchParams;
  const data = await getPeriodSalesData(sp.view, sp.from, sp.to);
  const nightly = data.period.view === 'tonight' || data.period.view === 'day';

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
      <div>
        <p className="text-sm text-muted-foreground">Sales</p>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <TrendingUp className="h-6 w-6 text-primary" aria-hidden />
          {data.period.label}
        </h1>
        {data.live && (
          <p className="mt-1 text-sm text-muted-foreground">
            As of {describeAge(data.sync.minutesAgo)}
            {data.sync.status !== 'healthy' && ` — ${data.sync.message}`}
          </p>
        )}
      </div>

      <ViewSwitcher period={data.period} />

      {data.sales.revenueIncludesTax && <TaxInclusiveNotice rate={data.sales.salesTaxRate} />}

      {nightly && data.liveNight ? (
        <>
          <LiveBand night={data.liveNight} />

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Through the night</CardTitle>
            </CardHeader>
            <CardContent>
              <HourlyCurve daypart={data.daypart} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">By server</CardTitle>
            </CardHeader>
            <CardContent>
              <ServerTable servers={data.servers} />
            </CardContent>
          </Card>
        </>
      ) : (
        <PeriodSummary data={data} />
      )}
    </main>
  );
}
```

`PeriodSummary` is Task 5. Until then, stub it in the same file as a component that renders the existing overview band so the page compiles and runs:

```tsx
function PeriodSummary({ data }: { data: Awaited<ReturnType<typeof getPeriodSalesData>> }) {
  const s = data.sales.summary;
  return (
    <>
      <CostCoverageNotice
        itemsMissingCost={s.itemsMissingCost}
        revenueMissingCost={s.revenueMissingCost}
        revenue={s.revenue}
      />
      <p className="text-sm text-muted-foreground">
        {s.unitsSold.toLocaleString()} drinks over this period.
      </p>
    </>
  );
}
```

- [ ] **Step 6: Verify it builds and renders**

Run:
```bash
npx tsc --noEmit
npx eslint "app/(app)/app/sales"
npm run build
```
Expected: all three clean.

Then, with the migration applied, load `/app/sales?view=tonight` and confirm: the band shows three figures with deltas; hours later than now are blank rather than zero-height; the "as of" line appears.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/app/sales"
git commit -m "feat(sales): tonight and day views"
```

---

## Task 5: Week / Month — absorbing Categories and Margins

The week and month views take over what `/app/sales/categories` and `/app/sales/margins` show today: category mix, the item margin table, the menu-engineering quadrant, slow movers and the revenue trend.

**Carry the size split across.** `margins/page.tsx` renders `<SizeSplit sizes={i.sizes} pourUnits={i.pourUnitsSold} units={i.unitsSold} />` under each item name. That component must move to the new item table, not be lost in the fold — it is the only place the sgl/dbl breakdown is visible.

**Files:**
- Create: `app/(app)/app/sales/_components/menu-quadrant.tsx`
- Create: `app/(app)/app/sales/_components/period-summary.tsx`
- Modify: `app/(app)/app/sales/page.tsx` (replace the Task 4 stub with the real import)

**Interfaces:**
- Consumes: `PeriodSalesData` from `../actions`; `money`, `pct`, `Stat`, `SizeSplit`, `CostCoverageNotice` from `./sales-bits`; `TrendChart` from `./trend-chart`; `MENU_CLASS_LABEL`, `type MenuBoard`, `type MenuClass` from `@/lib/pos/menu-engineering`.
- Produces: `MenuQuadrant`, `PeriodSummary`.

- [ ] **Step 1: The menu quadrant**

Create `app/(app)/app/sales/_components/menu-quadrant.tsx`:

```tsx
import { cn } from '@/lib/utils';
import { money } from './sales-bits';
import { MENU_CLASS_LABEL, type MenuBoard, type MenuClass } from '@/lib/pos/menu-engineering';

const TONE: Record<MenuClass, string> = {
  star: 'border-emerald-500/40 bg-emerald-500/5',
  plowhorse: 'border-amber-500/40 bg-amber-500/5',
  puzzle: 'border-sky-500/40 bg-sky-500/5',
  dog: 'border-destructive/40 bg-destructive/5',
  unknown: 'border-border/60',
};

const ORDER: MenuClass[] = ['star', 'plowhorse', 'puzzle', 'dog'];

/**
 * Popularity against margin, split at this bar's own medians.
 *
 * Not at an industry number: a dive bar and a cocktail bar sit in different
 * absolute ranges and both have stars. classifyMenu owns that decision.
 */
export function MenuQuadrant({ board }: { board: MenuBoard }) {
  if (board.items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Nothing sold in this period.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {ORDER.map((cls) => {
          const items = board.items.filter((i) => i.menuClass === cls);
          return (
            <div key={cls} className={cn('rounded-lg border p-3', TONE[cls])}>
              <p className="text-sm font-semibold">{MENU_CLASS_LABEL[cls]}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {items.length} item{items.length === 1 ? '' : 's'}
              </p>
              <ul className="mt-2 space-y-1">
                {items.slice(0, 5).map((i) => (
                  <li key={i.matchKey} className="flex justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate">{i.itemName}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {money(i.revenue)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {board.uncosted > 0 && (
        <p className="text-xs text-muted-foreground">
          {board.uncosted} item{board.uncosted === 1 ? '' : 's'} could not be placed — no cost
          price. Costing those first is what makes this board trustworthy.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: The period summary**

Create `app/(app)/app/sales/_components/period-summary.tsx`. Move the content of the current `categories/page.tsx` and `margins/page.tsx` into it, keeping their existing table markup, and keeping `SizeSplit` on the item rows.

Read both files first and port them faithfully — they contain working layout that does not need redesigning:

```bash
sed -n '1,220p' "app/(app)/app/sales/categories/page.tsx"
sed -n '1,240p' "app/(app)/app/sales/margins/page.tsx"
```

The component signature is:

```tsx
import { Stat, CostCoverageNotice, SizeSplit, money, pct } from './sales-bits';
import { TrendChart } from './trend-chart';
import { MenuQuadrant } from './menu-quadrant';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { PeriodSalesData } from '../actions';

/**
 * The retrospective views.
 *
 * This is where the Categories and Margins tabs went. Both asked the same
 * question over the same window and differed only in how they sliced it, which
 * is exactly what a period view is for.
 */
export function PeriodSummary({ data }: { data: PeriodSalesData }) {
  const s = data.sales.summary;
  // ... Stat band, CostCoverageNotice, category table, item margin table with
  //     <SizeSplit sizes={i.sizes} pourUnits={i.pourUnitsSold} units={i.unitsSold} />,
  //     <MenuQuadrant board={data.menu} />, <TrendChart points={data.sales.trend} />,
  //     slow movers table.
}
```

Fill every section with the real markup ported from the two pages. Do not leave the comment as the body.

- [ ] **Step 3: Replace the stub in page.tsx**

Delete the local `PeriodSummary` stub added in Task 4 and import the real one:

```tsx
import { PeriodSummary } from './_components/period-summary';
```

- [ ] **Step 4: Verify**

Run:
```bash
npx tsc --noEmit
npx eslint "app/(app)/app/sales"
npm run build
```
Expected: clean. Then load `/app/sales?view=week` and confirm the category table, item margins with the size split, the quadrant, the trend and slow movers all render.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/app/sales"
git commit -m "feat(sales): week and month views absorb categories and margins"
```

---

## Task 6: Redirects and navigation

**Files:**
- Modify: `app/(app)/app/sales/categories/page.tsx` (replace entirely with a redirect)
- Modify: `app/(app)/app/sales/margins/page.tsx` (replace entirely with a redirect)
- Modify: `app/(app)/app/_components/nav-config.ts:85-89`

**Interfaces:**
- Consumes: `redirect` from `next/navigation`.
- Produces: nothing importable.

- [ ] **Step 1: Redirect the two old routes**

Replace the whole of `app/(app)/app/sales/categories/page.tsx` with:

```tsx
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

/**
 * The Categories tab's old home.
 *
 * It is part of the week and month views now, so this route only forwards.
 * Kept rather than deleted because the path has been in the sidebar and in
 * bookmarks — the same reason `/app/payroll/split` still exists.
 */
export default async function SalesCategoriesRedirect() {
  redirect('/app/sales?view=week');
}
```

Replace the whole of `app/(app)/app/sales/margins/page.tsx` with the same shape, changing the comment to say Margins.

- [ ] **Step 2: Drop the tabs from the nav**

In `app/(app)/app/_components/nav-config.ts`, the Sales entry currently reads:

```ts
{
  group: 'Money',
  root: { label: 'Sales', href: '/app/sales', icon: TrendingUp },
  tabs: [
    { label: 'Overview',   href: '/app/sales',            icon: TrendingUp },
    { label: 'Categories', href: '/app/sales/categories', icon: Layers },
    { label: 'Margins',    href: '/app/sales/margins',    icon: Scale },
  ],
},
```

Replace it with:

```ts
{
  group: 'Money',
  // No tabs: the period switcher on the page is the navigation now, and a tab
  // strip beside it would offer a second, conflicting idea of where you are.
  root: { label: 'Sales', href: '/app/sales', icon: TrendingUp },
},
```

Then remove `Layers` and `Scale` from the `lucide-react` import at the top of the file **only if nothing else in the file uses them**. Check first:

```bash
grep -n "Layers\|Scale" "app/(app)/app/_components/nav-config.ts"
```

- [ ] **Step 3: Full verification**

Run:
```bash
npx tsc --noEmit
npm test
npm run audit:scope
npx eslint lib/sales-view.ts lib/sales-view.test.ts lib/pos/live-night.ts lib/pos/live-night.test.ts "app/(app)/app/sales" "app/(app)/app/_components/nav-config.ts"
npm run build
```

Expected: tsc clean; all vitest files pass; audit reports 0 unscoped; eslint clean on the changed files; build succeeds.

Note: repo-wide `npm run lint` reports thousands of pre-existing problems. Lint only the files this plan touched.

Then confirm by hand: `/app/sales/categories` and `/app/sales/margins` both land on `/app/sales?view=week`, and the sidebar shows Sales with no sub-tabs.

- [ ] **Step 4: Commit**

```bash
git add "app/(app)/app/sales/categories/page.tsx" "app/(app)/app/sales/margins/page.tsx" "app/(app)/app/_components/nav-config.ts"
git commit -m "feat(sales): fold the categories and margins tabs into the period views"
```

---

## Self-review notes

**Spec coverage.** Every Stage C bullet maps to a task: the `?view=` route and generalised period helpers (Task 1); the live band with baselines (Tasks 2, 4); the hourly curve with empty-not-zero hours (Task 4, enforced by `DaypartHour.traded`); top movers, by-server table (Tasks 4, 5); the "as of" line from `sync-health` (Task 4); never extrapolating (Task 2, pinned by the "never reports a half night as a collapse" test); category mix, margin, quadrant, slow movers, trend (Task 5); redirects and the nav strip (Task 6).

**Two things deliberately deferred, and why.** The spec's Degradation and Error-handling sections are not given their own task: every figure this stage renders already returns null for "unknowable" from Stage B, and the components render `—` for those, so degradation is covered by construction rather than by a separate pass. If a bar with no agent at all reveals gaps in that, it is a follow-up.

**One thing needing confirmation during execution.** The `employee_shifts` schema is verified (Task 3 uses the real columns), but the embedded `employees(name)` join is not — a failed embed is silent and makes every server report null hours, which looks identical to "payroll has no match". Task 3 Step 2 covers it; do not skip it.

**Type consistency check.** `SalesView` / `SalesPeriod` (Task 1) are consumed by Tasks 3, 4 and 6 under those exact names. `LiveNight` / `LiveFigure` (Task 2) are consumed by Task 4. `PeriodSalesData` (Task 3) is consumed by Tasks 4 and 5. `SizeSplit` is the component in `sales-bits.tsx`, distinct from the `SizeSplit` *type* in `sales-analytics.ts` — Task 5 imports the component from `./sales-bits`, and nothing in this plan imports the type.

**Known ordering hazard.** Task 4 introduces a `PeriodSummary` stub that Task 5 replaces. If the tasks are executed out of order or in parallel, Task 5 must delete the stub rather than adding a second declaration.
