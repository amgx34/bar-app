import type { BarSettings } from '@/lib/org';

/**
 * bar_settings is one JSON column with many writers, so the dismiss write must
 * be built from the LATEST read, never from a copy read earlier (same rule as
 * pos_config). Returns a new object; the caller stores it whole.
 */
export function applyOnboardingDismissed(latest: BarSettings, now: string): BarSettings {
  return { ...latest, onboarding_dismissed_at: now };
}
