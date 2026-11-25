/**
 * Change against the prior period, stated only when it can be stated honestly.
 *
 * Pure. Shared by the weekly owner summary and (later) the Sales headline.
 *
 * Two ways a delta lies, both refused here: comparing a period with a night
 * missing against a full one (reads as a collapse), and a percent over a tiny
 * base ("up 4000%" on $2).
 */

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
