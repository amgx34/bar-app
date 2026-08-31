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
