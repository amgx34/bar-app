import { describe, it, expect } from 'vitest';
import { buildCumulative } from './cumulative';
import type { Daypart, DaypartHour } from './daypart';

const hour = (h: number, net: number, traded = true): DaypartHour =>
  ({ hour: h, label: `${h}`, netSales: net, ticketCount: 0, sharePct: null, traded });

const daypart = (hours: DaypartHour[]): Daypart =>
  ({ hours, peak: null, totalNet: hours.reduce((s, h) => s + (h.traded ? h.netSales : 0), 0), totalTickets: 0 });

describe('buildCumulative', () => {
  it('accumulates the night hour by hour', () => {
    const out = buildCumulative(daypart([hour(18, 100), hour(19, 250), hour(20, 50)]));
    expect(out.map((p) => p.cumulative)).toEqual([100, 350, 400]);
  });

  it('stops the line at the last traded hour rather than flattening it to close', () => {
    // A night still in progress must not draw a flat line across hours that
    // have not happened — that reads as a dead bar, not an unfinished evening.
    const out = buildCumulative(daypart([hour(18, 100), hour(19, 250), hour(20, 0, false)]));
    expect(out).toHaveLength(2);
    expect(out.at(-1)?.label).toBe('19');
  });

  it('carries an untraded hour mid-night forward without breaking the running total', () => {
    // A shut hour between two trading ones is not a reset. The line holds flat
    // across it, because the money taken so far has not gone anywhere.
    const out = buildCumulative(daypart([hour(18, 100), hour(19, 0, false), hour(20, 50)]));
    expect(out.map((p) => p.cumulative)).toEqual([100, 100, 150]);
  });

  it('returns nothing for a night that has not traded at all', () => {
    expect(buildCumulative(daypart([hour(18, 0, false), hour(19, 0, false)]))).toEqual([]);
  });

  it('keeps a genuine zero-takings hour on the line', () => {
    // Traded but took nothing is a real fact about the night, unlike a shut hour.
    const out = buildCumulative(daypart([hour(18, 100), hour(19, 0), hour(20, 50)]));
    expect(out).toHaveLength(3);
    expect(out[1].cumulative).toBe(100);
  });
});
