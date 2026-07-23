import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

type AdapterPathConfig = {
  adapterPath?: string;
};

/**
 * Resolve the benchmark manifest adapter module for native Next.js adapter use.
 *
 * Heavy baseline demos do not run through `withSlugSplitter(...)`, so they
 * cannot use slug-splitter's adapter composition API. They still need the
 * benchmark manifest to be written during Next's `onBuildComplete` lifecycle,
 * before Vercel collects deployable output.
 */
const benchmarkManifestAdapterPath =
  require.resolve('@next-slug-splitter/benchmark-manifest-adapter/next-adapter');

/**
 * Install the benchmark manifest adapter on a plain Next config.
 *
 * @param nextConfig Next config for a heavy baseline demo.
 * @returns Next config with the benchmark manifest adapter path installed.
 */
export const withBenchmarkManifestAdapter = <TConfig extends AdapterPathConfig>(
  nextConfig: TConfig
): TConfig & { adapterPath: string } => ({
  ...nextConfig,
  adapterPath: benchmarkManifestAdapterPath
});
