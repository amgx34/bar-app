/**
 * What a visit is worth.
 *
 * Pure — no database, no clock.
 *
 * Average ticket is the figure a busy bar is actually managed by: it moves when
 * the mix changes, when an upsell lands, when a promotion drags spend down. Net
 * sales alone cannot tell those apart from a quieter night.
 *
 * One ticket is meant to be one visit however many lines it carries, which is
 * why Stage A captures COUNT(DISTINCT ticket) rather than a line count. But
 * that count is taken PER HOUR, and a tab left open across the turn of the
 * hour — say 22:59 to 23:01 — is a distinct ticket in both hours' counts.
 * `summariseTickets` sums `ticket_count` across whatever rows it is given, so
 * a long-running tab is counted more than once and `averageTicket` is
 * therefore slightly UNDERSTATED for a bar with slow tables or open tabs.
 * This is inherent to the hourly grain the figure was captured at, not a bug
 * this module can fix — treat `averageTicket` as a close approximation, not
 * an exact one, for any bar where tickets commonly outlive an hour boundary.
 *
 * PASS ONE FEED, NEVER BOTH
 *
 * `TicketRow` matches the hourly feed and the per-server feed equally well,
 * and the optional `hour` on both invites passing whichever is on hand — or
 * both at once. Summing both for the same night double-counts every ticket
 * and every dollar, because the same sales are represented twice under a
 * different grouping. Callers must pick one feed for a given call.
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
