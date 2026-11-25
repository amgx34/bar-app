import { describe, it, expect } from 'vitest';
import { periodDelta, PERCENT_BASE_FLOOR } from './deltas';

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
