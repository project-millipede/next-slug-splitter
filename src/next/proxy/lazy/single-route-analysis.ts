import { createRouteHandlerRoutePlanner } from '../../../core/processor-runner';
import {
  createPersistedRouteCaptureRecord,
  createPlannedHeavyRouteFromUsedLoadableComponentKeys,
  type PersistedRouteCaptureRecord
} from './route-plan-record';

import type { PlannedHeavyRoute } from '../../../core/types';
import type { RouteHandlerPlannerConfig } from '../../pages/types';
import type {
  RouteHandlerLazyMatchedRouteInput,
  RouteHandlerLazySingleRouteAnalysisResult
} from './types';

/**
 * Single-file heavy/light analysis for the lazy dev proxy path.
 *
 * @remarks
 * This module is the second major lazy seam after request resolution.
 *
 * Responsibilities:
 * - read the already-bootstrapped target config required for real route planning
 * - consult the Stage 1 lazy single-route cache for reusable MDX-capture facts
 * - run capture for exactly one content file on a Stage 1 miss
 * - reconstruct heavy-route processor planning in memory when needed
 *
 * Non-responsibilities:
 * - deciding whether the request should rewrite or pass through
 * - emitting generated handler files
 *
 * That separation is intentional. This module answers only:
 * "for this one concrete content file, what is the one-file planning result?"
 */

/**
 * Create the public lazy-analysis result shape for one light route.
 *
 * @param input - Result input.
 * @returns Light lazy single-route analysis result.
 */
const createLazyLightAnalysisResult = ({
  source,
  config,
  routePath
}: {
  source: 'cache' | 'fresh';
  config: RouteHandlerPlannerConfig;
  routePath: RouteHandlerLazySingleRouteAnalysisResult['routePath'];
}): RouteHandlerLazySingleRouteAnalysisResult => ({
  kind: 'light',
  source,
  config,
  routePath
});

/**
 * Create the public lazy-analysis result shape for one heavy route.
 *
 * @param input - Result input.
 * @returns Heavy lazy single-route analysis result.
 */
const createLazyHeavyAnalysisResult = ({
  source,
  config,
  routePath,
  plannedHeavyRoute
}: {
  source: 'cache' | 'fresh';
  config: RouteHandlerPlannerConfig;
  routePath: RouteHandlerLazySingleRouteAnalysisResult['routePath'];
  plannedHeavyRoute: PlannedHeavyRoute;
}): RouteHandlerLazySingleRouteAnalysisResult => ({
  kind: 'heavy',
  source,
  config,
  routePath,
  plannedHeavyRoute
});

/**
 * Reconstruct one heavy-route analysis result from trusted Stage 1 capture
 * facts.
 *
 * @param input - Reconstruction input.
 * @returns Heavy lazy single-route analysis result.
 */
const createLazyHeavyAnalysisResultFromCaptureRecord = async ({
  source,
  config,
  routePath,
  routeCaptureRecord,
  planRoute
}: {
  source: 'cache' | 'fresh';
  config: RouteHandlerPlannerConfig;
  routePath: RouteHandlerLazySingleRouteAnalysisResult['routePath'];
  routeCaptureRecord: PersistedRouteCaptureRecord;
  planRoute: Awaited<ReturnType<typeof createRouteHandlerRoutePlanner>>;
}): Promise<RouteHandlerLazySingleRouteAnalysisResult> => {
  const plannedHeavyRoute =
    await createPlannedHeavyRouteFromUsedLoadableComponentKeys(
      routePath,
      config,
      routeCaptureRecord.usedLoadableComponentKeys,
      planRoute
    );

  return createLazyHeavyAnalysisResult({
    source,
    config,
    routePath,
    plannedHeavyRoute
  });
};

/**
 * Analyze one lazy matched route file and return the one-file planning result.
 *
 * @param input - Analysis input.
 * @param input.targetId - Target identifier selected by lazy request resolution.
 * @param input.routePath - Concrete localized content route file to analyze.
 * @param input.resolvedConfigsByTargetId - Bootstrapped heavy target configs keyed by
 * target id.
 * @param input.lazySingleRouteCacheManager - Generation-scoped worker cache
 * manager used for RAM-first reuse.
 * @returns One-file lazy analysis result, or `null` when the target can no
 * longer be resolved by the time analysis begins.
 */
export const analyzeRouteHandlerLazyMatchedRoute = async ({
  targetId,
  routePath,
  resolvedConfigsByTargetId,
  lazySingleRouteCacheManager
}: RouteHandlerLazyMatchedRouteInput): Promise<RouteHandlerLazySingleRouteAnalysisResult | null> => {
  // Worker bootstrap already resolved target configs up front, so request-time
  // analysis reads the target config directly from that in-memory map.
  const config = resolvedConfigsByTargetId.get(targetId) ?? null;

  if (config == null) {
    // Config churn between request resolution and analysis should degrade
    // gracefully. The caller can simply keep the request on the pass-through
    // path if the target disappeared in the meantime.
    return null;
  }

  let planRoutePromise: Promise<
    Awaited<ReturnType<typeof createRouteHandlerRoutePlanner>>
  > | null = null;
  const resolvePlanRoute = async (): Promise<
    Awaited<ReturnType<typeof createRouteHandlerRoutePlanner>>
  > => {
    if (planRoutePromise == null) {
      // Stage 1 hits with empty `usedLoadableComponentKeys` return `light`
      // immediately, so processor planner construction stays lazy and happens
      // only when a heavy route needs in-memory reconstruction.
      planRoutePromise = createRouteHandlerRoutePlanner({
        rootDir: config.paths.rootDir,
        processorConfig: config.processorConfig
      });
    }

    return planRoutePromise;
  };
  const cachedRouteCaptureRecord =
    lazySingleRouteCacheManager.readCachedRouteCaptureRecord(config, routePath);

  if (cachedRouteCaptureRecord != null) {
    // The cache manager already validated the root entry file separately from
    // every persisted transitive MDX module path, so this Stage 1 hit can
    // trust cached component keys and skip MDX capture entirely.
    if (cachedRouteCaptureRecord.usedLoadableComponentKeys.length === 0) {
      return createLazyLightAnalysisResult({
        source: 'cache',
        config,
        routePath
      });
    }

    return createLazyHeavyAnalysisResultFromCaptureRecord({
      source: 'cache',
      config,
      routePath,
      routeCaptureRecord: cachedRouteCaptureRecord,
      planRoute: await resolvePlanRoute()
    });
  }

  const routeCaptureRecord = await createPersistedRouteCaptureRecord(
    routePath,
    config
  );
  lazySingleRouteCacheManager.writeCachedRouteCaptureRecord(
    config,
    routePath,
    routeCaptureRecord
  );

  if (routeCaptureRecord.usedLoadableComponentKeys.length === 0) {
    // Negative-result caching is a first-class Stage 1 outcome. Once the root
    // and transitive MDX files remain unchanged, later requests can trust this
    // empty key set and skip MDX capture plus planner creation entirely.
    return createLazyLightAnalysisResult({
      source: 'fresh',
      config,
      routePath
    });
  }

  return createLazyHeavyAnalysisResultFromCaptureRecord({
    source: 'fresh',
    config,
    routePath,
    routeCaptureRecord,
    planRoute: await resolvePlanRoute()
  });
};
