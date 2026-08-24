/**
 * Who shares a night's tips, and in what proportion.
 *
 * Pure — no database, no clock.
 *
 * WHY THIS EXISTS
 *
 * These rules were written twice: once in the payroll engine, which decides what
 * people are actually paid, and once in the Day Split screen, which shows them
 * what they will get. The two drifted, and every divergence favoured the screen
 * being wrong in a way nobody could see:
 *
 *   - the barback cut is a 0-50% slider in Settings; Day Split hardcoded 15%
 *   - the opener bonus is four configurable modes; Day Split hardcoded 5%
 *   - the engine pays only `tip_mode = 'pool'` staff, and excludes security and
 *     managers; Day Split counted everyone who was not literally named
 *     "front door"
 *
 * So a manager on the floor, or anyone set to Not Tipped, diluted the preview
 * without appearing anywhere in the pay run. Both sides now call this file.
 */

/** How an employee participates in the nightly pool. */
export type TipRole =
  /** Shares the bartender pool, by hours worked. */
  | 'pool'
  /** Shares the barback cut — by hours by default, see BarbackSplitMethod. */
  | 'barback'
  /** Takes no part in the nightly pool at all. */
  | 'none';

export type TipParticipant = {
  /** `employees.role` — bartender, barback, security, manager, … */
  role: string | null;
  /** `employees.tip_mode` — pool, barback, individual, sales_pct, no_tip. */
  tipMode: string | null;
};

/** Roles that never draw from the nightly pool, whatever their tip mode says. */
const NON_POOL_ROLES = new Set(['security', 'manager']);

/**
 * Which pool an employee draws from on a given night.
 *
 * Order matters. `no_tip` wins over everything — it is the switch for somebody
 * who is on the schedule but explicitly outside the tip arrangement, and
 * checking it last would let a barback-roled employee collect anyway.
 *
 * Barback is decided before pool because the two are expressed differently by
 * different bars: some set the ROLE to barback, others leave the role blank and
 * set the tip MODE. Both mean the same thing and both must work.
 */
export function classifyTipRole(emp: TipParticipant): TipRole {
  const role = emp.role?.trim().toLowerCase() || null;
  const mode = emp.tipMode?.trim().toLowerCase() || null;

  if (mode === 'no_tip') return 'none';

  if (role === 'barback' || mode === 'barback') return 'barback';

  // Anything other than 'pool' — individual, sales_pct, or an unrecognised
  // value — is paid some other way and must not dilute the pool.
  if (mode !== 'pool') return 'none';

  if (role !== null && NON_POOL_ROLES.has(role)) return 'none';

  return 'pool';
}

/**
 * Plain-English reason somebody is not in the split, for showing on the row.
 *
 * Returns null when they ARE in it. An excluded person shown without a reason
 * reads as a bug in the calculator, which is how "why am I not on this list"
 * becomes a conversation instead of a glance.
 */
export function tipExclusionReason(emp: TipParticipant): string | null {
  if (classifyTipRole(emp) !== 'none') return null;

  const role = emp.role?.trim().toLowerCase() || null;
  const mode = emp.tipMode?.trim().toLowerCase() || null;

  if (mode === 'no_tip') return 'Set to Not Tipped';
  if (mode === 'individual') return 'Keeps their own tips';
  if (mode === 'sales_pct') return 'Paid a percentage of sales';
  if (role !== null && NON_POOL_ROLES.has(role)) {
    return `${role[0].toUpperCase()}${role.slice(1)} — not in the tip pool`;
  }
  return 'Not in the tip pool';
}

/** The barback share of a night's tips, as a fraction. Clamped to the slider's range. */
export function barbackFractionFromSettings(settings: {
  barback_tip_pct?: number | null;
}): number {
  // Mirrors the engine's clamp exactly. The Settings slider caps at 50, but the
  // stored value is not re-validated on read, so a hand-edited row could carry
  // anything.
  const pct = Math.min(100, Math.max(0, Number(settings?.barback_tip_pct ?? 15)));
  return pct / 100;
}

/**
 * How a barback is compensated for the night.
 *
 * `percentage` is the historical arrangement and stays the default: they draw a
 * share of the barback cut on top of their hourly wage. `hourly` means the wage
 * is the whole deal — they take no part of the tip pool.
 */
export type BarbackPayType = 'percentage' | 'hourly';

/**
 * Reads `employees.pay_type` defensively.
 *
 * Anything that is not literally 'hourly' means percentage. That direction is
 * deliberate: the column was added after these rows existed, so NULL is the
 * common case and must mean "unchanged". A typo must not silently stop paying
 * somebody their tips.
 */
export function normalizePayType(raw: string | null | undefined): BarbackPayType {
  return raw?.trim().toLowerCase() === 'hourly' ? 'hourly' : 'percentage';
}

/**
 * How the barback cut is divided between the barbacks who worked.
 *
 * 'hours' matches the bartender pool: somebody who worked eight hours takes
 * four times what somebody who worked two did. This is the default because
 * splitting one pool by hours and the other by headcount meant two people on
 * the same night were paid on different principles, and the barback who came in
 * for the last hour of a Saturday took the same cut as the one who set up.
 *
 * 'equal' is the older behaviour, kept because some bars genuinely run it that
 * way — a fixed nightly tip-out per barback regardless of length of shift.
 */
export type BarbackSplitMethod = 'hours' | 'equal';

/** Reads the org setting. Anything unrecognised means the default. */
export function barbackSplitFromSettings(settings: {
  barback_split_method?: string | null;
}): BarbackSplitMethod {
  return settings?.barback_split_method === 'equal' ? 'equal' : 'hours';
}

export type BarbackShift = {
  employeeId: string;
  payType: BarbackPayType;
  /**
   * Hours worked on the night. Optional: `undefined` means nobody recorded any,
   * which is not the same as a deliberate zero and must still be paid.
   *
   * An explicit 0 is how "Remove from shift" marks somebody as not having
   * worked — it zeroes the hours rather than deleting the row. The barback cut
   * splits by HEADCOUNT, so without checking this a barback logged as not
   * working still collected a full share, while a bartender in the same state
   * correctly collected nothing because their pool is hours-weighted.
   */
  hours?: number;
};

export type BarbackSplit = {
  /** Tips owed out of the barback cut, by employee. Only percentage barbacks appear. */
  tipsByEmployee: Map<string, number>;
  /** What is left for the bartender pool once the barback cut is taken. */
  poolTips: number;
  /** Part of the barback cut nobody claimed, because they are on hourly. */
  returnedToPool: number;
};

/**
 * Divides a night's tips between the barback cut and the bartender pool.
 *
 * EVERY barback shift holds a slot, whether or not that barback takes tips.
 * Only percentage barbacks are paid theirs; an hourly barback's slot goes back
 * to the bartenders.
 *
 * That is the whole subtlety. The obvious implementation — filter the hourly
 * barbacks out and divide by who is left — pays the remaining barback the FULL
 * cut, so a bar that moves one of its two barbacks onto hourly ends up paying
 * that person a wage AND handing the other barback double. Sizing the slots by
 * headcount first makes moving somebody to hourly cost the bar nothing extra
 * and cost the other barback nothing at all.
 *
 * The total is conserved: paid tips + poolTips always equals dailyTips, because
 * payroll has to reconcile against the Z report.
 */
export function splitBarbackTips(input: {
  dailyTips: number;
  barbackFraction: number;
  barbackShifts: BarbackShift[];
  method?: BarbackSplitMethod;
}): BarbackSplit {
  const { dailyTips, barbackFraction } = input;
  const method = input.method ?? 'hours';
  const tipsByEmployee = new Map<string, number>();

  // A zeroed shift is not a slot. Dropping it here rather than skipping it in
  // the loop matters: a removed barback must not shrink the share of the ones
  // who did work.
  const barbackShifts = input.barbackShifts.filter((s) => s.hours === undefined || s.hours > 0);

  // No barback worked, so there is no cut to take and the pool is the night.
  if (barbackShifts.length === 0) {
    return { tipsByEmployee, poolTips: dailyTips, returnedToPool: 0 };
  }

  const barbackCut = dailyTips * barbackFraction;

  // Each shift's claim on the cut. By hours, that is its share of the hours all
  // the barbacks worked; equally, it is one slot each.
  //
  // The total hours include HOURLY barbacks' shifts on purpose. They hold their
  // slot without claiming it, which is what stops moving one barback to a wage
  // from enlarging everybody else — see the class comment above.
  const totalHours = barbackShifts.reduce((t, s) => t + (Number(s.hours) || 0), 0);

  // Weighting by hours is impossible when none were recorded. Paying nobody
  // would be the wrong answer — they worked, the hours simply were not entered
  // — so fall back to an equal split rather than returning the cut to the bar.
  const byHours = method === 'hours' && totalHours > 0;

  let paid = 0;
  for (const shift of barbackShifts) {
    const claim = byHours
      ? ((Number(shift.hours) || 0) / totalHours) * barbackCut
      : barbackCut / barbackShifts.length;

    if (shift.payType === 'hourly') continue;

    // `+=`, not `set`: a split shift is two rows for the same person and they
    // hold both claims.
    tipsByEmployee.set(shift.employeeId, (tipsByEmployee.get(shift.employeeId) ?? 0) + claim);
    paid += claim;
  }

  const returnedToPool = barbackCut - paid;
  return {
    tipsByEmployee,
    poolTips: dailyTips - paid,
    returnedToPool,
  };
}
