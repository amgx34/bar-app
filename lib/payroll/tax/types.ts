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
   * silently decide what comes out of a paycheck. The engine computes from
   * any table (so it stays testable); refusing to display or snapshot a
   * withholding derived from a placeholder table belongs at the UI boundary.
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
};

/**
 * Four outcomes, three of which produce the same zero. They are kept distinct
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
  uncollected: {
    federalIncome:  number;
    socialSecurity: number;
    medicare:       number;
    state:          number;
    total:          number;
  };
  notes: string[];
};
