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

/**
 * Real-world business details, used for structured data.
 *
 * FILL THESE IN to publish LocalBusiness markup. They are deliberately null
 * rather than placeholders: emitting a made-up address as schema.org data
 * would be publishing a fabricated business record, and search engines treat
 * a wrong address as a trust signal against you. The schema builder omits any
 * field left null instead of guessing.
 *
 * LocalBusiness is only the right type if Rail sells to a defined geography.
 * For a product sold anywhere, leave `streetAddress` null — the Organization
 * markup below stands on its own and is accurate either way.
 */
export const BUSINESS = {
  email: 'railsystemspos@gmail.com',
  telephone: null as string | null,
  streetAddress: null as string | null,
  addressLocality: null as string | null,
  addressRegion: null as string | null,
  postalCode: null as string | null,
  addressCountry: 'US',
  /** Where customers are, not where the office is. */
  areaServed: 'US',
} as const;

/** Used verbatim as the meta description and the OG/Twitter description. */
export const SITE_DESCRIPTION =
  'Rail is bar management software for real-time inventory, automated payroll ' +
  'and tip splits, nightly Z-report analytics, and supplier ordering — built ' +
  'specifically for bar operators.';
