import type { NextAdapter } from 'next';

import { writeBenchmarkManifestFromAdapterContext } from './adapter-context';

/**
 * Next adapter that writes benchmark manifests from build-complete metadata.
 *
 * @remarks
 * The adapter supports both benchmark target roles:
 *
 * 1. Splitter targets compose it through
 *    `withSlugSplitter(..., { adapter })`. Slug-splitter remains responsible
 *    for generated-handler routes and rewrites.
 * 2. Heavy-baseline targets install it directly through Next.js
 *    `adapterPath`, without enabling slug-splitter.
 *
 * In both roles, this adapter only observes completed build output and writes
 * the corresponding benchmark manifest. It does not create routes, rewrites,
 * or chunk boundaries.
 */
const benchmarkAdapter: NextAdapter = {
  name: 'benchmark-manifest-adapter',
  async onBuildComplete(context) {
    await writeBenchmarkManifestFromAdapterContext(context);
  }
};

export default benchmarkAdapter;
