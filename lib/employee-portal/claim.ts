/**
 * Matching a typed name against the roster.
 *
 * Pure — no database, no clock.
 *
 * EXACT, NOT FUZZY. The sign-up form asks the person to type their own name
 * rather than showing a roster, because a join code ends up written on a
 * whiteboard and a list would turn it into a staff directory. That only holds
 * if matching is strict: a prefix or fuzzy match would let someone claim a
 * colleague by typing a common first name, which is the same leak by a slower
 * route.
 *
 * Ambiguity is its own answer, never a coin flip. Two Dave Ramoses is a real
 * situation in a bar, and picking one would hand a person another person's pay.
 */

export type ClaimCandidate = { id: string; name: string };

export type ClaimMatch =
  | { kind: 'one'; employeeId: string }
  | { kind: 'none' }
  | { kind: 'ambiguous' };

/** Case, surrounding space and doubled spaces cannot distinguish two people. */
export function normaliseName(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function matchEmployeeName(
  typed: string,
  roster: readonly ClaimCandidate[],
): ClaimMatch {
  const target = normaliseName(typed ?? '');
  if (target.length === 0) return { kind: 'none' };

  const hits = roster.filter((e) => normaliseName(e.name) === target);

  if (hits.length === 0) return { kind: 'none' };
  if (hits.length > 1)  return { kind: 'ambiguous' };
  return { kind: 'one', employeeId: hits[0].id };
}
