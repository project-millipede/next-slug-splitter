import {
  createHeavyRoutePlanner,
  type PlanHeavyRoute
} from '../../../core/heavy-route-planning';
import {
  createPersistedRouteCaptureRecord,
  type PersistedRouteCaptureRecord
} from './route-plan-record';

import type {
  LocalizedRoutePath,
  PlannedHeavyRoute
} from '../../../core/types';
import type {
  RouteHandlerLazyPlannerConfig,
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
  config: RouteHandlerLazyPlannerConfig;
  routePath: LocalizedRoutePath;
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
  config: RouteHandlerLazyPlannerConfig;
  routePath: LocalizedRoutePath;
  plannedHeavyRoute: PlannedHeavyRoute;
}): RouteHandlerLazySingleRouteAnalysisResult => ({
  kind: 'heavy',
  source,
  config,
  routePath,
  plannedHeavyRoute
});

/**
 * Reconstruct one lazy analysis result from trusted Stage 1 capture facts.
 *
 * @remarks
 * Stage 1 reuse persists only MDX-capture facts. It does not persist processor
 * output, because processor resolution can depend on current app code and
 * should be rebuilt for each valid captured-component hit.
 *
 * The prepared heavy-route planner reruns processor planning from the captured
 * component keys stored in the record:
 * 1. If processor planning emits component entries, this returns a heavy
 *    analysis result.
 * 2. If every captured component is omitted by the processor, this returns a
 *    light analysis result so the route stays on the MDX component scope path.
 *
 * @param input - Reconstruction input.
 * @returns Lazy single-route analysis result after reconstructing processor
 * planning from the capture record.
 */
const createLazyAnalysisResultFromCaptureRecord = async ({
  source,
  config,
  routePath,
  routeCaptureRecord,
  planHeavyRoute
}: {
  source: 'cache' | 'fresh';
  config: RouteHandlerLazyPlannerConfig;
  routePath: LocalizedRoutePath;
  routeCaptureRecord: PersistedRouteCaptureRecord;
  planHeavyRoute: PlanHeavyRoute;
}): Promise<RouteHandlerLazySingleRouteAnalysisResult> => {
  const plannedHeavyRoute = await planHeavyRoute(
    routePath,
    routeCaptureRecord.usedLoadableComponentKeys
  );

  if (plannedHeavyRoute == null) {
    // No component entries were emitted, so this route remains on the MDX
    // component scope path; lazy analysis returns a light result.
    return createLazyLightAnalysisResult({ source, config, routePath });
  }

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

  let planHeavyRoutePromise: Promise<PlanHeavyRoute> | null = null;
  const resolvePlanHeavyRoute = async (): Promise<PlanHeavyRoute> => {
    if (planHeavyRoutePromise == null) {
      // Stage 1 hits with empty `usedLoadableComponentKeys` return `light`
      // immediately, so heavy-route planner construction stays lazy and
      // happens only when a heavy route needs in-memory reconstruction.
      planHeavyRoutePromise = createHeavyRoutePlanner(
        config.paths.rootDir,
        config.processorConfig,
        config
      );
    }

    return planHeavyRoutePromise;
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

    return createLazyAnalysisResultFromCaptureRecord({
      source: 'cache',
      config,
      routePath,
      routeCaptureRecord: cachedRouteCaptureRecord,
      planHeavyRoute: await resolvePlanHeavyRoute()
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

  return createLazyAnalysisResultFromCaptureRecord({
    source: 'fresh',
    config,
    routePath,
    routeCaptureRecord,
    planHeavyRoute: await resolvePlanHeavyRoute()
  });
};
