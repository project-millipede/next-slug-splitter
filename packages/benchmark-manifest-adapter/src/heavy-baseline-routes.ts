import {
  collectMdxFiles as collectSharedDocsContentFiles,
  DEFAULT_LOCALE,
  SUPPORTED_LOCALES
} from './common';
import type {
  AdapterBuildContext,
  BenchmarkRouteChunkCandidates,
  RouterChunkResolver,
  RouterKind
} from './types';

/**
 * Convert one shared docs content file into public heavy-baseline routes.
 *
 * The default locale is exposed both as `/docs/...` and `/en/docs/...` to match
 * the multi-locale app's default-locale normalization behavior.
 *
 * @param contentFilePath Relative MDX path shaped as `<slug>/<locale>.mdx`.
 * @returns Public route paths represented by the file.
 */
const contentFilePathToPublicBaselineRoutes = (
  contentFilePath: string
): string[] => {
  const contentPathSegments = contentFilePath.replace(/\.mdx$/, '').split('/');
  const locale = contentPathSegments.pop();
  const slug = contentPathSegments;

  if (locale == null || !SUPPORTED_LOCALES.has(locale) || slug.length === 0) {
    return [];
  }

  const slugPath = slug.join('/');

  if (locale === DEFAULT_LOCALE) {
    return [`/docs/${slugPath}`, `/${DEFAULT_LOCALE}/docs/${slugPath}`];
  }

  return [`/${locale}/docs/${slugPath}`];
};

/**
 * Discover public heavy-baseline routes from the shared docs content fixture.
 *
 * @param sharedContentDir Absolute shared docs content directory.
 * @returns Sorted public route paths for the heavy baseline app.
 */
const discoverPublicBaselineRoutes = async (
  sharedContentDir: string
): Promise<string[]> => {
  const contentFilePaths =
    await collectSharedDocsContentFiles(sharedContentDir);
  const publicRoutePaths = contentFilePaths.flatMap(
    contentFilePathToPublicBaselineRoutes
  );

  return [...new Set(publicRoutePaths)].sort((left, right) =>
    left.localeCompare(right)
  );
};

/**
 * Convert a public default-locale route to the concrete App Router match path.
 *
 * @param routePath Public route path from the baseline manifest.
 * @returns Route path that can match App Router build manifests.
 */
const toBaselineMatchPath = (routePath: string): string =>
  routePath.startsWith('/docs/') ? `/${DEFAULT_LOCALE}${routePath}` : routePath;

/**
 * Resolve route-specific chunks for a heavy-baseline route.
 *
 * Pages Router heavy baselines always use the catch-all route key, while App
 * Router heavy baselines resolve concrete localized paths through the App route
 * manifest.
 *
 * @param context Adapter build context supplied by Next.
 * @param routePath Public heavy-baseline route path.
 * @param routerKind Router family that produced the build output.
 * @param resolveChunks Router-specific chunk resolver selected by the adapter.
 * @param zonePath Browser-visible facade prefix owned by the benchmark website.
 * @returns Same-origin facade chunk URLs for the heavy-baseline route.
 */
const resolveHeavyBaselineChunks = async (
  context: AdapterBuildContext,
  routePath: string,
  routerKind: RouterKind,
  resolveChunks: RouterChunkResolver,
  zonePath: string
): Promise<string[]> => {
  const routerRoutePath =
    routerKind === 'pages' ? '/docs/[...slug]' : toBaselineMatchPath(routePath);

  return await resolveChunks(context, zonePath, routerRoutePath);
};

/**
 * Resolve payload candidates for all heavy-baseline routes.
 *
 * Heavy baselines do not have generated-handler rewrite destinations. They
 * still use the same internal candidate shape so exact payload selection can
 * operate identically for splitter and baseline builds.
 *
 * @param context Adapter build context supplied by Next.
 * @param sharedContentDir Absolute shared docs content directory.
 * @param routerKind Router family that produced the build output.
 * @param resolveChunks Router-specific chunk resolver selected by the adapter.
 * @param zonePath Browser-visible facade prefix owned by the benchmark website.
 * @returns Route candidate collections keyed by public route path.
 */
export const resolveHeavyBaselineRoutes = async (
  context: AdapterBuildContext,
  sharedContentDir: string,
  routerKind: RouterKind,
  resolveChunks: RouterChunkResolver,
  zonePath: string
): Promise<Record<string, BenchmarkRouteChunkCandidates>> => {
  const routePaths = await discoverPublicBaselineRoutes(sharedContentDir);
  const routes: Record<string, BenchmarkRouteChunkCandidates> = {};

  for (const routePath of routePaths) {
    const chunks = await resolveHeavyBaselineChunks(
      context,
      routePath,
      routerKind,
      resolveChunks,
      zonePath
    );

    routes[routePath] = {
      generatedHandlerPath: null,
      chunks
    };
  }

  return routes;
};
