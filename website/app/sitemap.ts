import type { MetadataRoute } from 'next';

import {
  BENCHMARK_PATH,
  createSiteUrl,
  QUICK_START_PATH
} from '../lib/site/config';

/**
 * Declare the canonical public pages for crawlers.
 *
 * Benchmark facade routes and proxied target apps are omitted because they are
 * measurement infrastructure rather than website content.
 *
 * @returns Sitemap entries for the website landing page and benchmark page.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();

  return [
    {
      url: createSiteUrl('/'),
      lastModified,
      changeFrequency: 'weekly',
      priority: 1
    },
    {
      url: createSiteUrl(QUICK_START_PATH),
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.86
    },
    {
      url: createSiteUrl(BENCHMARK_PATH),
      lastModified,
      changeFrequency: 'weekly',
      priority: 0.8
    }
  ];
}
