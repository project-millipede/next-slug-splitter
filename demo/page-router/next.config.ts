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
import benchmarkAdapter from '@next-slug-splitter/benchmark-manifest-adapter/next-adapter';
import { withSlugSplitter } from 'next-slug-splitter/next';
import { routeHandlersConfig } from './route-handlers-config';

export const baseNextConfig: NextConfig = {
  agentRules: false,
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  reactStrictMode: false,
  devIndicators: false,
  i18n: {
    locales: ['en', 'de'],
    defaultLocale: 'en'
  }
};

export default withSlugSplitter(baseNextConfig, {
  routeHandlersConfig,
  adapter: benchmarkAdapter
});
