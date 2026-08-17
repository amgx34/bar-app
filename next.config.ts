import type { NextConfig } from "next";

/**
 * Content Security Policy.
 *
 * Shipped in Report-Only first, deliberately. A blocking policy would break the
 * inline JSON-LD block on the marketing page and Next's own inline bootstrap
 * scripts on the very first deploy — so this collects violations while the app
 * keeps working. Promote to `Content-Security-Policy` once the reports are
 * clean; enforcing it needs nonces threaded through proxy.ts, which is a
 * separate change.
 *
 * 'unsafe-inline' on script-src is what a nonce would replace. It is why this
 * is Report-Only and not a claim of protection.
 */
const cspReportOnly = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  // Supabase over HTTPS + its realtime websocket. Vercel Analytics beacons to
  // the same origin under /_vercel/insights, so 'self' already covers it — it
  // is listed here so the next person does not have to work that out.
  //
  // In DEVELOPMENT only, @vercel/analytics loads its debug script from
  // va.vercel-scripts.com, which logs a report-only violation in the console.
  // That host is deliberately NOT allowlisted: production serves the script
  // from this origin, and widening the policy for a dev-only convenience would
  // weaken the thing the policy exists to do.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // 'upgrade-insecure-requests' is deliberately absent: browsers ignore it in a
  // report-only policy and log an error saying so on every page load. Add it
  // back when this is promoted to an enforcing Content-Security-Policy.
].join('; ');

const securityHeaders = [
  // Two years, subdomains included, preload-eligible. Vercel terminates TLS, so
  // this only ever reaches a browser over HTTPS.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },

  // Stops a browser second-guessing Content-Type — the vector that turns an
  // uploaded text file into executable script.
  { key: 'X-Content-Type-Options', value: 'nosniff' },

  // Clickjacking. frame-ancestors in the CSP is the modern control; this is the
  // fallback for engines that ignore it.
  { key: 'X-Frame-Options', value: 'DENY' },

  // Referrers leak URLs to third parties. Same-origin gets the full path,
  // cross-origin gets the origin only, and never over a downgrade.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },

  // Rail needs none of these. Denying them means an injected script cannot ask.
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
  },

  // Keeps this origin out of other origins' processes.
  { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
  { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },

  { key: 'Content-Security-Policy-Report-Only', value: cspReportOnly },
];

const nextConfig: NextConfig = {
  // Trims the header that advertises the framework and version.
  poweredByHeader: false,

  async headers() {
    return [
      {
        // Everything, including static assets and API routes.
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // No CORS allowances anywhere: the API is same-origin only, called by
        // this app's own pages. The 2Touch agent authenticates with an HMAC
        // signature rather than a browser origin, so it is unaffected — CORS
        // only constrains browsers.
        //
        // API responses must also never be cached by a shared proxy: they are
        // per-organisation and several are per-user.
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, max-age=0, must-revalidate' },
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
        ],
      },
    ];
  },
};

export default nextConfig;
