import { describe, it, expect } from 'vitest';
import { orderNightHours, buildDaypart, hourLabel, type HourlyRow } from './daypart';

const row = (hour: number, net: number, tickets = 1): HourlyRow => ({
  business_date: '2026-08-29', hour, net_sales: net, ticket_count: tickets, tips: 0,
});

describe('orderNightHours', () => {
  it('starts the night at the cutoff hour, not at midnight', () => {
    // A bar whose day rolls over at 4am trades 4am -> 3am. Ordering 0..23
    // would put closing time at the START of the chart and the evening in
    // the middle, which is not a night anyone recognises.
    const order = orderNightHours(4);
    expect(order).toHaveLength(24);
    expect(order[0]).toBe(4);
    expect(order[23]).toBe(3);
  });

  it('puts late-night hours after the evening, not before it', () => {
    const order = orderNightHours(4);
    expect(order.indexOf(23)).toBeLessThan(order.indexOf(1));
  });

  it('is a plain 0..23 when the day rolls at midnight', () => {
    expect(orderNightHours(0)).toEqual([...Array(24).keys()]);
  });

  it('defaults to the shared cutoff rather than hardcoding one', () => {
    expect(orderNightHours()).toEqual(orderNightHours(4));
  });
});

describe('hourLabel', () => {
  it('reads as a bar would say it', () => {
    expect(hourLabel(0)).toBe('12am');
    expect(hourLabel(1)).toBe('1am');
    expect(hourLabel(12)).toBe('12pm');
    expect(hourLabel(23)).toBe('11pm');
  });
});

describe('buildDaypart', () => {
  it('orders the hours on the bar clock and totals the night', () => {
    const d = buildDaypart([row(22, 100), row(1, 50), row(19, 25)], 4);
    const traded = d.hours.filter((h) => h.traded).map((h) => h.hour);
    expect(traded).toEqual([19, 22, 1]);
    expect(d.totalNet).toBe(175);
    expect(d.totalTickets).toBe(3);
  });

  it('marks hours with no row as untraded rather than zero', () => {
    // A zero reads as a dead hour. An hour the bar was shut, or an hour that
    // has not happened yet tonight, is not the same fact and must not draw
    // the same bar on a chart.
    const d = buildDaypart([row(22, 100)], 4);
    const twentyTwo = d.hours.find((h) => h.hour === 22)!;
    const three = d.hours.find((h) => h.hour === 3)!;
    expect(twentyTwo.traded).toBe(true);
    expect(three.traded).toBe(false);
    expect(three.netSales).toBe(0);
    expect(three.sharePct).toBeNull();
  });

  it('finds the peak by takings, not by ticket count', () => {
    // The busiest hour by headcount is often not the hour that made the money,
    // and staffing decisions follow the money.
    const d = buildDaypart([row(22, 100, 2), row(23, 300, 1)], 4);
    expect(d.peak?.hour).toBe(23);
  });

  it('reports each traded hour as a share of the night', () => {
    const d = buildDaypart([row(22, 250), row(23, 750)], 4);
    expect(d.hours.find((h) => h.hour === 22)!.sharePct).toBeCloseTo(25, 5);
    expect(d.hours.find((h) => h.hour === 23)!.sharePct).toBeCloseTo(75, 5);
  });

  it('returns a null peak and null shares for a night with no takings', () => {
    const d = buildDaypart([], 4);
    expect(d.peak).toBeNull();
    expect(d.totalNet).toBe(0);
    expect(d.hours.every((h) => h.sharePct === null)).toBe(true);
  });

  it('sums duplicate hours rather than letting one win', () => {
    const d = buildDaypart([row(22, 100, 2), row(22, 50, 3)], 4);
    const h = d.hours.find((x) => x.hour === 22)!;
    expect(h.netSales).toBe(150);
    expect(h.ticketCount).toBe(5);
  });

  it('ignores rows with an out-of-range hour', () => {
    const d = buildDaypart([row(22, 100), { ...row(0, 999), hour: 24 }], 4);
    expect(d.totalNet).toBe(100);
  });

  it('always returns 24 hours so a chart has a stable axis', () => {
    expect(buildDaypart([row(22, 1)], 4).hours).toHaveLength(24);
  });

  it('reorders traded hours when the cutoff changes, not just when the default is used', () => {
    // Every case above uses cutoff 4, which places the start of the night
    // between 1am and 7pm, giving the order [19, 22, 1]. Moving the cutoff to
    // 8pm (20) instead places the start of the night between 7pm and 10pm, so
    // 10pm becomes the FIRST of these three hours traded and 7pm becomes the
    // LAST — a genuinely different order, not just a relabelling.
    const rows = [row(22, 100), row(1, 50), row(19, 25)];
    const atFour = buildDaypart(rows, 4);
    const atEightPm = buildDaypart(rows, 20);

    const tradedAtFour = atFour.hours.filter((h) => h.traded).map((h) => h.hour);
    const tradedAtEightPm = atEightPm.hours.filter((h) => h.traded).map((h) => h.hour);

    expect(tradedAtFour).toEqual([19, 22, 1]);
    expect(tradedAtEightPm).toEqual([22, 1, 19]);
    expect(tradedAtEightPm).not.toEqual(tradedAtFour);
  });
});
