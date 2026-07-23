import type { MetadataRoute } from 'next';

import { createSiteUrl, QUICK_START_PATH } from '../lib/site/config';

/**
 * Keep crawler focus on public website pages.
 *
 * `/zones/*` exposes external benchmark targets through the same-origin
 * facade and is intentionally excluded from indexing.
 *
 * @returns Robots policy and sitemap location for the website.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', QUICK_START_PATH, '/benchmark'],
      disallow: '/zones/'
    },
    sitemap: createSiteUrl('/sitemap.xml')
  };
}
