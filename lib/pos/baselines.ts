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
