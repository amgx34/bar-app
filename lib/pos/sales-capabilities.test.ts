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
