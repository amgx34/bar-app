/**
 * What a night paid per hour on the floor.
 *
 * Pure — no database, no clock.
 *
 * A rate, not a total, is the figure that survives comparison between a
 * four-hour Tuesday and a ten-hour Saturday. It lives here rather than inline
 * in either caller because the Sales screen and the nightly `tips.hourly` alert
 * must never disagree about it: an operator who reads "$30/hr" on their phone
 * and "$28/hr" on the night's page has been given two facts and can trust
 * neither.
 *
 * Null has one meaning throughout: the rate cannot honestly be stated. That
 * covers no hours recorded (a rate with no denominator is not a large number,
 * it is an unanswerable question) and no tips recorded at all — which is far
 * more often a jar count nobody has entered yet than a room that tipped
 * nothing, and "$0/hr" reads as an accusation either way.
 */

/** Reads a stored money figure. Anything unusable is nothing, never NaN. */
function amount(raw: number | null | undefined): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function tipsPerHour(
  cashTips: number | null | undefined,
  cardTips: number | null | undefined,
  hoursWorked: number,
): number | null {
  if (!Number.isFinite(hoursWorked) || hoursWorked <= 0) return null;

  const tips = amount(cashTips) + amount(cardTips);
  if (tips <= 0) return null;

  return Math.round((tips / hoursWorked) * 100) / 100;
}
