import type { NextConfig } from 'next';
import { createMDX } from 'fumadocs-mdx/next';
import { withSlugSplitter } from 'next-slug-splitter/next';

import { routeHandlersConfig } from './route-handlers-config';

const withMDX = createMDX();

const nextConfig: NextConfig = {
  reactStrictMode: false
};

export default withSlugSplitter(withMDX(nextConfig), {
  routeHandlersConfig
});
