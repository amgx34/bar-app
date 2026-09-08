/**
 * The night's takings as a running total.
 *
 * Pure — no database, no clock.
 *
 * WHY THIS EXISTS ALONGSIDE THE HOURLY BARS
 *
 * The bar chart answers "when was it busy". This answers "how is the night
 * going", which is the question actually being asked at 10pm with half the
 * evening left, and the two shapes are not interchangeable: a night with one
 * enormous hour and a night that traded steadily can reach the same total, and
 * only the running line shows which one you are standing in.
 *
 * WHERE THE LINE STOPS
 *
 * At the last hour that traded, never at closing time. Carrying a flat line
 * across hours that have not happened yet draws a dead bar for the back half
 * of every evening in progress — the same lie `traded` exists to prevent in
 * daypart.ts, and the reason untraded hours are dropped from the bar series
 * rather than plotted at zero.
 *
 * An untraded hour BETWEEN two trading ones is different, and is kept: the
 * money taken so far has not gone anywhere, so the line holds flat across it.
 * Dropping it instead would close the gap and quietly redraw an hour the bar
 * was shut as an hour that never existed.
 */

import type { Daypart } from './daypart';

export type CumulativePoint = {
  /** "11pm" — the same label the bar chart uses, so the two axes agree. */
  label: string;
  hour: number;
  /** Everything taken up to and including this hour. */
  cumulative: number;
  /** This hour's own takings. Null when the bar was shut. */
  netSales: number | null;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function buildCumulative(daypart: Daypart): CumulativePoint[] {
  const hours = daypart.hours ?? [];

  // Everything after the last traded hour is the future (or a closed bar), and
  // is not part of the night that has happened.
  let lastTraded = -1;
  for (let i = 0; i < hours.length; i++) {
    if (hours[i].traded) lastTraded = i;
  }
  if (lastTraded < 0) return [];

  const points: CumulativePoint[] = [];
  let running = 0;

  for (let i = 0; i <= lastTraded; i++) {
    const h = hours[i];
    if (h.traded) running += h.netSales;
    points.push({
      label:      h.label,
      hour:       h.hour,
      cumulative: round2(running),
      netSales:   h.traded ? h.netSales : null,
    });
  }

  return points;
}
