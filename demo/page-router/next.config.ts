/**
 * Stable demo entrypoint.
 *
 * Next still expects a conventional root config file, so this file stays
 * stable and delegates variant selection to the root
 * `route-handlers-config.ts` entrypoint.
 *
 * The root config does not inspect package scripts directly. It always imports
 * the stable root `route-handlers-config.ts`, and that file maps the current
 * script key (`npm_lifecycle_event`) to the active variant.
 */

import type { NextConfig } from 'next';
import { withSlugSplitter } from 'next-slug-splitter/next';
import { routeHandlersConfigPath } from './route-handlers-config';

const nextConfig: NextConfig = {
  i18n: {
    locales: ['en'],
    defaultLocale: 'en'
  },

  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  reactStrictMode: false,
  devIndicators: false
};

export default withSlugSplitter(nextConfig, {
  configPath: routeHandlersConfigPath
});
