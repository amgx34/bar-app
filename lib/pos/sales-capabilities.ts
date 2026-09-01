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
