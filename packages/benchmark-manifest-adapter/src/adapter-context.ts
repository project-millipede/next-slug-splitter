import path from 'node:path';

import { resolveAppChunks } from './app-router/chunks';
import { isManifestKind, MANIFEST_FILENAMES } from './common';
import { writeRoutePayloadManifest } from './payload-manifest';
import { resolveHeavyBaselineRoutes } from './heavy-baseline-routes';
import { resolvePagesChunks } from './pages-router/chunks';
import { resolveSplitterRoutes } from './splitter-routes';
import type {
  AdapterBuildContext,
  ManifestKind,
  RouterChunkResolver,
  RouterKind
} from './types';

const BENCHMARK_MANIFEST_KIND_ENV = 'BENCHMARK_MANIFEST_KIND';
const BENCHMARK_ZONE_PATH_ENV = 'BENCHMARK_ZONE_PATH';

/**
 * Resolve the manifest kind generated for the current benchmark target.
 *
 * Existing splitter builds default to `splitter` when the environment variable
 * is absent. Configured values must match one of the supported manifest kinds.
 *
 * @returns Configured manifest kind, or `splitter` when unset.
 * @throws When the configured manifest kind is unsupported.
 */
const readBenchmarkManifestKind = (): ManifestKind => {
  const manifestKindInput = process.env[BENCHMARK_MANIFEST_KIND_ENV];

  if (manifestKindInput == null) {
    return 'splitter';
  }

  if (!isManifestKind(manifestKindInput)) {
    throw new Error(
      `Unsupported ${BENCHMARK_MANIFEST_KIND_ENV} "${manifestKindInput}". Expected one of: ${Object.keys(
        MANIFEST_FILENAMES
      ).join(', ')}.`
    );
  }

  return manifestKindInput;
};

const manifestKind = readBenchmarkManifestKind();

/**
 * Match the single trailing slash removed from a benchmark facade path.
 *
 * Examples:
 *
 * 1. `/zones/page-router/` matches and becomes `/zones/page-router`.
 * 2. `/zones/page-router` does not match and remains unchanged.
 */
const BENCHMARK_ZONE_PATH_TRAILING_SLASH = /\/$/;

/**
 * Resolve the browser-visible benchmark facade path for this target build.
 *
 * Target apps deploy at their own root so direct preview URLs like `/de` still
 * work. The benchmark website exposes the same app under `/zones/<target>`.
 * This variable tells the manifest writer which facade prefix to use when it
 * serializes chunk URLs, without setting Next's `basePath` or changing real
 * app routing.
 *
 * @returns Normalized benchmark facade path.
 * @throws When `BENCHMARK_ZONE_PATH` is not configured.
 */
const readBenchmarkZonePath = (): string => {
  const zonePath = process.env[BENCHMARK_ZONE_PATH_ENV];

  if (zonePath == null) {
    throw new Error(
      `Missing required ${BENCHMARK_ZONE_PATH_ENV} environment variable.`
    );
  }

  return zonePath.replace(BENCHMARK_ZONE_PATH_TRAILING_SLASH, '');
};

/**
 * Infer the router family from adapter page outputs.
 *
 * @param appPages App Router page outputs from the adapter build context.
 * @param pages Pages Router page outputs from the adapter build context.
 * @returns Router family represented by the build outputs.
 */
const inferRouterKind = (
  appPages: ReadonlyArray<unknown>,
  pages: ReadonlyArray<unknown>
): RouterKind => (appPages.length > 0 || pages.length === 0 ? 'app' : 'pages');

/**
 * Resolve the shared docs content directory for a benchmark target app.
 *
 * @param projectDir Absolute project directory for the target app.
 * @returns Absolute shared docs content directory.
 */
const resolveSharedContentDir = (projectDir: string): string =>
  path.join(projectDir, '..', 'shared', 'docs-content', 'pages');

/**
 * Generate the exact-payload manifest for the current benchmark target.
 *
 * Next calls this through the adapter after a target app has produced build
 * output. The helper:
 *
 * 1. Reads adapter routing and output metadata.
 * 2. Delegates candidate discovery to the matching router implementation.
 * 3. Selects one exact emitted JavaScript payload for each published route.
 * 4. Publishes the single manifest consumed by the website and verifier.
 *
 * @param context Adapter build context supplied by Next.
 * @returns A promise that resolves after the manifest file is published.
 * @throws When candidate discovery, payload selection, or publication fails.
 */
export const writeBenchmarkManifestFromAdapterContext = async (
  context: AdapterBuildContext
): Promise<void> => {
  const buildOutputDir = context.distDir;
  const projectDir = context.projectDir;
  const sharedContentDir = resolveSharedContentDir(projectDir);
  const appPages = context.outputs.appPages;
  const pages = context.outputs.pages;
  const routerKind = inferRouterKind(appPages, pages);
  const resolveChunks: RouterChunkResolver =
    routerKind === 'pages' ? resolvePagesChunks : resolveAppChunks;

  const zonePath = readBenchmarkZonePath();

  const routeCandidates =
    manifestKind === 'heavy-baseline'
      ? await resolveHeavyBaselineRoutes(
          context,
          sharedContentDir,
          routerKind,
          resolveChunks,
          zonePath
        )
      : await resolveSplitterRoutes(context, resolveChunks, zonePath);

  const outputPath = await writeRoutePayloadManifest(
    buildOutputDir,
    manifestKind,
    routeCandidates,
    zonePath
  );

  console.log(
    `[benchmark] wrote ${Object.keys(routeCandidates).length} ${manifestKind} payload route entries to ${path.relative(projectDir, outputPath)}`
  );
};
