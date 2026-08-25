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

/**
 * A bigger cut when more barbacks are on.
 *
 * A bar that runs one barback on a Tuesday and three on a Saturday is not
 * running the same arrangement on both nights: one person covering the whole
 * bar alone is worth more of the night than one of three sharing it. Before
 * this, the only way to say that was to edit the slider between shifts, which
 * nobody remembers to do and which silently re-prices every unreviewed night.
 *
 * `minCount` is a floor, not an exact match: the tier that applies is the
 * highest one whose `minCount` is at or below tonight's headcount, so the last
 * row means "this many or more" without a second field that can contradict it.
 *
 * `fraction`, not a percentage, because that is the unit splitBarbackTips
 * speaks. The conversion happens once, in the settings reader below, for the
 * same reason the pour conversion lives in one place: two units with the same
 * name is how a 15% cut becomes a 1500% one.
 */
export type BarbackTier = { minCount: number; fraction: number };

/**
 * Reads the tier table off org settings, or an empty list when there is none.
 *
 * Empty is the important return value: it means "no tier applies", and every
 * caller falls back to the flat `barback_tip_pct` slider. So a bar that never
 * touches this feature, a bar that half-configures it, and a bar that switches
 * it off all keep being paid exactly what they were paid yesterday.
 *
 * The toggle is checked rather than inferred from a non-empty list because
 * switching the feature off must not throw the table away — an operator who
 * turns tiers off for a week expects their rows to still be there after.
 */
export function barbackTiersFromSettings(settings: {
  barback_tiers_enabled?: boolean | null;
  barback_tip_tiers?: Array<{ minCount?: number | null; pct?: number | null }> | null;
}): BarbackTier[] {
  if (settings?.barback_tiers_enabled !== true) return [];

  const rows = Array.isArray(settings?.barback_tip_tiers) ? settings.barback_tip_tiers : [];
  const byCount = new Map<number, BarbackTier>();

  for (const row of rows) {
    const minCount = Math.floor(Number(row?.minCount));
    const pct = Number(row?.pct);

    // A tier for zero barbacks can never be reached — the cut is only taken
    // when somebody barbacked — and a row with no percentage says nothing.
    // Both are half-finished UI rows, not instructions to pay nothing.
    if (!Number.isFinite(minCount) || minCount < 1) continue;
    if (row?.pct === null || row?.pct === undefined || !Number.isFinite(pct)) continue;

    // Clamped like the flat slider: a hand-edited 140% must not hand the
    // barbacks more than the night took.
    byCount.set(minCount, { minCount, fraction: Math.min(100, Math.max(0, pct)) / 100 });
  }

  return [...byCount.values()].sort((a, b) => a.minCount - b.minCount);
}

/**
 * The cut for a night that `count` barbacks worked.
 *
 * Deliberately order-independent rather than trusting the list to be sorted:
 * this is called with tiers straight off a JSON settings column, and a row
 * order nobody can see is a poor thing to hang somebody's pay on.
 */
function fractionForBarbackCount(
  tiers: BarbackTier[],
  count: number,
  fallback: number,
): number {
  let match: BarbackTier | undefined;
  for (const tier of tiers) {
    if (tier.minCount <= count && (match === undefined || tier.minCount > match.minCount)) {
      match = tier;
    }
  }
  // No row covers this headcount — tiers that start at two say nothing about a
  // one-barback night. They still worked, so the flat slider pays them.
  return match ? match.fraction : fallback;
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
  /**
   * The cut actually taken, as a fraction — the tier that matched, or the flat
   * slider when none did. Returned so the screens can SHOW which rule applied
   * ("2 barbacks — 15%"); a tiered figure that appears without explanation is
   * indistinguishable from a miscalculation.
   *
   * Zero when nobody barbacked, because no cut was taken at all.
   */
  appliedFraction: number;
  /**
   * How many barbacks the tier was chosen on: distinct PEOPLE who worked, not
   * shifts. One person clocking a split shift is one barback, and a barback
   * removed from the shift is none.
   */
  barbackCount: number;
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
 * The SIZE of the cut is settled here too, not by the caller, because it can
 * depend on how many barbacks worked (see BarbackTier) and this is the only
 * place that knows — zero-hour shifts are dropped below, and the engine and the
 * Day Split screen would otherwise each have to re-derive the headcount and
 * agree. That is precisely the drift this file exists to prevent.
 *
 * The total is conserved: paid tips + poolTips always equals dailyTips, because
 * payroll has to reconcile against the Z report.
 */
export function splitBarbackTips(input: {
  dailyTips: number;
  /** The flat cut. Used when no tier matches tonight's headcount. */
  barbackFraction: number;
  barbackShifts: BarbackShift[];
  method?: BarbackSplitMethod;
  /** Headcount tiers, if the bar runs them. Empty means the flat cut always. */
  tiers?: BarbackTier[];
}): BarbackSplit {
  const { dailyTips, barbackFraction } = input;
  const method = input.method ?? 'hours';
  const tiers = input.tiers ?? [];
  const tipsByEmployee = new Map<string, number>();

  // A zeroed shift is not a slot. Dropping it here rather than skipping it in
  // the loop matters: a removed barback must not shrink the share of the ones
  // who did work — nor count toward the tier that sizes the cut.
  const barbackShifts = input.barbackShifts.filter((s) => s.hours === undefined || s.hours > 0);

  // Distinct people, not shifts. A barback who clocks out for a break and back
  // in is two rows and one barback, and counting rows would push a quiet
  // Tuesday onto the two-barback tier.
  const barbackCount = new Set(barbackShifts.map((s) => s.employeeId)).size;

  // No barback worked, so there is no cut to take and the pool is the night.
  if (barbackShifts.length === 0) {
    return {
      tipsByEmployee,
      poolTips: dailyTips,
      returnedToPool: 0,
      appliedFraction: 0,
      barbackCount: 0,
    };
  }

  // Hourly barbacks are counted in the headcount on purpose, exactly as they
  // hold a slot below. Excluding them would shrink the cut AND hand back their
  // share — charging the bar's other barbacks twice for one person's deal.
  const appliedFraction = fractionForBarbackCount(tiers, barbackCount, barbackFraction);
  const barbackCut = dailyTips * appliedFraction;

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
    appliedFraction,
    barbackCount,
  };
}
