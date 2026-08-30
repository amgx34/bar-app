import { describe, it, expect } from 'vitest';
import {
  resolveDateRange, addDays, isIsoDate, todayIso, resolvePayPeriod,
  payPeriodFromParams, payRunHref,
  resolvePayrollView, monthRange, defaultPeriod, shiftPeriod,
} from './date-range';

const TODAY = '2026-08-20';

describe('addDays', () => {
  it('moves forward and back', () => {
    expect(addDays('2026-08-20', 1)).toBe('2026-08-21');
    expect(addDays('2026-08-20', -1)).toBe('2026-08-19');
  });

  it('crosses month and year boundaries', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('handles a leap day', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('does not drift across a DST boundary', () => {
    // The reason this works in UTC. US DST starts 2026-03-08; local-time
    // arithmetic here can land on the same day twice or skip one.
    expect(addDays('2026-03-07', 1)).toBe('2026-03-08');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
  });
});

describe('isIsoDate', () => {
  it('accepts a real date', () => {
    expect(isIsoDate('2026-08-20')).toBe(true);
  });

  it('rejects junk from the query string', () => {
    for (const v of ['', 'yesterday', '20-08-2026', '2026-8-1', null, undefined, 42, '2026-13-01']) {
      expect(isIsoDate(v)).toBe(false);
    }
  });

  it('rejects a date that does not exist rather than rolling it forward', () => {
    // new Date('2026-02-30') silently becomes March 2nd.
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-04-31')).toBe(false);
  });
});

describe('resolveDateRange', () => {
  it('treats today as one day, not a rolling 24 hours', () => {
    const r = resolveDateRange('today', TODAY);
    expect(r.from).toBe(TODAY);
    expect(r.to).toBe(TODAY);
  });

  it('makes week seven days inclusive of today', () => {
    const r = resolveDateRange('week', TODAY);
    expect(r.from).toBe('2026-08-14');
    expect(r.to).toBe(TODAY);
  });

  it('makes month thirty days inclusive of today', () => {
    expect(resolveDateRange('month', TODAY).from).toBe('2026-07-22');
  });

  it('honours a custom range', () => {
    const r = resolveDateRange('custom', TODAY, '2026-08-01', '2026-08-10');
    expect([r.from, r.to]).toEqual(['2026-08-01', '2026-08-10']);
  });

  it('accepts a backwards custom range rather than returning nothing', () => {
    const r = resolveDateRange('custom', TODAY, '2026-08-10', '2026-08-01');
    expect([r.from, r.to]).toEqual(['2026-08-01', '2026-08-10']);
  });

  it('falls back to the week when custom values are junk', () => {
    // These come off the query string, so anything can arrive.
    for (const [f, t] of [['bad', '2026-08-10'], ['2026-08-01', null], [null, null]] as const) {
      expect(resolveDateRange('custom', TODAY, f, t).key).toBe('week');
    }
  });

  it('falls back to the week for an unknown key', () => {
    expect(resolveDateRange('all-time', TODAY).key).toBe('week');
    expect(resolveDateRange(null, TODAY).key).toBe('week');
  });
});

describe('todayIso', () => {
  it('formats with padding', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('resolvePayPeriod', () => {
  const FALLBACK = { start: '2026-08-24', end: '2026-08-30' };

  it('uses a valid range from the URL', () => {
    expect(resolvePayPeriod('2026-08-10', '2026-08-16', FALLBACK))
      .toEqual({ start: '2026-08-10', end: '2026-08-16' });
  });

  it('falls back instead of erroring on junk', () => {
    // `?startDate=banana` returned a 500 error page before this existed.
    for (const [a, b] of [['banana', '2026-08-16'], ['2026-08-10', 'x'], [undefined, undefined], [null, null], [['a'], 'b']] as const) {
      expect(resolvePayPeriod(a, b, FALLBACK)).toEqual(FALLBACK);
    }
  });

  it('rejects a date that does not exist', () => {
    expect(resolvePayPeriod('2026-02-30', '2026-03-05', FALLBACK)).toEqual(FALLBACK);
  });

  it('falls back when only half the range is valid', () => {
    // Honouring one half would show a period nobody asked for.
    expect(resolvePayPeriod('2026-08-10', undefined, FALLBACK)).toEqual(FALLBACK);
  });

  it('accepts a reversed range rather than refusing it', () => {
    expect(resolvePayPeriod('2026-08-16', '2026-08-10', FALLBACK))
      .toEqual({ start: '2026-08-10', end: '2026-08-16' });
  });

  it('allows a single-day period and a period far in the past', () => {
    // Running payroll for an old week is a normal thing to need.
    expect(resolvePayPeriod('2026-08-16', '2026-08-16', FALLBACK).start).toBe('2026-08-16');
    expect(resolvePayPeriod('2024-01-01', '2024-01-07', FALLBACK))
      .toEqual({ start: '2024-01-01', end: '2024-01-07' });
  });
});

/**
 * Carrying the chosen pay week between the Payroll screens.
 *
 * The Pay Run could always browse a previous week, but "Run Payroll" was a bare
 * link, so the review screen fell back to the current week and there was no way
 * to run payroll for any period but this one. The link has to carry the period
 * — and refuse to carry a broken one, because these values come off the query
 * string and end up in a Postgres date comparison.
 */
describe('payPeriodFromParams', () => {
  it('reads a period the query string genuinely names', () => {
    expect(payPeriodFromParams('2026-08-10', '2026-08-16'))
      .toEqual({ start: '2026-08-10', end: '2026-08-16' });
  });

  it('returns null when neither date is given', () => {
    expect(payPeriodFromParams(undefined, undefined)).toBeNull();
  });

  it('returns null for half a range rather than inventing the other end', () => {
    expect(payPeriodFromParams('2026-08-10', undefined)).toBeNull();
    expect(payPeriodFromParams(undefined, '2026-08-16')).toBeNull();
  });

  it('returns null for junk, which must never reach a date comparison', () => {
    expect(payPeriodFromParams('banana', '2026-08-16')).toBeNull();
    expect(payPeriodFromParams('2026-02-30', '2026-08-16')).toBeNull();
  });

  it('accepts a reversed range, since the intent is obvious', () => {
    expect(payPeriodFromParams('2026-08-16', '2026-08-10'))
      .toEqual({ start: '2026-08-10', end: '2026-08-16' });
  });
});

describe('payRunHref', () => {
  it('carries the week being viewed', () => {
    expect(payRunHref('/app/payroll/review', '2026-08-10', '2026-08-16'))
      .toBe('/app/payroll/review?startDate=2026-08-10&endDate=2026-08-16');
  });

  it('stays bare when no week is being viewed, so the page picks its default', () => {
    // This is the Employees and Direct Deposit tabs, where no week is on screen
    // to carry — the review screen choosing the current week is right there.
    expect(payRunHref('/app/payroll/review', undefined, undefined))
      .toBe('/app/payroll/review');
  });

  it('drops a malformed period rather than passing it on', () => {
    expect(payRunHref('/app/payroll/review', 'banana', 'kiwi'))
      .toBe('/app/payroll/review');
  });
});

describe('resolvePayrollView', () => {
  it('takes the three real views', () => {
    expect(resolvePayrollView('day')).toBe('day');
    expect(resolvePayrollView('week')).toBe('week');
    expect(resolvePayrollView('month')).toBe('month');
  });

  it('falls back to the day for anything else', () => {
    // These all arrive off a query string, where a stale bookmark or a typo is
    // ordinary and an error screen is not an acceptable answer.
    expect(resolvePayrollView('banana')).toBe('day');
    expect(resolvePayrollView(undefined)).toBe('day');
    expect(resolvePayrollView(null)).toBe('day');
    expect(resolvePayrollView(['day', 'week'])).toBe('day');
  });
});

describe('monthRange', () => {
  it('spans the whole calendar month', () => {
    expect(monthRange('2026-08-20')).toEqual({ start: '2026-08-01', end: '2026-08-31' });
  });

  it('handles a 30-day month and a short February', () => {
    expect(monthRange('2026-09-15')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
    expect(monthRange('2026-02-10')).toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  it('handles a leap February', () => {
    expect(monthRange('2028-02-10')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
  });

  it('is stable on the first and last day of the month', () => {
    expect(monthRange('2026-08-01')).toEqual({ start: '2026-08-01', end: '2026-08-31' });
    expect(monthRange('2026-08-31')).toEqual({ start: '2026-08-01', end: '2026-08-31' });
  });
});

describe('defaultPeriod', () => {
  // 2026-08-20 is a Thursday.
  it('gives the Monday-to-Sunday week around today', () => {
    expect(defaultPeriod('week', TODAY)).toEqual({ start: '2026-08-17', end: '2026-08-23' });
  });

  it('counts Sunday as the END of its week, not the start of the next', () => {
    // A bar's Sunday trade is the tail of the week just worked. Getting this
    // wrong pays Sunday into the following pay run.
    expect(defaultPeriod('week', '2026-08-23')).toEqual({ start: '2026-08-17', end: '2026-08-23' });
    expect(defaultPeriod('week', '2026-08-24')).toEqual({ start: '2026-08-24', end: '2026-08-30' });
  });

  it('gives the week for the day view too, so Run Payroll has a period', () => {
    expect(defaultPeriod('day', TODAY)).toEqual({ start: '2026-08-17', end: '2026-08-23' });
  });

  it('gives the calendar month for the month view', () => {
    expect(defaultPeriod('month', TODAY)).toEqual({ start: '2026-08-01', end: '2026-08-31' });
  });
});

describe('shiftPeriod', () => {
  it('steps a week by seven days', () => {
    expect(shiftPeriod('week', '2026-08-17', '2026-08-23', 'next'))
      .toEqual({ start: '2026-08-24', end: '2026-08-30' });
    expect(shiftPeriod('week', '2026-08-17', '2026-08-23', 'prev'))
      .toEqual({ start: '2026-08-10', end: '2026-08-16' });
  });

  it('steps a day by one night', () => {
    expect(shiftPeriod('day', '2026-08-20', '2026-08-20', 'next'))
      .toEqual({ start: '2026-08-21', end: '2026-08-21' });
  });

  it('steps a month to the next month, not 30 days on', () => {
    expect(shiftPeriod('month', '2026-08-01', '2026-08-31', 'next'))
      .toEqual({ start: '2026-09-01', end: '2026-09-30' });
  });

  it('does not skip February on the way past a 31-day month', () => {
    // The bug this replaces: addDays(±30) from January 31st lands in March.
    expect(shiftPeriod('month', '2026-01-01', '2026-01-31', 'next'))
      .toEqual({ start: '2026-02-01', end: '2026-02-28' });
    expect(shiftPeriod('month', '2026-03-01', '2026-03-31', 'prev'))
      .toEqual({ start: '2026-02-01', end: '2026-02-28' });
  });

  it('crosses the year boundary in both directions', () => {
    expect(shiftPeriod('month', '2026-12-01', '2026-12-31', 'next'))
      .toEqual({ start: '2027-01-01', end: '2027-01-31' });
    expect(shiftPeriod('month', '2026-01-01', '2026-01-31', 'prev'))
      .toEqual({ start: '2025-12-01', end: '2025-12-31' });
  });
});
