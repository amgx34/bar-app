import type { MetadataRoute } from 'next';
import { SITE_NAME, SITE_TAGLINE, SITE_DESCRIPTION } from '@/lib/site';

/**
 * Web app manifest — what makes Rail installable to a phone home screen.
 *
 * The audience is bar staff mid-shift: one hand, a dim room, a phone that may
 * be on bad wifi. Launching from the home screen into a standalone window
 * removes the browser chrome that otherwise eats a fifth of a small screen and
 * puts a reload button next to a stock count.
 *
 * `start_url` is the dashboard rather than `/`: someone installing this is a
 * signed-in operator, and landing them on the marketing page every time would
 * be a bug. The auth gate in proxy.ts redirects to login if the session lapsed.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE_NAME} — ${SITE_TAGLINE}`,
    short_name: SITE_NAME,
    description: SITE_DESCRIPTION,
    start_url: '/app/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    // Matches --sidebar / --background so the splash and the app agree.
    background_color: '#0E1729',
    theme_color: '#0E1729',
    categories: ['business', 'productivity', 'finance'],
    icons: [
      {
        src: '/icon',
        sizes: '512x512',
        type: 'image/png',
        // 'any' rather than 'maskable': the mark is not padded for a maskable
        // safe zone, and declaring it maskable would let Android crop the bars.
        purpose: 'any',
      },
      {
        src: '/apple-icon',
        sizes: '180x180',
        type: 'image/png',
        purpose: 'any',
      },
    ],
    // Deep links straight to the work, so a home-screen long-press is useful.
    shortcuts: [
      {
        name: 'Inventory',
        short_name: 'Inventory',
        description: 'Adjust stock and check par levels',
        url: '/app/inventory',
      },
      {
        name: 'Payroll',
        short_name: 'Payroll',
        description: 'Hours, tips and pay for the current period',
        url: '/app/payroll',
      },
      {
        name: 'Tips',
        short_name: 'Tips',
        description: "Tonight's tip totals and splits",
        url: '/app/tips',
      },
    ],
  };
}
