// lib/payroll/tax/types.ts

/** The three statuses Pub 15-T's percentage-method tables are built around. */
export type FilingStatus = 'single' | 'married_jointly' | 'head_of_household';

export type PayFrequency = 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';

export type TaxClassification = 'w2' | 'contractor_1099';

/**
 * One row of a percentage-method table: tax is `base` plus `rate` of the amount
 * over `floor`. The top bracket has no ceiling.
 */
export type TaxBracket = {
  floor: number;
  base:  number;
  rate:  number;
};

/**
 * One year's federal figures. Two bracket sets per filing status: `standard`
 * for a W-4 with Step 2 unchecked, `step2` for one with it checked.
 */
export type TaxTables = {
  year: number;
  /**
   * True when the figures in this table were NOT transcribed from the IRS
   * publication and are stand-ins. It travels with the data, rather than
   * living in a side export, so that whoever receives the tables from
   * `tablesFor()` can see they are fake: a table nobody transcribed must not
   * silently decide what comes out of a paycheck.
   *
   * THREE READERS GUARD IT, each at a different door:
   *  - `tablesStatus` (ui.ts) turns the flag into a usable/unusable verdict.
   *    `orgTaxPatchError` uses it to refuse switching withholding ON, and
   *    `computeRunWithholding` (run-withholding.ts) uses it to return
   *    `unusable` instead of computing, so the review screen and the
   *    snapshot never carry a figure from a placeholder table.
   *  - `resolveTables` (app/tax/actions.ts) refuses to show FICA figures on
   *    the tax report from a placeholder year.
   * The engine itself (`computeWithholding`) still computes from ANY table it
   * is handed and does not read the flag: the guard lives in those callers,
   * so a new caller that bypasses `tablesStatus` is unguarded.
   */
  placeholder: boolean;
  federal: {
    standard: Record<FilingStatus, TaxBracket[]>;
    step2:    Record<FilingStatus, TaxBracket[]>;
    /** Worksheet 1A line 1g, subtracted when Step 2 is NOT checked. */
    standardDeduction: Record<FilingStatus, number>;
  };
  fica: {
    socialSecurityRate:         number;
    socialSecurityWageBase:     number;
    medicareRate:               number;
    additionalMedicareRate:     number;
    additionalMedicareThreshold: number;
  };
};

/** A person's tax situation, read off the employees row. */
export type EmployeeTaxProfile = {
  classification: TaxClassification | null;
  filingStatus:   FilingStatus | null;
  multipleJobs:   boolean | null;
  dependentsAmount: number | null;
  otherIncome:    number | null;
  deductions:     number | null;
  extraWithholding: number | null;
  exempt:         boolean | null;
};

export type OrgTaxConfig = {
  enabled:      boolean;
  payFrequency: PayFrequency;
  stateEnabled: boolean;
  stateRate:    number;
  /**
   * True when tips are paid out on the paycheque, so the employer controls that
   * money and all of a person's pay is available to withhold from. False when
   * tips are cashed out nightly and are already gone by payday.
   *
   * DEFAULTS FALSE, deliberately. Wrongly assuming "cashed out" understates what
   * is available and raises a spurious shortfall: loud, visible, somebody asks.
   * Wrongly assuming "on the cheque" overstates it and MISSES a shortfall:
   * silent, and it would overdraw once net pay ships. Fail loudly, the same
   * principle as tablesFor throwing instead of falling back.
   */
  tipsPaidOnCheque: boolean;
};

/**
 * Five outcomes, three of which produce the same zero. They are kept distinct
 * because each answers a different question and the UI treats them differently:
 *  - `withheld`     taxes were computed and taken.
 *  - `exempt`       the employee claimed W-4 exemption: no federal income tax,
 *                   FICA still withheld.
 *  - `not_taxed`    a decision about a person: a 1099 contractor.
 *  - `unclassified` a question nobody has answered: no W-2/1099 set.
 *  - `disabled`     a decision about the bar: tax is not switched on. Reporting
 *                   this as `not_taxed` would read as "everyone is a contractor".
 */
export type WithholdingStatus =
  | 'withheld'
  | 'exempt'
  | 'not_taxed'
  | 'unclassified'
  | 'disabled';

export type Withholding = {
  status: WithholdingStatus;
  federalIncome:      number;
  socialSecurity:     number;
  medicare:           number;
  additionalMedicare: number;
  state:              number;
  total:              number;
  /**
   * What was owed but could not be taken, per tax. Split the same way the
   * taken side is split — Additional Medicare has its own field because it is
   * a distinct, employee-only tax on its own W-2/Form 8959 line, so folding
   * its shortfall into `medicare` would misattribute it on the very report
   * these figures exist to feed. `total` is the sum of all five.
   */
  uncollected: {
    federalIncome:      number;
    socialSecurity:     number;
    medicare:           number;
    additionalMedicare: number;
    state:              number;
    total:              number;
  };
  notes: string[];
};
