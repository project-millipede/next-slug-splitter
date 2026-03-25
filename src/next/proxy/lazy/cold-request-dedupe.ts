import { analyzeRouteHandlerLazyMatchedRoute } from './single-route-analysis';
import {
  doesRouteHandlerLazySingleHandlerExist,
  emitRouteHandlerLazySingleHandler
} from './single-handler-emission';
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
 * Analyze one matched route and make sure a heavy route has a handler file.
 *
 * @remarks
 * This function combines two separate checks:
 * - route analysis answers the planning question:
 *   "is `routePath` currently light or heavy?"
 * - a filesystem check answers the file question:
 *   "does the emitted handler file for this heavy route still exist on disk?"
 *
 * The full protocol is:
 * 1. Analyze `routePath`.
 * 2. If the result is light, return that result immediately.
 * 3. If the result is heavy and came from cache, check the filesystem for the
 *    emitted handler file.
 * 4. If both the cached heavy result and the handler file are present, return
 *    immediately without emitting.
 * 5. In every other heavy case, emit the handler file so the rewrite target
 *    exists on disk.
 *
 * The safety rule is:
 * - cached heavy analysis is not trusted by itself
 * - emission is skipped only when the handler file is also confirmed on disk
 *
 * Example:
 * 1. `/docs/dashboard` was visited earlier in development.
 * 2. The lazy one-file cache already knows that route is heavy.
 * 3. The emitted handler file for `/docs/_handlers/dashboard` is still on
 *    disk.
 * 4. A later visit to `/docs/dashboard` can reuse the cached heavy result,
 *    skip emission, and rewrite immediately.
 *
 * The return value is:
 * - `{ kind: 'light', analysisResult }` when the matched route is light
 * - `{ kind: 'heavy', analysisResult }` when the matched route is heavy
 * - `null` when the target can no longer be resolved by the time analysis runs
 *
 * In the heavy case, `analysisResult` carries the planned heavy-route data
 * needed to resolve the rewrite destination.
 *
 * @param targetId - Target identifier used for one-file analysis.
 * @param localeConfig - Locale settings shared by the lazy proxy path.
 * @param routePath - Concrete localized content route file being prepared.
 * @returns Preparation result for the matched route, or `null` when the target
 * can no longer be resolved.
 */
const analyzeAndPrepare = async (
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
    const hasCachedHeavyResult = analysisResult.source === 'cache';
    let handlerExistsOnDisk = false;

    if (hasCachedHeavyResult) {
      handlerExistsOnDisk =
        await doesRouteHandlerLazySingleHandlerExist(analysisResult);
    }

    const canReuseExistingHandler =
      hasCachedHeavyResult && handlerExistsOnDisk;

    // Plan reuse comes from the cached heavy analysis result.
    // File reuse comes from the filesystem check above.
    // Emission is skipped only when both agree that the handler is reusable.
    if (canReuseExistingHandler) {
      return {
        kind: 'heavy',
        analysisResult
      };
    }

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
 * {@link analyzeAndPrepare} promise. The dedupe slot is cleared after the promise
 * settles so subsequent requests can observe content or cache changes.
 *
 * @param targetId - Target identifier for dedupe key and analysis.
 * @param localeConfig - Shared locale config for analysis.
 * @param routePath - Concrete localized content route file.
 * @returns Preparation result from {@link analyzeAndPrepare}, or `null` when the
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
  const preparationPromise = analyzeAndPrepare(
    targetId,
    localeConfig,
    routePath
  ).finally(() => {
    inFlightLazyMatchedRoutePreparations.delete(preparationKey);
  });

  inFlightLazyMatchedRoutePreparations.set(preparationKey, preparationPromise);
  return preparationPromise;
};
