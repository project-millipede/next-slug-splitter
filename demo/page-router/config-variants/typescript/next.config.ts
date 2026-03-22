/**
 * Next.js configuration enhanced with next-slug-splitter.
 *
 * `withSlugSplitter` wraps the base Next.js config and installs the
 * route-splitting proxy that separates light and heavy MDX pages into
 * optimized route handlers at build time and on-demand in dev mode.
 *
 * The `routeHandlersConfig` imported here describes which route segments
 * to split and how to resolve component imports for each generated handler.
 */

import type { NextConfig } from 'next';
import { withSlugSplitter } from 'next-slug-splitter/next';
import { routeHandlersConfig } from './route-handlers-config';

const nextConfig: NextConfig = {
  i18n: {
    locales: ['en'],
    defaultLocale: 'en'
  },

  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  reactStrictMode: false
};

export default withSlugSplitter(nextConfig, {
  routeHandlersConfig
});
