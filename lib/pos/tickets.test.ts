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
