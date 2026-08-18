/**
 * State base sales tax rates, used to SUGGEST a starting point — never to set one.
 *
 * WHY THIS IS ONLY A SUGGESTION
 *
 * The rate a bar actually charges is almost never the state base rate:
 *
 *   - Counties and cities stack on top. Illinois is 6.25% at state level, but a
 *     bar in Chicago collects about 10.25% once Cook County and the city are
 *     added. Presetting 6.25% there would understate the tax by four points and
 *     overstate profit by the same amount — while looking perfectly reasonable.
 *
 *   - Several states tax alcohol served on-premise separately and at much
 *     higher rates. See ALCOHOL_TAX_NOTES.
 *
 *   - Rates change, and this table does not.
 *
 * So this exists to save typing and to point somebody at roughly the right
 * number, with the local portion clearly flagged as missing. The value stored in
 * settings is always one a person confirmed.
 *
 * Figures are STATE BASE rates as of the date below. Verify against an actual
 * receipt or Z report before relying on any of it.
 */

export const RATES_AS_OF = '2025-01-01';

/** State base rate only. Local (county/city) additions are NOT included. */
export const STATE_BASE_RATES: Record<string, number> = {
  AL: 4.0,   AK: 0.0,   AZ: 5.6,   AR: 6.5,   CA: 7.25,
  CO: 2.9,   CT: 6.35,  DE: 0.0,   DC: 6.0,   FL: 6.0,
  GA: 4.0,   HI: 4.0,   ID: 6.0,   IL: 6.25,  IN: 7.0,
  IA: 6.0,   KS: 6.5,   KY: 6.0,   LA: 5.0,   ME: 5.5,
  MD: 6.0,   MA: 6.25,  MI: 6.0,   MN: 6.875, MS: 7.0,
  MO: 4.225, MT: 0.0,   NE: 5.5,   NV: 6.85,  NH: 0.0,
  NJ: 6.625, NM: 4.875, NY: 4.0,   NC: 4.75,  ND: 5.0,
  OH: 5.75,  OK: 4.5,   OR: 0.0,   PA: 6.0,   RI: 7.0,
  SC: 6.0,   SD: 4.2,   TN: 7.0,   TX: 6.25,  UT: 6.1,
  VT: 6.0,   VA: 5.3,   WA: 6.5,   WV: 6.0,   WI: 5.0,
  WY: 4.0,
};

/**
 * States where a bar's liability is materially different from the general rate.
 *
 * Not exhaustive, and deliberately worded as a prompt to check rather than as an
 * authoritative figure — the point is to stop somebody accepting a 7% suggestion
 * in a state where they are actually remitting far more.
 */
export const ALCOHOL_TAX_NOTES: Record<string, string> = {
  TN: 'Tennessee charges a separate liquor-by-the-drink tax (commonly 15%) on top of sales tax for on-premise alcohol.',
  TX: 'Texas taxes mixed beverages separately — a mixed beverage sales tax plus a gross receipts tax the bar pays itself.',
  WA: 'Washington adds a spirits sales tax and a per-litre spirits liter tax on top of retail sales tax.',
  AK: 'Alaska has no state sales tax, but many boroughs and cities levy their own — including on alcohol.',
  DE: 'Delaware has no sales tax, but does levy a gross receipts tax on businesses.',
  MT: 'Montana has no general sales tax; some resort areas levy a local option tax that can apply to alcohol.',
  NH: 'New Hampshire has no sales tax but levies a meals and rooms tax that applies to alcohol served on-premise.',
  OR: 'Oregon has no sales tax; alcohol is taxed at the distributor level instead.',
};

/**
 * Cities where the combined rate is far enough above the state base that
 * accepting the base alone would be a significant error. Illustrative, not a
 * lookup table — the message is always "add your local portion".
 */
export const NOTABLE_LOCAL_RATES: Record<string, { city: string; approx: number }[]> = {
  IL: [{ city: 'Chicago', approx: 10.25 }],
  CA: [{ city: 'Los Angeles', approx: 9.5 }, { city: 'San Francisco', approx: 8.625 }],
  NY: [{ city: 'New York City', approx: 8.875 }],
  CO: [{ city: 'Denver', approx: 8.81 }],
  WA: [{ city: 'Seattle', approx: 10.35 }],
  AZ: [{ city: 'Phoenix', approx: 8.6 }],
  MO: [{ city: 'St. Louis', approx: 9.679 }],
  LA: [{ city: 'New Orleans', approx: 9.45 }],
};

export type TaxSuggestion = {
  state: string;
  /** State base rate. Local tax is on top of this. */
  baseRate: number;
  /** Plain-language explanation shown next to the suggestion. */
  note: string;
  /** A specific warning where the state taxes alcohol differently. */
  alcoholNote: string | null;
  /** An example combined rate in a major city, when one is worth showing. */
  localExample: { city: string; approx: number } | null;
};

/**
 * Builds a suggestion for a state, or null when there is nothing useful to say.
 *
 * Returns the BASE rate and says so. Callers must present it as a starting
 * point that needs the local portion added, never as the answer.
 */
export function suggestTaxRate(
  stateCode: string | null | undefined,
  city?: string | null,
): TaxSuggestion | null {
  if (!stateCode) return null;

  const state = stateCode.trim().toUpperCase();
  const baseRate = STATE_BASE_RATES[state];
  if (baseRate === undefined) return null;

  const examples = NOTABLE_LOCAL_RATES[state] ?? [];
  const matchedCity = city
    ? examples.find((e) => e.city.toLowerCase() === city.trim().toLowerCase())
    : undefined;
  const localExample = matchedCity ?? examples[0] ?? null;

  const note =
    baseRate === 0
      ? `${state} has no state sales tax. Any tax you collect is local, so enter the rate from your own receipts.`
      : `${state} state base rate is ${baseRate}%. County and city tax is added on top of this, so your actual rate is usually higher.`;

  return {
    state,
    baseRate,
    note,
    alcoholNote: ALCOHOL_TAX_NOTES[state] ?? null,
    localExample,
  };
}
