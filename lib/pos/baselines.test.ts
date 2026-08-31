import { describe, it, expect } from 'vitest';
import {
  sameWeekdayNights,
  totalToHour,
  compareToBaseline,
  nightPosition,
  type HourlyRow,
} from './baselines';
import { orderNightHours } from './daypart';

const row = (hour: number, net: number): HourlyRow => ({
  business_date: '2026-08-29', hour, net_sales: net, ticket_count: 1, tips: 0,
});

describe('sameWeekdayNights', () => {
  // 2026-08-29 is a Saturday.
  const history = [
    '2026-08-29', '2026-08-28', '2026-08-27', '2026-08-26',
    '2026-08-22', '2026-08-15', '2026-08-08', '2026-08-01', '2026-07-25',
  ];

  it('picks only the same weekday', () => {
    // A Saturday compared against a Tuesday is not a comparison, it is noise.
    const out = sameWeekdayNights('2026-08-29', history);
    expect(out).not.toContain('2026-08-28');
    expect(out).toContain('2026-08-22');
  });

  it('excludes the target night itself', () => {
    expect(sameWeekdayNights('2026-08-29', history)).not.toContain('2026-08-29');
  });

  it('takes the most recent first and honours the limit', () => {
    expect(sameWeekdayNights('2026-08-29', history, 2)).toEqual(['2026-08-22', '2026-08-15']);
  });

  it('never looks forward in time', () => {
    // A baseline built partly from the future is not a baseline.
    const out = sameWeekdayNights('2026-08-08', history);
    expect(out.every((d) => d < '2026-08-08')).toBe(true);
  });

  it('returns nothing when there is no history', () => {
    expect(sameWeekdayNights('2026-08-29', [])).toEqual([]);
  });
});

describe('totalToHour', () => {
  it('sums only the hours that have happened so far tonight', () => {
    // Comparing a half-finished Saturday against four complete ones reports a
    // disaster every single time. This is the whole point of the module.
    const rows = [row(19, 100), row(22, 400), row(1, 200)];
    expect(totalToHour(rows, 22, 4)).toBe(500);
  });

  it('includes the current hour itself', () => {
    expect(totalToHour([row(19, 100), row(20, 50)], 20, 4)).toBe(150);
  });

  it('counts a post-midnight hour as LATER than the evening', () => {
    // 1am comes after 11pm on a bar's night. Comparing raw hour numbers would
    // treat 1am as the earliest hour of the night and drop the whole evening.
    const rows = [row(22, 100), row(1, 50)];
    expect(totalToHour(rows, 1, 4)).toBe(150);
    expect(totalToHour(rows, 22, 4)).toBe(100);
  });

  it('sums the whole night when asked for the last hour of it', () => {
    const rows = [row(19, 100), row(23, 100), row(2, 100)];
    expect(totalToHour(rows, 3, 4)).toBe(300);
  });

  it('is zero for a night with no rows', () => {
    expect(totalToHour([], 22, 4)).toBe(0);
  });

  // Every case above uses the default cutoff of 4. The spec calls out the
  // "1am ticket" case specifically at OTHER cutoffs, because a cutoff bug is
  // exactly the failure this module's own doc comment warns about: it would
  // silently drop the evening from a running total, and a suite that only
  // ever exercises the default cutoff could never catch a regression in the
  // cutoff arithmetic itself.
  it('counts a post-midnight hour as later than the evening at a non-default cutoff', () => {
    // Cutoff 6: nightPosition(19, 6) = 13, nightPosition(1, 6) = 19. Both are
    // within the night, so both must count when asked up to 1am.
    const rows = [row(19, 100), row(1, 50)];
    expect(totalToHour(rows, 1, 6)).toBe(150);
    // Asked only up to 7pm (position 13), the 1am row (position 19) is still
    // in the future of that ask and must be excluded.
    expect(totalToHour(rows, 19, 6)).toBe(100);
  });

  it('behaves as a plain calendar day when the cutoff is midnight', () => {
    // Cutoff 0 means nightPosition(hour, 0) === hour, so this is an ordinary
    // "sum hours 0 through upToHour" — 9am is in, 8pm is not.
    const rows = [row(9, 75), row(20, 500)];
    expect(totalToHour(rows, 12, 0)).toBe(75);
  });
});

describe('nightPosition / orderNightHours agreement', () => {
  // baselines.ts and daypart.ts each reimplement "where does this hour sit in
  // the night" from the same cutoff, but neither module's own suite can catch
  // the two drifting apart — that only shows up by importing both. If they
  // ever disagreed, the hourly chart (built from orderNightHours) and the
  // "vs last Saturday" comparison (built from nightPosition) would tell
  // different stories about the same night.
  it('agrees with orderNightHours on the position of every hour, at every cutoff', () => {
    for (let cutoff = 0; cutoff <= 12; cutoff++) {
      const order = orderNightHours(cutoff);
      for (let hour = 0; hour <= 23; hour++) {
        expect(nightPosition(hour, cutoff)).toBe(order.indexOf(hour));
      }
    }
  });
});

describe('compareToBaseline', () => {
  it('reports the percentage difference against the mean', () => {
    expect(compareToBaseline(1180, [1000, 1000, 1000, 1000]).deltaPct).toBeCloseTo(18, 5);
  });

  it('reports a shortfall as negative', () => {
    expect(compareToBaseline(800, [1000, 1000, 1000, 1000]).deltaPct).toBeCloseTo(-20, 5);
  });

  it('flags a thin sample rather than hiding it', () => {
    // Four Saturdays is a baseline. One Saturday is an anecdote, and the
    // screen must be able to say so.
    const thin = compareToBaseline(1180, [1000]);
    expect(thin.sampleSize).toBe(1);
    expect(thin.thin).toBe(true);
    expect(thin.deltaPct).toBeCloseTo(18, 5);

    expect(compareToBaseline(1180, [1000, 1000, 1000, 1000]).thin).toBe(false);
  });

  it('has no answer when there is no history at all', () => {
    const none = compareToBaseline(1180, []);
    expect(none.average).toBeNull();
    expect(none.deltaPct).toBeNull();
    expect(none.sampleSize).toBe(0);
    expect(none.thin).toBe(true);
  });

  it('reports no delta when every comparable night took nothing', () => {
    // Dividing by a zero average yields Infinity, which would render as an
    // absurd percentage on a financial screen.
    const z = compareToBaseline(500, [0, 0]);
    expect(z.average).toBe(0);
    expect(z.deltaPct).toBeNull();
  });

  it('respects a custom minimum sample', () => {
    expect(compareToBaseline(100, [100, 100], 2).thin).toBe(false);
  });
});
