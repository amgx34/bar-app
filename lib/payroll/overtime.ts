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
