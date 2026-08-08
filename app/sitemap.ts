import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * Generates /sitemap.xml.
 *
 * Only genuinely public, indexable URLs belong here. Everything under /app and
 * /setup requires auth, and /login is noindex'd — listing any of them would just
 * feed crawlers pages that redirect. The marketing page's #features /
 * #how-it-works / #contact are fragments of `/`, not separate URLs, so they are
 * intentionally not listed either.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: SITE_URL,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
  ];
}
