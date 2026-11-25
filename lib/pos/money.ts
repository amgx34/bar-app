/**
 * Provider money is carried as integer cents and only turned into dollars at
 * the edge. Summing dollars as floats drifts (0.1 + 0.2), and a Z total that is
 * a cent off a printed Z reads as a bug to the bar.
 */

export function toCents(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export function sumCents(values: readonly number[]): number {
  let t = 0;
  for (const v of values) t += v;
  return t;
}

export function centsToDollars(c: number): number {
  return Number((c / 100).toFixed(2));
}
