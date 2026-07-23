import type { NextConfig } from 'next';

import { withBenchmarkManifestAdapter } from '../shared/benchmark-manifest-adapter-config';

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

export const nextConfig: NextConfig =
  withBenchmarkManifestAdapter(baseNextConfig);

export default nextConfig;
