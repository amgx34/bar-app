import type { BarSettings } from '@/lib/org';
import type { Prefill } from './prefill';

// States with one zone, plus KY and IN which the first customers sit in (eastern).
// Split-zone states are left out on purpose: the form asks rather than guesses.
const EASTERN = ['CT','DE','DC','GA','IN','KY','ME','MD','MA','NH','NJ','NY','NC','OH','PA','RI','SC','VT','VA','WV'];
const CENTRAL = ['AL','AR','IL','IA','LA','MN','MS','MO','OK','WI'];
const TZ: Record<string, string> = {
  ...Object.fromEntries(EASTERN.map((s) => [s, 'America/New_York'])),
  ...Object.fromEntries(CENTRAL.map((s) => [s, 'America/Chicago'])),
  CO: 'America/Denver', MT: 'America/Denver', NM: 'America/Denver', UT: 'America/Denver', WY: 'America/Denver',
  AZ: 'America/Phoenix', CA: 'America/Los_Angeles', NV: 'America/Los_Angeles', WA: 'America/Los_Angeles',
  HI: 'Pacific/Honolulu',
};

export function inferTimezone(state: string | undefined | null): string | undefined {
  return state ? TZ[state.trim().toUpperCase()] : undefined;
}

export const TIMEZONES = [
  'America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix',
  'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu',
];

/** Name part is ascii-only and never starts or ends with a hyphen; empty falls back to "bar". */
export function barSlug(name: string, suffix: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/g, '');
  return `${base || 'bar'}-${suffix}`;
}

export type BarInput = Partial<BarSettings> & { name: string; timezone?: string };

/**
 * Settings for a new bar. Money fields appear only when the owner typed them or
 * the demo carried them: they feed payroll, so no number is invented here.
 */
export function buildBarSettings(input: BarInput, prefill: Prefill): BarSettings {
  const { name: _name, ...rest } = input; // eslint-disable-line @typescript-eslint/no-unused-vars
  const explicit = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined && v !== ''));
  const merged: Record<string, unknown> = { ...prefill, ...explicit };
  const tz = (explicit.timezone as string | undefined) ?? inferTimezone(input.bar_state);
  if (tz) merged.timezone = tz; else delete merged.timezone;
  merged.auto_reorder_enabled = false;
  return merged as BarSettings;
}

export type CreateDecision =
  | { kind: 'unverified' }
  | { kind: 'existing'; orgId: string }
  | { kind: 'create' };

export function decideCreate(a: { emailConfirmedAt: string | null | undefined; ownedBarId: string | null }): CreateDecision {
  if (!a.emailConfirmedAt) return { kind: 'unverified' };
  if (a.ownedBarId) return { kind: 'existing', orgId: a.ownedBarId };
  return { kind: 'create' };
}
