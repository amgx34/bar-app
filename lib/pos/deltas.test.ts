import { describe, it, expect } from 'vitest';
import { periodDelta, PERCENT_BASE_FLOOR, comparisonWindows, compareSales } from './deltas';

describe('periodDelta', () => {
  it('says incomplete, never a change, when the periods cannot be compared', () => {
    expect(periodDelta({ current: 100, prior: 5000, comparable: false })).toEqual({ kind: 'incomplete' });
  });

  it('reports the dollar change and a whole percent', () => {
    expect(periodDelta({ current: 10800, prior: 10000, comparable: true }))
      .toEqual({ kind: 'change', amount: 800, percent: 8 });
  });

  it('reports a fall as negative', () => {
    expect(periodDelta({ current: 9000, prior: 10000, comparable: true }))
      .toEqual({ kind: 'change', amount: -1000, percent: -10 });
  });

  it('suppresses the percent when the base is below the floor', () => {
    const d = periodDelta({ current: 80, prior: PERCENT_BASE_FLOOR - 1, comparable: true });
    expect(d).toMatchObject({ kind: 'change', percent: null });
  });

  it('never divides by zero', () => {
    expect(periodDelta({ current: 500, prior: 0, comparable: true }))
      .toEqual({ kind: 'change', amount: 500, percent: null });
  });

  it('rounds money to cents so float noise cannot show as a change', () => {
    const d = periodDelta({ current: 0.3, prior: 0.1 + 0.2, comparable: true });
    expect(d).toMatchObject({ kind: 'change', amount: 0 });
  });
});

describe('comparisonWindows', () => {
  it('compares a finished week with the whole week before', () => {
    expect(comparisonWindows('week', '2026-11-16', '2026-11-22', '2026-11-25')).toEqual({
      cur: { start: '2026-11-16', end: '2026-11-22' },
      prior: { start: '2026-11-09', end: '2026-11-15' },
    });
  });

  it('compares a running week only over the nights already finished', () => {
    // Wed 25 Nov: Mon and Tue are finished. Tonight is not compared.
    expect(comparisonWindows('week', '2026-11-23', '2026-11-29', '2026-11-25')).toEqual({
      cur: { start: '2026-11-23', end: '2026-11-24' },
      prior: { start: '2026-11-16', end: '2026-11-17' },
    });
  });

  it('compares a running month with the same days of the month before', () => {
    expect(comparisonWindows('month', '2026-11-01', '2026-11-30', '2026-11-10')).toEqual({
      cur: { start: '2026-11-01', end: '2026-11-09' },
      prior: { start: '2026-10-01', end: '2026-10-09' },
    });
  });

  it('has nothing to compare before the first night is finished', () => {
    expect(comparisonWindows('week', '2026-11-23', '2026-11-29', '2026-11-23')).toBeNull();
    expect(comparisonWindows('week', '2026-12-07', '2026-12-13', '2026-11-25')).toBeNull();
  });
});

describe('compareSales', () => {
  const w = {
    cur: { start: '2026-11-16', end: '2026-11-18' },
    prior: { start: '2026-11-09', end: '2026-11-11' },
  };
  const day = (date: string, total: number) => ({ date, total });

  it('sums each window and reports the change', () => {
    const cur = [day('2026-11-16', 600), day('2026-11-17', 700), day('2026-11-18', 800)];
    const prior = [day('2026-11-09', 500), day('2026-11-10', 700), day('2026-11-11', 800)];
    expect(compareSales(w, cur, prior)).toEqual({ kind: 'change', amount: 100, percent: 5 });
  });

  it('says incomplete when a Z report is missing from either window', () => {
    const cur = [day('2026-11-16', 600), day('2026-11-18', 800)];
    const prior = [day('2026-11-09', 500), day('2026-11-10', 700), day('2026-11-11', 800)];
    expect(compareSales(w, cur, prior)).toEqual({ kind: 'incomplete' });
    expect(compareSales(w, prior.map((d, i) => day(`2026-11-1${6 + i}`, d.total)), prior.slice(1)))
      .toEqual({ kind: 'incomplete' });
  });

  it('is incomplete, not a drop, when there is no current data at all', () => {
    expect(compareSales(w, [], [day('2026-11-09', 500)])).toEqual({ kind: 'incomplete' });
  });

  it('a night closed in both windows is not a gap', () => {
    const cur = [day('2026-11-16', 600), day('2026-11-18', 800)];
    const prior = [day('2026-11-09', 500), day('2026-11-11', 800)];
    expect(compareSales(w, cur, prior)).toMatchObject({ kind: 'change', amount: 100 });
  });

  it('ignores rows outside the windows', () => {
    const cur = [day('2026-11-16', 600), day('2026-11-17', 100), day('2026-11-18', 100), day('2026-11-20', 9999)];
    const prior = [day('2026-11-09', 600), day('2026-11-10', 100), day('2026-11-11', 100), day('2026-11-01', 9999)];
    expect(compareSales(w, cur, prior)).toMatchObject({ kind: 'change', amount: 0 });
  });

  it('never divides by a zero prior', () => {
    const cur = [day('2026-11-16', 300)];
    const prior = [day('2026-11-09', 0)];
    expect(compareSales(w, cur, prior)).toEqual({ kind: 'change', amount: 300, percent: null });
  });
});
