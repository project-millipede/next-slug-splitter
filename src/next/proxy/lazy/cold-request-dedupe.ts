import { analyzeRouteHandlerLazyMatchedRoute } from './single-route-analysis';
import { emitRouteHandlerLazySingleHandler } from './single-handler-emission';
import { composeKey } from './key-builder';

import type { LocaleConfig, LocalizedRoutePath } from '../../../core/types';
import type { RouteHandlerLazyMatchedRoutePreparationResult } from './types';

/**
 * Process-local dedupe map for concurrent cold lazy-route requests.
 *
 * @remarks
 * This map intentionally keys only the expensive shared work unit:
 * - analyze one matched content file
 * - emit one generated handler file when the result is heavy
 *
 * It does not include pathname-specific rewrite resolution in the shared
 * promise because one localized content file can legitimately correspond to
 * more than one public pathname, and those pathnames may rewrite to different
 * destinations even though they share the same underlying analysis/emission
 * work.
 */
const inFlightLazyMatchedRoutePreparations = new Map<
  string,
  Promise<RouteHandlerLazyMatchedRoutePreparationResult | null>
>();

/**
 * Analyze one matched route and emit its handler file if heavy.
 *
 * @remarks
 * This is the shared work unit for a cold lazy request:
 * 1. Analyze exactly one matched content file (heavy or light).
 * 2. If heavy, emit the generated handler file to disk so the subsequent
 *    rewrite has a valid target.
 *
 * The result carries the route truth (`light` or `heavy`) plus the fully
 * planned analysis result needed for rewrite destination resolution and
 * lazy discovery publication. Returns `null` when the target can no longer
 * be resolved (e.g. config changed between request resolution and analysis).
 */
const analyzeAndEmit = async (
  targetId: string,
  localeConfig: LocaleConfig,
  routePath: LocalizedRoutePath
): Promise<RouteHandlerLazyMatchedRoutePreparationResult | null> => {
  const analysisResult = await analyzeRouteHandlerLazyMatchedRoute(
    targetId,
    localeConfig,
    routePath
  );

  if (analysisResult?.kind === 'heavy') {
    // Lazy single-route emission: render and write exactly one handler file
    // to disk so the subsequent rewrite has a valid target. Unlike build-mode
    // batch emission, this only ensures the one requested route is ready and
    // never removes other handler files.
    await emitRouteHandlerLazySingleHandler({
      analysisResult
    });

    return {
      kind: 'heavy',
      analysisResult
    };
  }

  if (analysisResult?.kind === 'light') {
    return {
      kind: 'light',
      analysisResult
    };
  }

  return null;
};

/**
 * Prepare one matched lazy route for request-time rewriting with process-local
 * cold-request deduplication.
 *
 * Concurrent requests for the same target/file pair share a single in-flight
 * {@link analyzeAndEmit} promise. The dedupe slot is cleared after the promise
 * settles so subsequent requests can observe content or cache changes.
 *
 * @param targetId - Target identifier for dedupe key and analysis.
 * @param localeConfig - Shared locale config for analysis.
 * @param routePath - Concrete localized content route file.
 * @returns Preparation result from {@link analyzeAndEmit}, or `null` when the
 * target can no longer be analyzed.
 */
export const prepareRouteHandlerLazyMatchedRoute = async (
  targetId: string,
  localeConfig: LocaleConfig,
  routePath: LocalizedRoutePath
): Promise<RouteHandlerLazyMatchedRoutePreparationResult | null> => {
  const preparationKey = composeKey(targetId, routePath.filePath);
  const existingPreparation =
    inFlightLazyMatchedRoutePreparations.get(preparationKey);

  if (existingPreparation != null) {
    // A concurrent request already started the shared analysis/emission
    // workflow for the same target/file pair — wait for that work to finish.
    return existingPreparation;
  }

  // Cleanup is attached to the promise itself via .finally() so the dedupe
  // slot is cleared exactly once when the work settles, regardless of which
  // caller awaits it first.
  const preparationPromise = analyzeAndEmit(
    targetId,
    localeConfig,
    routePath
  ).finally(() => {
    inFlightLazyMatchedRoutePreparations.delete(preparationKey);
  });

  inFlightLazyMatchedRoutePreparations.set(preparationKey, preparationPromise);
  return preparationPromise;
};
