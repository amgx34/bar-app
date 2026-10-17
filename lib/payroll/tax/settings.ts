// lib/payroll/tax/settings.ts
import type { OrgTaxConfig, PayFrequency } from './types';

const FREQUENCIES: PayFrequency[] = ['weekly', 'biweekly', 'semimonthly', 'monthly'];

function asObject(v: unknown): Record<string, unknown> {
  // Arrays are objects too; none of our keys live on one, and spreading one
  // would persist its indices into the column.
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/**
 * Only a number, or a string that parses to one, can be a rate. Anything else
 * (boolean, object, junk) is "not configured", not 1 or 0 by coercion.
 */
function finiteRate(v: unknown): number {
  if (typeof v !== 'number' && typeof v !== 'string') return 0;
  if (typeof v === 'string' && v.trim() === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Reads the tax setup out of organizations.bar_settings.
 *
 * Defaults to OFF. A bar that has never configured tax must not start
 * withholding because a deploy shipped, and an unset value is not consent.
 *
 * Clamps on read, like barbackFractionFromSettings: the Settings UI validates,
 * but a hand-edited row carries whatever somebody typed.
 */
export function taxConfigFromSettings(settings: Record<string, unknown>): OrgTaxConfig {
  const tax = asObject(settings?.tax);
  const freq = tax.payFrequency as PayFrequency;

  return {
    enabled:      tax.enabled === true,
    payFrequency: FREQUENCIES.includes(freq) ? freq : 'biweekly',
    stateEnabled: tax.stateEnabled === true,
    // === true: absent or malformed is false, the loud-failure side. See OrgTaxConfig.
    tipsPaidOnCheque: tax.tipsPaidOnCheque === true,
    // The finite check must come BEFORE the clamp, not be replaced by it:
    // Math.max(0, NaN) is NaN and Math.min(100, NaN) is NaN, so the clamp
    // alone passes a corrupted value straight through. NaN then compares false
    // against every guard downstream and would poison every withholding figure
    // for the bar without any error.
    stateRate:    Math.min(100, Math.max(0, finiteRate(tax.stateRate))),
  };
}

/**
 * Builds the next bar_settings with the tax patch applied.
 *
 * bar_settings is one JSON column with several writers. Spreading a stale read
 * is how pos_config silently reverted an agent version on every sync; every
 * writer here builds from the settings it was handed and returns the result.
 * Never mutates its input.
 */
export function withTaxConfig(
  settings: Record<string, unknown>,
  patch: Partial<OrgTaxConfig>,
): Record<string, unknown> {
  const current = asObject(settings?.tax);
  // Explicit allowlist: spreading the patch would let a direct caller write
  // arbitrary keys into bar_settings.tax.
  const next: Record<string, unknown> = { ...current };
  if (patch.enabled !== undefined)      next.enabled = patch.enabled;
  if (patch.payFrequency !== undefined) next.payFrequency = patch.payFrequency;
  if (patch.stateEnabled !== undefined) next.stateEnabled = patch.stateEnabled;
  if (patch.stateRate !== undefined)    next.stateRate = patch.stateRate;
  if (patch.tipsPaidOnCheque !== undefined) next.tipsPaidOnCheque = patch.tipsPaidOnCheque;
  return { ...settings, tax: next };
}
