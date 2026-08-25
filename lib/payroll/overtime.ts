/**
 * How overtime hours are paid.
 *
 * Pure — no database, no clock.
 *
 * The engine hardcoded `overtimeHours * rate * 1.5`, which is the federal FLSA
 * premium and is right for most bars — but not all of them. Some pay a flat
 * rate for every hour and settle overtime another way; a few states and some
 * union agreements use a different multiplier.
 *
 * WHAT "OFF" MEANS
 *
 * Off does NOT mean the hours go unpaid. They are still worked hours and are
 * still paid — at the base rate rather than a premium. Dropping them entirely
 * would be wage theft, and it would also silently change what `totalHours`
 * means everywhere else in the pay run.
 */

export type OvertimeConfig = {
  /** When false, overtime hours are paid at the base rate rather than a premium. */
  enabled: boolean;
  /** Premium multiplier. Only meaningful when `enabled`. */
  multiplier: number;
};

/** Federal FLSA time-and-a-half, and what the engine did before this existed. */
export const DEFAULT_OVERTIME_MULTIPLIER = 1.5;

/**
 * Reads the org's overtime settings.
 *
 * Defaults to ENABLED at 1.5x, because that is what every existing pay run
 * already did. A bar that has never opened this setting must not have its
 * overtime quietly reduced by a migration.
 */
export function overtimeFromSettings(settings: {
  overtime_enabled?: boolean | null;
  overtime_multiplier?: number | null;
}): OvertimeConfig {
  // Only an explicit `false` disables it. Null and undefined are "never
  // configured", which has to keep meaning time-and-a-half.
  const enabled = settings?.overtime_enabled !== false;

  const raw = Number(settings?.overtime_multiplier);
  // Clamped at 1: a multiplier below 1 would pay overtime LESS than normal
  // hours, which is never a legitimate arrangement and is far more likely a
  // typo or a percentage entered as a decimal.
  const multiplier =
    Number.isFinite(raw) && raw >= 1 ? Math.min(raw, 5) : DEFAULT_OVERTIME_MULTIPLIER;

  return { enabled, multiplier };
}

/**
 * What a block of overtime hours is worth.
 *
 * Returns the FULL pay for those hours, not the premium on top — the engine
 * adds this to regular pay, and regular pay counts only regular hours.
 */
export function overtimePay(hours: number, rate: number, cfg: OvertimeConfig): number {
  const h = Number(hours);
  const r = Number(rate);
  if (!Number.isFinite(h) || !Number.isFinite(r) || h <= 0 || r <= 0) return 0;

  return h * r * (cfg.enabled ? cfg.multiplier : 1);
}

/** Plain-English summary for the settings screen. */
export function describeOvertime(cfg: OvertimeConfig): string {
  return cfg.enabled
    ? `Overtime hours are paid at ${cfg.multiplier}x the base rate.`
    : 'Overtime hours are paid at the base rate, with no premium.';
}

/**
 * Hours past this in a single workweek are overtime. Federal FLSA.
 *
 * A WEEK, not a day. Bar shifts do not fit an eight-hour day — a close runs
 * past midnight and ten or eleven hours is an ordinary shift — so a daily
 * threshold paid a premium on weeks that never reached full time. Worse, each
 * importer applied its own daily rule, so what somebody earned depended on
 * whether their hours arrived from the Toast sync, the POS agent, an emailed Z
 * report or a manager typing them in.
 */
export const WEEKLY_OVERTIME_THRESHOLD = 40;

/** One shift's worth of hours. `date` is `YYYY-MM-DD`. */
export type WorkedShift = { date: string; hours: number };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The Monday that starts the workweek containing `iso`, or null if unreadable.
 *
 * Monday, and Sunday closing the week, to match `defaultWeek()` — a bar's
 * Sunday trade belongs to the week that preceded it, not the one about to
 * start. Done in UTC so a clock change cannot move a shift into another week
 * and silently re-price it.
 */
function weekStartOf(iso: string): string | null {
  if (typeof iso !== 'string' || !ISO_DATE.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(dt.getTime())) return null;
  const day = dt.getUTCDay();
  dt.setUTCDate(dt.getUTCDate() - (day === 0 ? 6 : day - 1));
  return dt.toISOString().slice(0, 10);
}

/**
 * Splits hours worked into regular and overtime, one workweek at a time.
 *
 * The threshold is applied PER WEEK rather than across the whole pay period.
 * Running a fortnight in one go would otherwise turn two ordinary thirty-hour
 * weeks into twenty hours of overtime, and a bar that runs payroll monthly
 * would owe a premium on almost everything.
 *
 * Total hours are conserved: an hour is always paid, and this only decides at
 * which rate. Hours whose date cannot be read are paid as regular rather than
 * dropped or awarded a premium on a week nobody can identify.
 */
export function splitWeeklyOvertime(
  shifts: WorkedShift[],
  threshold: number = WEEKLY_OVERTIME_THRESHOLD,
): { regularHours: number; overtimeHours: number } {
  const byWeek = new Map<string, number>();
  let undated = 0;

  for (const shift of shifts ?? []) {
    const hours = Number(shift?.hours);
    // Junk and negatives are not hours. Skipped rather than summed, because a
    // NaN here would spread through the whole employee's pay.
    if (!Number.isFinite(hours) || hours <= 0) continue;

    const week = weekStartOf(shift?.date);
    if (week === null) {
      undated += hours;
      continue;
    }
    byWeek.set(week, (byWeek.get(week) ?? 0) + hours);
  }

  let regularHours = undated;
  let overtimeHours = 0;

  for (const weekHours of byWeek.values()) {
    regularHours += Math.min(weekHours, threshold);
    overtimeHours += Math.max(weekHours - threshold, 0);
  }

  return { regularHours, overtimeHours };
}
