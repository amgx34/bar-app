import type { MetadataRoute } from 'next';
import { SITE_NAME, SITE_TAGLINE } from '@/lib/site';

/**
 * Installability, which Web Push depends on.
 *
 * On iOS 16.4+ push works ONLY for an app added to the Home Screen — Safari
 * will not grant the permission otherwise. So this manifest is not cosmetic:
 * without it, notifications are desktop-and-Android only.
 *
 * start_url points at the dashboard rather than '/' because anyone installing
 * this is a logged-in operator; landing them on the marketing page would be a
 * redirect on every launch.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             SITE_NAME,
    short_name:       SITE_NAME,
    description:      SITE_TAGLINE,
    start_url:        '/app/dashboard',
    scope:            '/',
    display:          'standalone',
    background_color: '#0a0a0a',
    theme_color:      '#0a0a0a',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
