export const SITE_NAME = 'next-slug-splitter';
export const SITE_TITLE = 'Catch-all routing without catch-all bundles';
export const SITE_DESCRIPTION =
  'Build-time route splitting for broad Next.js content routes. Give catch-all pages page-specific bundle boundaries, then verify route transport in a live benchmark.';
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  'https://next-slug-splitter-website.vercel.app';
/**
 * Optional GA4 measurement ID used by the website deployment.
 *
 * Keep this environment-driven so preview and local builds do not load Google
 * Analytics unless the deployment explicitly opts in.
 */
export const GOOGLE_ANALYTICS_ID =
  process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID ?? '';
export const GITHUB_URL =
  'https://github.com/project-millipede/next-slug-splitter';
export const BLOG_URL = 'https://www.millipede.me/blog';
export const LINKEDIN_URL =
  'https://www.linkedin.com/in/markus-gritsch-70952126/?skipRedirect=true';
export const QUICK_START_PATH = '/quick-start';
export const BENCHMARK_PATH = '/benchmark';
export const OPENGRAPH_IMAGE_PATH = '/opengraph-image';
export const TWITTER_IMAGE_PATH = '/twitter-image';

/**
 * Resolve a website path against the canonical public site URL.
 *
 * @param path - Absolute website path such as `/benchmark`.
 * @returns Absolute URL string for metadata, sitemap, and structured data.
 */
export const createSiteUrl = (path: string): string =>
  new URL(path, SITE_URL).toString();
