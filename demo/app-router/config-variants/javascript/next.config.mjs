/**
 * Next.js configuration enhanced with next-slug-splitter.
 *
 * `withSlugSplitter` wraps the base Next.js config and installs the
 * App Router build-only rewrite generation that separates light and heavy
 * MDX pages into optimized route handlers.
 */

import { withSlugSplitter } from 'next-slug-splitter/next';
import { routeHandlersConfig } from './route-handlers-config.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  reactStrictMode: false,
  devIndicators: false
};

export default withSlugSplitter(nextConfig, {
  routeHandlersConfig
});
