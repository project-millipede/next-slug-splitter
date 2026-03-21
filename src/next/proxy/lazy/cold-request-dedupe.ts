import { analyzeRouteHandlerLazyMatchedRoute } from './single-route-analysis';
import { emitRouteHandlerLazySingleHandler } from './single-handler-emission';

import type {
  RouteHandlerLazyMatchedRoutePreparationResult,
  RouteHandlerLazyRequestResolution
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
 * Build the dedupe key for one matched lazy-route preparation unit.
 *
 * @param resolution - Already matched lazy request resolution.
 * @returns Stable process-local dedupe key.
 *
 * @remarks
 * The key is based on:
 * - target id
 * - concrete content file path
 *
 * That means concurrent requests for:
 * - `/blog/post`
 * - `/en/blog/post`
 *
 * can still share one underlying analysis/emission run when they resolve to
 * the same target and source file.
 */
const createLazyMatchedRoutePreparationKey = (
  resolution: Extract<
    RouteHandlerLazyRequestResolution,
    {
      kind: 'matched-route-file';
    }
  >
): string =>
  JSON.stringify([resolution.config.targetId, resolution.routePath.filePath]);

/**
 * Prepare one matched lazy route for request-time rewriting with process-local
 * cold-request dedupe.
 *
 * @param input - Preparation input.
 * @param input.resolution - Already matched lazy request resolution.
 * @returns One-file lazy analysis result after any required emission, or `null`
 * when the target can no longer be analyzed.
 *
 * @remarks
 * This helper owns the shared work unit for a cold lazy request:
 * 1. analyze exactly one matched content file
 * 2. if heavy, ensure exactly one generated handler file exists
 *
 * Historically, this helper returned only the heavy/light analysis result.
 * That turned out not to be enough for correct first-request routing in dev.
 *
 * Why not?
 * - The analysis result can correctly say "heavy".
 * - The single-handler emitter can correctly write the generated page file.
 * - Yet a same-request rewrite can still fail once after a totally clean
 *   start, because Next/Turbopack may need one more discovery/compile turn
 *   before that new page is actually routable.
 *
 * So this helper now returns a richer preparation result:
 * - the route truth (`light` or `heavy`)
 * - plus the fully planned heavy analysis result needed for rewrite
 *   destination resolution and lazy discovery publication
 *
 * That lets request routing react semantically instead of reverse-engineering
 * meaning from low-level file-write status in multiple places.
 */
export const prepareRouteHandlerLazyMatchedRoute = async ({
  resolution
}: {
  resolution: Extract<
    RouteHandlerLazyRequestResolution,
    {
      kind: 'matched-route-file';
    }
  >;
}): Promise<RouteHandlerLazyMatchedRoutePreparationResult | null> => {
  const preparationKey = createLazyMatchedRoutePreparationKey(resolution);
  const existingPreparation = inFlightLazyMatchedRoutePreparations.get(
    preparationKey
  );

  if (existingPreparation != null) {
    // This is the core cold-request dedupe branch. A concurrent request already
    // started the shared one-file analysis/emission workflow for the same
    // target/file pair, so this request simply waits for that work to finish.
    return existingPreparation;
  }

  const preparationPromise = (async () => {
    const analysisResult = await analyzeRouteHandlerLazyMatchedRoute({
      resolution
    });

    if (analysisResult?.kind === 'heavy') {
      // Heavy routes need a concrete generated handler file before request-time
      // rewriting can be correct. The emission itself is still isolated in its
      // own module; this dedupe layer only coordinates whether that module
      // should run once or many times for concurrent callers.
      const emissionResult = await emitRouteHandlerLazySingleHandler({
        analysisResult
      });

      return {
        kind: 'heavy',
        analysisResult,
        // The dedupe layer deliberately translates low-level file sync status
        // into the higher-level routing concept that the request layer
        // actually cares about.
        //
      } satisfies RouteHandlerLazyMatchedRoutePreparationResult;
    }

    if (analysisResult?.kind === 'light') {
      return {
        kind: 'light',
        analysisResult
      } satisfies RouteHandlerLazyMatchedRoutePreparationResult;
    }

    return null;
  })().finally(() => {
    // The dedupe slot is intentionally cleared after completion so later
    // requests can observe content changes or cache invalidations instead of
    // being pinned to one long-lived in-memory snapshot.
    inFlightLazyMatchedRoutePreparations.delete(preparationKey);
  });

  inFlightLazyMatchedRoutePreparations.set(preparationKey, preparationPromise);
  return preparationPromise;
};
