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
  /** Shares the barback pool, equally by headcount. */
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
