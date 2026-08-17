/**
 * Campaign attribution.
 *
 * Captured on the first page a visitor lands on and kept for the session, then
 * attached to whatever they eventually submit. Without the persistence step
 * attribution is close to useless: almost nobody fills in the form on the page
 * they arrived at, and by the time they do the query string is long gone.
 *
 * sessionStorage, not a cookie:
 *   - it is not sent to the server on every request
 *   - it dies with the tab, so it cannot follow someone across visits
 *   - it is first-party and carries no identifier of any kind
 *
 * That combination is what keeps this outside the scope of consent banners, and
 * keeps /privacy's "no advertising cookies" line true. Do not migrate it to a
 * cookie without revisiting that page.
 */

const STORAGE_KEY = 'rail:attribution';

/** The five standard UTM parameters, plus the two common ad-click ids. */
const TRACKED_PARAMS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
] as const;

export type Attribution = Partial<Record<(typeof TRACKED_PARAMS)[number], string>> & {
  /** First page of the visit. Path only — query and hash are dropped. */
  landing_page?: string;
  /** External referrer host, if any. Host only, never the full URL. */
  referrer?: string;
};

/** Values are bounded: this ends up in a database column and in an email. */
const MAX_VALUE_LENGTH = 200;

function clean(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().slice(0, MAX_VALUE_LENGTH);
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Reads campaign parameters from the current URL and stores them if this is the
 * first page of the session. Safe to call on every page.
 *
 * FIRST touch wins, deliberately. If someone arrives from an ad, browses, and
 * later returns from a Google search, the ad is what earned the visit — letting
 * the last link overwrite it would credit organic search for paid traffic.
 */
export function captureAttribution(): void {
  if (typeof window === 'undefined') return;

  try {
    if (window.sessionStorage.getItem(STORAGE_KEY)) return;

    const params = new URLSearchParams(window.location.search);
    const captured: Attribution = {};

    for (const key of TRACKED_PARAMS) {
      const value = clean(params.get(key));
      if (value) captured[key] = value;
    }

    captured.landing_page = window.location.pathname;

    // Host only. The full referrer URL can carry someone else's query string,
    // which is not ours to store.
    if (document.referrer) {
      try {
        const host = new URL(document.referrer).host;
        if (host && host !== window.location.host) captured.referrer = host;
      } catch {
        // Malformed referrer — not worth reporting.
      }
    }

    // Nothing but the landing page means a direct visit; storing that would
    // just occupy the slot and block a real campaign later in the session.
    const hasSignal = TRACKED_PARAMS.some((k) => captured[k]) || captured.referrer;
    if (!hasSignal) return;

    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(captured));
  } catch {
    // Private mode, or storage disabled. Attribution is a nice-to-have and must
    // never break a page — let alone the form it is attached to.
  }
}

/** Whatever was captured this session. Empty object when there is nothing. */
export function getAttribution(): Attribution {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Attribution) : {};
  } catch {
    return {};
  }
}

/** One-line summary for an email or a table cell. */
export function formatAttribution(a: Attribution): string {
  const parts = [
    a.utm_source && `source=${a.utm_source}`,
    a.utm_medium && `medium=${a.utm_medium}`,
    a.utm_campaign && `campaign=${a.utm_campaign}`,
    a.utm_term && `term=${a.utm_term}`,
    a.utm_content && `content=${a.utm_content}`,
    a.gclid && 'gclid',
    a.fbclid && 'fbclid',
    a.referrer && `ref=${a.referrer}`,
    a.landing_page && `landed=${a.landing_page}`,
  ].filter(Boolean);

  return parts.length ? parts.join(' · ') : 'direct';
}
