// lib/payroll/tax/withholding.ts
import type { EmployeeTaxProfile, OrgTaxConfig, Withholding, WithholdingStatus } from './types';
import { tablesFor } from './tables';
import { computeFica } from './fica';
import { computeFederalIncome } from './federal';

function none(status: WithholdingStatus, notes: string[] = []): Withholding {
  return {
    status,
    federalIncome: 0, socialSecurity: 0, medicare: 0,
    additionalMedicare: 0, state: 0, total: 0,
    uncollected: { federalIncome: 0, socialSecurity: 0, medicare: 0, state: 0, total: 0 },
    notes,
  };
}

/**
 * What to withhold from one person for one pay period.
 *
 * Pure. The caller supplies the gross, the year-to-date wages, and crucially
 * `availableToWithhold` — which in a bar is NOT the gross, because cash tips an
 * employee already walked out with cannot be withheld from.
 */
export function computeWithholding(input: {
  grossForPeriod: number;
  availableToWithhold: number;
  ytdWages: number;
  profile: EmployeeTaxProfile;
  config: OrgTaxConfig;
  taxYear: number;
}): Withholding {
  const { profile, config } = input;

  if (!config.enabled) return none('not_taxed', ['Tax withholding is off for this bar.']);

  // Unclassified is NOT a contractor. Same zero, different meaning: one is a
  // decision somebody made, the other is a question nobody has answered.
  if (profile.classification === null) {
    return none('unclassified', ['No W-2 / 1099 classification set for this employee.']);
  }
  if (profile.classification === 'contractor_1099') return none('not_taxed');

  // Throws on a year with no table. Deliberate — see tablesFor. Checked before
  // the zero-gross exit so a missing table is never hidden by a quiet period.
  const tables = tablesFor(input.taxYear);

  // Exempt claims no federal income tax, but FICA is still owed, so the status
  // is its own value and the computation below still runs.
  const status: WithholdingStatus = profile.exempt ? 'exempt' : 'withheld';

  const gross     = Math.max(0, input.grossForPeriod);
  const available = Math.max(0, input.availableToWithhold);

  // No pay, no withholding. Without this exit the W-4 Step 4(c) extra amount,
  // which is a flat per-period figure, would be withheld from a correction
  // period or a person who worked no hours.
  if (gross === 0) return none(status);

  const fica    = computeFica({ grossForPeriod: gross, ytdWages: input.ytdWages, tables });
  // A negative extra-withholding entry must not turn into a refund.
  const federal = Math.max(0, computeFederalIncome({
    grossForPeriod: gross, profile, payFrequency: config.payFrequency, tables,
  }));
  const state = config.stateEnabled
    ? gross * (Math.min(100, Math.max(0, config.stateRate)) / 100)
    : 0;

  // Owed, in the order they come out when there is not enough to go round.
  const owed = [
    { key: 'socialSecurity', amount: fica.socialSecurity },
    { key: 'medicare',       amount: fica.medicare + fica.additionalMedicare },
    { key: 'federalIncome',  amount: federal },
    { key: 'state',          amount: state },
  ] as const;

  let remaining = available;
  const taken: Record<string, number> = {};
  const short: Record<string, number> = {};

  for (const { key, amount } of owed) {
    const take = Math.min(remaining, amount);
    taken[key] = take;
    short[key] = amount - take;
    remaining -= take;
  }

  // Additional Medicare rides with Medicare through the shortfall ordering,
  // then is reported separately because it is a different line on a W-2.
  const plainMedicare = Math.min(taken.medicare, fica.medicare);
  const addlMedicare  = taken.medicare - plainMedicare;

  const total = taken.socialSecurity + taken.medicare + taken.federalIncome + taken.state;
  const uncollectedTotal =
    short.socialSecurity + short.medicare + short.federalIncome + short.state;

  const notes: string[] = [];
  if (uncollectedTotal > 0.005) {
    notes.push(
      'Withholding exceeded the pay available to withhold from. The shortfall is recorded.',
    );
  }

  return {
    status,
    federalIncome:      taken.federalIncome,
    socialSecurity:     taken.socialSecurity,
    medicare:           plainMedicare,
    additionalMedicare: addlMedicare,
    state:              taken.state,
    total,
    uncollected: {
      federalIncome:  short.federalIncome,
      socialSecurity: short.socialSecurity,
      medicare:       short.medicare,
      state:          short.state,
      total:          uncollectedTotal,
    },
    notes,
  };
}
