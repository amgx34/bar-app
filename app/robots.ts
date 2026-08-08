import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * Generates /robots.txt.
 *
 * AI crawlers are deliberately ALLOWED. Rail is a product people should be able
 * to discover by asking an assistant, so blanket-blocking assistant traffic
 * would cost reach for no benefit — nothing public here is proprietary. The
 * private surface is protected by auth (see proxy.ts), not by robots.txt, which
 * is only advisory and ignored by bad actors anyway.
 *
 * The Disallow list below keeps crawlers out of authenticated and machine-only
 * routes so they don't waste crawl budget on pages that just redirect to login.
 */
export default function robots(): MetadataRoute.Robots {
  const disallow = [
    '/app/',      // authenticated application
    '/setup/',    // onboarding, authenticated
    '/api/',      // JSON endpoints, nothing to index
    '/auth/',     // OAuth callbacks
    '/login',     // no SEO value, and noindex'd at the page level
  ];

  return {
    rules: [
      { userAgent: '*', allow: '/', disallow },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
