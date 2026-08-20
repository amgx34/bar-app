import { describe, it, expect } from 'vitest';
import { partitionShifts, shiftKey, type ProtectedShift } from './manual-hours';

/**
 * The agent re-sends a rolling window every five minutes. Before this guard
 * existed, every one of those syncs reverted any hours a manager had corrected
 * — while leaving the payroll_adjustments row in place, so the log described a
 * change the pay run no longer reflected.
 */

type Row = { employee_id: string; shift_date: string; regular_hours: number };

const row = (employee_id: string, shift_date: string, regular_hours: number): Row =>
  ({ employee_id, shift_date, regular_hours });

function incoming(...rows: Row[]): Map<string, Row> {
  return new Map(rows.map((r) => [shiftKey(r.employee_id, r.shift_date), r]));
}

describe('partitionShifts', () => {
  it('writes everything when nothing is protected', () => {
    const { writable, protectedCount } = partitionShifts(
      incoming(row('a', '2026-08-18', 8), row('b', '2026-08-18', 6)),
      [],
    );
    expect(writable).toHaveLength(2);
    expect(protectedCount).toBe(0);
  });

  it('holds back a shift a person corrected', () => {
    // The whole point: the POS still believes 'a' worked 8 hours that night.
    const { writable, protectedCount } = partitionShifts(
      incoming(row('a', '2026-08-18', 8), row('b', '2026-08-18', 6)),
      [{ employee_id: 'a', shift_date: '2026-08-18' }],
    );
    expect(writable.map((r) => r.employee_id)).toEqual(['b']);
    expect(protectedCount).toBe(1);
  });

  it('protects per DATE, not per employee', () => {
    // Correcting Tuesday must not freeze the same person's Wednesday.
    const { writable } = partitionShifts(
      incoming(row('a', '2026-08-18', 8), row('a', '2026-08-19', 7)),
      [{ employee_id: 'a', shift_date: '2026-08-18' }],
    );
    expect(writable).toHaveLength(1);
    expect(writable[0].shift_date).toBe('2026-08-19');
  });

  it('protects per EMPLOYEE, not per date', () => {
    // And correcting one person's Tuesday must not freeze everyone's Tuesday.
    const { writable } = partitionShifts(
      incoming(row('a', '2026-08-18', 8), row('b', '2026-08-18', 6)),
      [{ employee_id: 'b', shift_date: '2026-08-18' }],
    );
    expect(writable.map((r) => r.employee_id)).toEqual(['a']);
  });

  it('writes nothing when every incoming row is protected', () => {
    const { writable, protectedCount } = partitionShifts(
      incoming(row('a', '2026-08-18', 8)),
      [{ employee_id: 'a', shift_date: '2026-08-18' }],
    );
    expect(writable).toEqual([]);
    expect(protectedCount).toBe(1);
  });

  it('ignores protected rows outside the incoming window', () => {
    // The lookup is by date range, so it can return rows this sync is not
    // touching. Those must not inflate the protected count.
    const older: ProtectedShift[] = [{ employee_id: 'a', shift_date: '2026-01-01' }];
    const { writable, protectedCount } = partitionShifts(
      incoming(row('a', '2026-08-18', 8)),
      older,
    );
    expect(writable).toHaveLength(1);
    expect(protectedCount).toBe(0);
  });

  it('is a no-op on an empty sync', () => {
    const { writable, protectedCount } = partitionShifts(new Map<string, Row>(), [
      { employee_id: 'a', shift_date: '2026-08-18' },
    ]);
    expect(writable).toEqual([]);
    expect(protectedCount).toBe(0);
  });
});

describe('shiftKey', () => {
  it('distinguishes employee and date halves', () => {
    // A naive concatenation without a separator would collide on ids and dates
    // that run together.
    expect(shiftKey('a', '2026-08-18')).not.toBe(shiftKey('a2026', '-08-18'));
  });
});
