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
