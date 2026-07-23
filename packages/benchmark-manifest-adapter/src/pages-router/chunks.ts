import path from 'node:path';

import { isStringArray, toFacadeChunkPath, uniqueInOrder } from '../common';
import type { RouterChunkResolver } from '../types';
import {
  parsePagesBuildManifest,
  parseStaticBuildManifest,
  resolvePagesClientBuildManifestPath
} from './manifests';

/**
 * Match exactly one leading segment in a non-root route path.
 *
 * Stable multi-locale Pages rewrites preserve their locale in destinations,
 * for example `/en/docs/generated-handlers/a/en`. Pages build manifests still
 * key the same route as `/docs/generated-handlers/a/en`.
 *
 * The stripped candidate is used only when one of the parsed manifests owns
 * it, so ordinary route segments are never removed speculatively.
 */
const LEADING_ROUTE_SEGMENT = /^\/[^/]+(?=\/)/;

const JS_CHUNK_FILE_EXTENSION = '.js';

/**
 * Check whether a Pages route asset is a browser JavaScript chunk.
 *
 * The Pages root build manifest mixes JavaScript and CSS in each route array.
 * Benchmark manifests measure JavaScript chunks only, so other asset types are
 * removed before route and shared chunk sets are compared.
 *
 * @param assetPath Asset path read from a Pages build manifest.
 * @returns True when the path has the `.js` build-artifact extension.
 */
const isJsChunkPath = (assetPath: string): boolean =>
  path.extname(assetPath) === JS_CHUNK_FILE_EXTENSION;

/**
 * Check whether either Pages manifest owns a route key.
 *
 * @param clientBuildManifest Browser-facing `_buildManifest.js` entries.
 * @param pagesBuildManifest Root `build-manifest.json` Pages entries.
 * @param routePath Candidate route key.
 * @returns True when either manifest contains the candidate as an own key.
 */
const hasPagesManifestRoute = (
  clientBuildManifest: Record<string, unknown>,
  pagesBuildManifest: Record<string, unknown>,
  routePath: string
): boolean =>
  Object.hasOwn(clientBuildManifest, routePath) ||
  Object.hasOwn(pagesBuildManifest, routePath);

/**
 * Resolve the Pages manifest key for one generated-handler destination.
 *
 * 1. An exact manifest key always wins.
 * 2. Stable multi-locale Pages destinations may carry one leading locale that
 *    is absent from Pages build-manifest keys.
 * 3. At most one leading segment is removed.
 * 4. The stripped candidate is accepted only when a parsed manifest owns it.
 * 5. The original route remains the fallback so unknown paths resolve to no
 *    chunks instead of being guessed.
 *
 * @param clientBuildManifest Browser-facing `_buildManifest.js` entries.
 * @param pagesBuildManifest Root `build-manifest.json` Pages entries.
 * @param routePath Generated-handler destination from adapter routing metadata.
 * @returns Route key to use for Pages manifest lookups.
 */
const resolvePagesBuildManifestRoutePath = (
  clientBuildManifest: Record<string, unknown>,
  pagesBuildManifest: Record<string, unknown>,
  routePath: string
): string => {
  if (
    hasPagesManifestRoute(clientBuildManifest, pagesBuildManifest, routePath)
  ) {
    return routePath;
  }

  const routeWithoutLeadingSegment = routePath.replace(
    LEADING_ROUTE_SEGMENT,
    ''
  );

  if (
    routeWithoutLeadingSegment !== routePath &&
    hasPagesManifestRoute(
      clientBuildManifest,
      pagesBuildManifest,
      routeWithoutLeadingSegment
    )
  ) {
    return routeWithoutLeadingSegment;
  }

  return routePath;
};

/**
 * Combine browser route entries with complete route assets.
 *
 * The browser manifest comes first so Turbopack route-loader overhead remains
 * represented. The root manifest then contributes the complete route payload.
 *
 * @param clientBuildManifest Browser-facing `_buildManifest.js`.
 * @param pagesBuildManifest Root `build-manifest.json` Pages entries.
 * @param routePath Pages Router route to collect.
 * @returns Ordered unique JavaScript chunks, or null when neither manifest
 * has the route.
 */
const collectPagesRouteJsChunks = (
  clientBuildManifest: Record<string, unknown>,
  pagesBuildManifest: Record<string, unknown>,
  routePath: string
): string[] | null => {
  const clientAssets = clientBuildManifest[routePath];
  const pageAssets = pagesBuildManifest[routePath];

  if (!isStringArray(clientAssets) && !isStringArray(pageAssets)) {
    return null;
  }

  return uniqueInOrder([
    ...(isStringArray(clientAssets) ? clientAssets : []),
    ...(isStringArray(pageAssets) ? pageAssets : [])
  ]).filter(isJsChunkPath);
};

/**
 * Decide whether another Pages Router entry should be treated as shared.
 *
 * Shared entries are excluded from the route-specific payload metric. For
 * generated handler routes, the original catch-all route is also shared because
 * it contributes support code that should not count as splitter payload.
 *
 * @param routeKey Candidate route key from the Pages build manifests.
 * @param routePath Pages route currently being resolved.
 * @returns True when the candidate route contributes shared chunks.
 */
const isPagesSharedRouteKey = (
  routeKey: string,
  routePath: string
): boolean => {
  if (['/', '/404', '/_app', '/_error'].includes(routeKey)) {
    return true;
  }

  return (
    routePath.startsWith('/docs/generated-handlers/') &&
    routeKey === '/docs/[...slug]'
  );
};

/**
 * Collect JavaScript chunks from Pages Router entries that are shared.
 *
 * Shared entries are collected from both manifests because `/_app` is present
 * in the root build manifest but normally absent from `_buildManifest.js`.
 *
 * @param clientBuildManifest Browser-facing `_buildManifest.js`.
 * @param pagesBuildManifest Root `build-manifest.json` Pages entries.
 * @param routePath Pages Router route currently being resolved.
 * @returns Ordered unique JavaScript chunk paths excluded as shared.
 */
const collectSharedPagesJsChunks = (
  clientBuildManifest: Record<string, unknown>,
  pagesBuildManifest: Record<string, unknown>,
  routePath: string
): string[] => {
  const sharedJsChunks: string[] = [];
  const routeKeys = uniqueInOrder([
    ...Object.keys(clientBuildManifest),
    ...Object.keys(pagesBuildManifest)
  ]);

  for (const routeKey of routeKeys) {
    if (routeKey === routePath || !isPagesSharedRouteKey(routeKey, routePath)) {
      continue;
    }

    const routeJsChunks = collectPagesRouteJsChunks(
      clientBuildManifest,
      pagesBuildManifest,
      routeKey
    );

    if (routeJsChunks != null) {
      sharedJsChunks.push(...routeJsChunks);
    }
  }

  return uniqueInOrder(sharedJsChunks);
};

/**
 * Resolve route-specific Pages Router client JavaScript chunks for one route.
 *
 * Pages Router chunk discovery combines the browser-facing build manifest with
 * the complete root build manifest, retains JavaScript assets, removes shared
 * route chunks, and normalizes the result to same-origin benchmark facade URLs.
 *
 * @param context Adapter build context supplied by Next.
 * @param zonePath Browser-visible facade prefix owned by the benchmark website.
 * @param routePath Pages generated-handler destination to resolve. Stable
 * multi-locale destinations may include a leading locale that is absent from
 * the manifest key.
 * @returns Same-origin facade JavaScript chunk URLs specific to the route.
 */
export const resolvePagesChunks: RouterChunkResolver = async (
  context,
  zonePath,
  routePath
) => {
  // Resolve both paths first, parse the independent manifests concurrently,
  // then combine their route data below.
  const clientBuildManifestPath = resolvePagesClientBuildManifestPath(
    context.buildId,
    context.outputs.staticFiles
  );
  const rootBuildManifestPath = path.join(
    context.distDir,
    'build-manifest.json'
  );

  const [clientBuildManifest, pagesBuildManifest] = await Promise.all([
    parseStaticBuildManifest(clientBuildManifestPath),
    parsePagesBuildManifest(rootBuildManifestPath)
  ]);

  const manifestRoutePath = resolvePagesBuildManifestRoutePath(
    clientBuildManifest,
    pagesBuildManifest,
    routePath
  );

  const routeJsChunks = collectPagesRouteJsChunks(
    clientBuildManifest,
    pagesBuildManifest,
    manifestRoutePath
  );

  if (routeJsChunks == null) {
    return [];
  }

  const sharedJsChunks = new Set(
    collectSharedPagesJsChunks(
      clientBuildManifest,
      pagesBuildManifest,
      manifestRoutePath
    )
  );

  return routeJsChunks
    .filter(chunk => !sharedJsChunks.has(chunk))
    .map(chunk => toFacadeChunkPath(zonePath, chunk));
};
