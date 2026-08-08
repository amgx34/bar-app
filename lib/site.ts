/**
 * Canonical site identity — single source of truth for metadata, robots,
 * sitemap, llms.txt, and JSON-LD so they can never drift apart.
 *
 * Override the origin per-environment with NEXT_PUBLIC_SITE_URL. Vercel's
 * VERCEL_PROJECT_PRODUCTION_URL is the fallback so preview deployments emit
 * their own absolute URLs instead of pointing canonical tags at production.
 */

function resolveSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;

  return 'https://bar-app-drab.vercel.app';
}

export const SITE_URL = resolveSiteUrl();

export const SITE_NAME = 'Rail';

export const SITE_TAGLINE = 'Bar Management Platform';

/** Used verbatim as the meta description and the OG/Twitter description. */
export const SITE_DESCRIPTION =
  'Rail is bar management software for real-time inventory, automated payroll ' +
  'and tip splits, nightly Z-report analytics, and supplier ordering — built ' +
  'specifically for bar operators.';
