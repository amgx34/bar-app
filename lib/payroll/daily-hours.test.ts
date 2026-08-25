import { describe, it, expect } from 'vitest';
import { buildDailyHours } from './daily-hours';

/**
 * The per-day view behind the week's total.
 *
 * The Adjust dialog has always written ONE night at a time — payroll is
 * computed per night — but it is opened from a row showing the WHOLE week, and
 * its date defaults to the first day of the period. So typing what the week
 * ought to total wrote that figure onto the Monday and left the other six
 * nights alone, and the week came out as the entered number plus the rest.
 *
 * This builds the list that makes the week legible: every night in the period,
 * including the ones with no shift row at all, which is exactly the case a
 * correction exists for.
 */
describe('buildDailyHours', () => {
  const shift = (
    shift_date: string,
    regular_hours: number,
    extra: Record<string, unknown> = {},
  ) => ({ shift_date, regular_hours, overtime_hours: 0, ...extra });

  it('returns one row per night in the period, in order', () => {
    const rows = buildDailyHours([], '2026-08-17', '2026-08-23');
    expect(rows).toHaveLength(7);
    expect(rows[0].date).toBe('2026-08-17');
    expect(rows[6].date).toBe('2026-08-23');
  });

  it('names the weekday, so a date is not the only thing to read', () => {
    const rows = buildDailyHours([], '2026-08-17', '2026-08-18');
    expect(rows[0].weekday).toBe('Mon');
    expect(rows[1].weekday).toBe('Tue');
  });

  it('shows a night with no shift row as absent, not as zero hours worked', () => {
    // These are not the same thing. A missing row is somebody who forgot to
    // clock in — the case the correction exists for — and showing it as a
    // deliberate 0.00 hides exactly the night worth looking at.
    const rows = buildDailyHours([shift('2026-08-17', 8)], '2026-08-17', '2026-08-18');
    expect(rows[0].hasShift).toBe(true);
    expect(rows[1].hasShift).toBe(false);
    expect(rows[1].hours).toBe(0);
    expect(rows[1].source).toBeNull();
  });

  it('counts stored overtime as hours worked', () => {
    // The split is decided weekly at pay time now, so a stored per-night split
    // is only ever two halves of one night's hours.
    const rows = buildDailyHours(
      [shift('2026-08-17', 8, { overtime_hours: 3 })],
      '2026-08-17',
      '2026-08-17',
    );
    expect(rows[0].hours).toBeCloseTo(11);
  });

  it('carries whether the figure came from the POS or a person', () => {
    const rows = buildDailyHours(
      [
        shift('2026-08-17', 8, { hours_source: 'manual' }),
        shift('2026-08-18', 6, { hours_source: 'pos' }),
      ],
      '2026-08-17',
      '2026-08-18',
    );
    expect(rows[0].source).toBe('manual');
    expect(rows[1].source).toBe('pos');
  });

  it('treats an unrecognised source as the POS, matching the column default', () => {
    const rows = buildDailyHours(
      [shift('2026-08-17', 8, { hours_source: 'sideways' })],
      '2026-08-17',
      '2026-08-17',
    );
    expect(rows[0].source).toBe('pos');
  });

  it('carries the opener flag', () => {
    const rows = buildDailyHours(
      [shift('2026-08-17', 8, { is_opener: true })],
      '2026-08-17',
      '2026-08-17',
    );
    expect(rows[0].isOpener).toBe(true);
  });

  it('adds up two rows landing on the same night rather than dropping one', () => {
    // The table is unique on (org, employee, date) so this should not happen —
    // but silently showing one of them would understate somebody's pay.
    const rows = buildDailyHours(
      [shift('2026-08-17', 5), shift('2026-08-17', 3)],
      '2026-08-17',
      '2026-08-17',
    );
    expect(rows[0].hours).toBeCloseTo(8);
  });

  it('ignores shifts outside the period', () => {
    const rows = buildDailyHours(
      [shift('2026-08-10', 8), shift('2026-08-17', 6)],
      '2026-08-17',
      '2026-08-17',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].hours).toBeCloseTo(6);
  });

  it('copes with junk hours instead of returning NaN', () => {
    const rows = buildDailyHours(
      [shift('2026-08-17', Number.NaN, { overtime_hours: 'x' })],
      '2026-08-17',
      '2026-08-17',
    );
    expect(rows[0].hours).toBe(0);
    // The row still EXISTS — the shift is real, only its figure is unreadable.
    expect(rows[0].hasShift).toBe(true);
  });

  it('handles a period longer than a week', () => {
    const rows = buildDailyHours([], '2026-08-17', '2026-08-30');
    expect(rows).toHaveLength(14);
  });

  it('returns nothing for a period that ends before it starts', () => {
    expect(buildDailyHours([], '2026-08-23', '2026-08-17')).toEqual([]);
  });

  it('refuses to build an unbounded list from a malformed date', () => {
    // These come off a query string. An unparseable bound must not spin.
    expect(buildDailyHours([], 'banana', '2026-08-17')).toEqual([]);
  });
});
