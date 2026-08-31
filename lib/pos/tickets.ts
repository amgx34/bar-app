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
