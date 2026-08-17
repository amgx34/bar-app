import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';
import { TERMS_UPDATED, EULA_UPDATED } from '@/lib/legal';

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
    // Policy pages are genuinely public and are the pages people look for when
    // deciding whether to trust the product with employee data.
    {
      url: `${SITE_URL}/privacy`,
      lastModified: new Date('2026-08-17'),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/terms`,
      lastModified: new Date(TERMS_UPDATED),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/eula`,
      lastModified: new Date(EULA_UPDATED),
      changeFrequency: 'yearly',
      priority: 0.2,
    },
    {
      url: `${SITE_URL}/accessibility`,
      lastModified: new Date('2026-08-17'),
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
