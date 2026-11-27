/**
 * Change against the prior period, stated only when it can be stated honestly.
 *
 * Pure. Shared by the weekly owner summary and (later) the Sales headline.
 *
 * Two ways a delta lies, both refused here: comparing a period with a night
 * missing against a full one (reads as a collapse), and a percent over a tiny
 * base ("up 4000%" on $2).
 */
import { addDays, shiftPeriod } from '@/lib/date-range';

/** Below this prior-period figure, dollars are shown and the percent is dropped. */
export const PERCENT_BASE_FLOOR = 100;

export type PeriodDelta =
  | { kind: 'incomplete' }
  | { kind: 'change'; amount: number; percent: number | null };

const cents = (n: number) => Math.round(n * 100) / 100 + 0; // + 0 turns -0 into 0

export function periodDelta(input: {
  current: number;
  prior: number;
  /** False when either period has a night the other lacks. */
  comparable: boolean;
  floor?: number;
}): PeriodDelta {
  if (!input.comparable) return { kind: 'incomplete' };
  const amount = cents(input.current - input.prior);
  const floor = input.floor ?? PERCENT_BASE_FLOOR;
  const percent = input.prior >= floor ? Math.round((amount / input.prior) * 100) : null;
  return { kind: 'change', amount, percent };
}

// ── Sales headline: which nights to compare ──────────────────────────────────

type Span = { start: string; end: string };
export type ComparisonWindows = { cur: Span; prior: Span };
export type SalesDay = { date: string; total: number };

const dayNo = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/**
 * The two spans to compare. A running period is cut to the nights already
 * finished and set against the SAME number of days from the start of the prior
 * period, so a half-month is never held against a whole one. Tonight is never
 * included: its Z report does not exist yet.
 *
 * Null when there is nothing finished to compare, or the period is in the future.
 */
export function comparisonWindows(
  view: 'week' | 'month', start: string, end: string, today: string,
): ComparisonWindows | null {
  const lastFinished = today <= end ? addDays(today, -1) : end;
  if (lastFinished < start) return null;
  const prior = shiftPeriod(view, start, end, 'prev');
  const len = dayNo(lastFinished) - dayNo(start) + 1;
  const priorEnd = addDays(prior.start, len - 1);
  return {
    cur: { start, end: lastFinished },
    prior: { start: prior.start, end: priorEnd < prior.end ? priorEnd : prior.end },
  };
}

/**
 * Z-report totals of two windows, as one delta. A night with a report on one
 * side only (same offset into each window) is a missing report, not a quiet
 * night: incomplete. A night with none on both sides is the bar being closed.
 * Windows of unequal length (a finished month against a longer one) are checked
 * over the shared offsets; the tail is summed but not checked.
 */
export function compareSales(w: ComparisonWindows, cur: SalesDay[], prior: SalesDay[]): PeriodDelta {
  const pick = (days: SalesDay[], s: Span) => {
    const m = new Map<number, number>();
    for (const d of days) if (d.date >= s.start && d.date <= s.end) m.set(dayNo(d.date) - dayNo(s.start), d.total);
    return m;
  };
  const c = pick(cur, w.cur);
  const p = pick(prior, w.prior);
  const shared = Math.min(dayNo(w.cur.end) - dayNo(w.cur.start), dayNo(w.prior.end) - dayNo(w.prior.start));
  let comparable = c.size > 0;
  for (let i = 0; i <= shared; i++) if (c.has(i) !== p.has(i)) comparable = false;
  const sum = (m: Map<number, number>) => [...m.values()].reduce((a, b) => a + b, 0);
  return periodDelta({ current: sum(c), prior: sum(p), comparable });
}
