/**
 * Next.js configuration enhanced with next-slug-splitter.
 *
 * `withSlugSplitter` wraps the base Next.js config and installs the
 * route-splitting proxy that separates light and heavy MDX pages into
 * optimized route handlers at build time and on-demand in dev mode.
 */

import { withSlugSplitter } from 'next-slug-splitter/next';
import { routeHandlersConfig } from './route-handlers-config.mjs';

/** @type {import('next').NextConfig} */
const nextConfig = {
  pageExtensions: ['js', 'jsx', 'ts', 'tsx', 'md', 'mdx'],
  reactStrictMode: false
};

export default withSlugSplitter(nextConfig, {
  routeHandlersConfig
});
