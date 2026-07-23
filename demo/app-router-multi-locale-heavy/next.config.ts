import type { NextConfig } from 'next';
import { buildAppDefaultLocaleNormalizationRewrites } from 'next-slug-splitter/next/config';

import { withBenchmarkManifestAdapter } from '../shared/benchmark-manifest-adapter-config';

const localeConfig = {
  locales: ['en', 'de'],
  defaultLocale: 'en'
};

export const baseNextConfig: NextConfig = {
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  reactStrictMode: false,
  devIndicators: false,
  async rewrites() {
    return {
      beforeFiles: [],
      afterFiles: buildAppDefaultLocaleNormalizationRewrites(
        localeConfig,
        '/docs'
      ),
      fallback: []
    };
  }
};

export const nextConfig: NextConfig =
  withBenchmarkManifestAdapter(baseNextConfig);

export default nextConfig;
