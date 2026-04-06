import { analyzeRouteHandlerLazyMatchedRoute } from './single-route-analysis';
import { emitRouteHandlerLazySingleHandler } from './single-handler-emission';
import { composeKey } from './key-builder';

import type {
  RouteHandlerLazyMatchedRouteInput,
  RouteHandlerLazyMatchedRoutePreparationResult
} from './types';

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
 * - single-file synchronization answers the file question:
 *   "is the emitted handler file for this heavy route current on disk?"
 *
 * The full protocol is:
 * 1. Analyze `routePath`.
 * 2. If the result is light, return that result immediately.
 * 3. If the result is heavy, synchronize exactly one emitted handler file.
 * 4. Return the heavy analysis result after that one-file synchronization
 *    finishes.
 *
 * The safety rule is:
 * - Stage 1 cache reuse skips MDX capture only
 * - heavy-route processor planning is still reconstructed in memory
 * - one-file synchronization still runs for every heavy result so the emitted
 *   handler file is guaranteed current on disk
 *
 * Example:
 * 1. `/docs/dashboard` was visited earlier in development.
 * 2. The lazy Stage 1 cache already knows which component keys that route uses.
 * 3. A later visit to `/docs/dashboard` can skip MDX capture, rerun only
 *    processor planning, and synchronize that one emitted handler file.
 * 4. The synchronization step still avoids unnecessary rewrites because it
 *    compares rendered output against the on-disk file before writing.
 *
 * The return value is:
 * - `{ kind: 'light', analysisResult }` when the matched route is light
 * - `{ kind: 'heavy', analysisResult }` when the matched route is heavy
 * - `null` when the target can no longer be resolved by the time analysis runs
 *
 * In the heavy case, `analysisResult` carries the planned heavy-route data
 * needed to resolve the rewrite destination.
 *
 * @param input - Analysis/emission input.
 * @param input.targetId - Target identifier selected by lazy request resolution.
 * @param input.routePath - Concrete localized content route file to analyze.
 * @param input.bootstrapGenerationToken - Current worker bootstrap generation token.
 * @param input.resolvedConfigsByTargetId - Bootstrapped heavy target configs keyed by
 * target id.
 * @param input.lazySingleRouteCacheManager - Generation-scoped worker cache
 * manager used for RAM-first lazy-route reuse.
 * @returns Preparation result for the matched route, or `null` when the target
 * can no longer be resolved.
 */
const analyzeAndPrepare = async ({
  targetId,
  routePath,
  bootstrapGenerationToken,
  resolvedConfigsByTargetId,
  lazySingleRouteCacheManager
}: RouteHandlerLazyMatchedRouteInput
): Promise<RouteHandlerLazyMatchedRoutePreparationResult | null> => {
  const analysisResult = await analyzeRouteHandlerLazyMatchedRoute({
    targetId,
    routePath,
    bootstrapGenerationToken,
    resolvedConfigsByTargetId,
    lazySingleRouteCacheManager
  });

  if (analysisResult?.kind === 'heavy') {
    // Lazy single-route emission: render and write exactly one handler file
    // to disk so the subsequent rewrite has a valid target. Unlike build-mode
    // batch emission, this only ensures the one requested route is ready and
    // never removes other handler files. In Stage 1, this synchronization
    // still runs for cached heavy routes because only MDX capture is reused.
    await emitRouteHandlerLazySingleHandler(analysisResult);

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
 * @param input - Preparation input.
 * @param input.targetId - Target identifier selected by lazy request resolution.
 * @param input.routePath - Concrete localized content route file to analyze.
 * @param input.bootstrapGenerationToken - Current worker bootstrap generation token.
 * @param input.resolvedConfigsByTargetId - Bootstrapped heavy target configs keyed by
 * target id.
 * @param input.lazySingleRouteCacheManager - Generation-scoped worker cache
 * manager used for RAM-first lazy-route reuse.
 * @returns Preparation result from {@link analyzeAndPrepare}, or `null` when the
 * target can no longer be analyzed.
 */
export const prepareRouteHandlerLazyMatchedRoute = async ({
  targetId,
  routePath,
  bootstrapGenerationToken,
  resolvedConfigsByTargetId,
  lazySingleRouteCacheManager
}: RouteHandlerLazyMatchedRouteInput
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
  const preparationPromise = analyzeAndPrepare({
    targetId,
    routePath,
    bootstrapGenerationToken,
    resolvedConfigsByTargetId,
    lazySingleRouteCacheManager
  }).finally(() => {
    inFlightLazyMatchedRoutePreparations.delete(preparationKey);
  });

  inFlightLazyMatchedRoutePreparations.set(preparationKey, preparationPromise);
  return preparationPromise;
};
