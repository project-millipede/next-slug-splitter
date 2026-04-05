import { createRouteHandlerRoutePlanner } from '../../../core/processor-runner';
import {
  createPersistedRoutePlanRecord,
  type PersistedRoutePlanRecord
} from '../../runtime/target/route-plan-record';
import {
  readLazySingleRouteCachedPlanRecord,
  writeLazySingleRouteCachedPlanRecord
} from './single-route-cache';

import type { RouteHandlerPlannerConfig } from '../../types';
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
 * - consult the lazy single-route cache for reusable one-file results
 * - run capture + processor planning for exactly one content file on a miss
 *
 * Non-responsibilities:
 * - deciding whether the request should rewrite or pass through
 * - emitting generated handler files
 *
 * That separation is intentional. This module answers only:
 * "for this one concrete content file, what is the one-file planning result?"
 */

/**
 * Read the already-bootstrapped target config needed for one-file planning.
 *
 * @param targetId - Target identifier selected by lazy request resolution.
 * @param resolvedConfigsByTargetId - Bootstrapped target configs keyed by
 * stable target id.
 * @returns Fully resolved target config, or `null` when the target is no
 * longer present.
 *
 * @remarks
 * Worker bootstrap intentionally pays the heavy config-resolution cost once up
 * front. The request-time analysis path then reads the bootstrapped config
 * from memory instead of reloading config or running prepare again.
 */
const resolveLazyAnalysisTargetConfig = (
  targetId: string,
  resolvedConfigsByTargetId: ReadonlyMap<string, RouteHandlerPlannerConfig>
): RouteHandlerPlannerConfig | null =>
  resolvedConfigsByTargetId.get(targetId) ?? null;

/**
 * Convert a persisted one-file route-plan record into the public lazy-analysis
 * result shape.
 *
 * @param input - Conversion input.
 * @returns Lazy single-route analysis result.
 */
const toLazySingleRouteAnalysisResult = ({
  source,
  config,
  routePath,
  routePlanRecord
}: {
  source: 'cache' | 'fresh';
  config: RouteHandlerPlannerConfig;
  routePath: RouteHandlerLazySingleRouteAnalysisResult['routePath'];
  routePlanRecord: PersistedRoutePlanRecord;
}): RouteHandlerLazySingleRouteAnalysisResult =>
  routePlanRecord.plannedHeavyRoute == null
    ? {
        kind: 'light',
        source,
        config,
        routePath
      }
    : {
        kind: 'heavy',
        source,
        config,
        routePath,
        plannedHeavyRoute: routePlanRecord.plannedHeavyRoute
      };

/**
 * Analyze one lazy matched route file and return the one-file planning result.
 *
 * @param input - Analysis input.
 * @param input.targetId - Target identifier selected by lazy request resolution.
 * @param input.routePath - Concrete localized content route file to analyze.
 * @param input.bootstrapGenerationToken - Current worker bootstrap generation token.
 * @param input.resolvedConfigsByTargetId - Bootstrapped heavy target configs keyed by
 * target id.
 * @returns One-file lazy analysis result, or `null` when the target can no
 * longer be resolved by the time analysis begins.
 */
export const analyzeRouteHandlerLazyMatchedRoute = async ({
  targetId,
  routePath,
  bootstrapGenerationToken,
  resolvedConfigsByTargetId
}: RouteHandlerLazyMatchedRouteInput): Promise<
  RouteHandlerLazySingleRouteAnalysisResult | null
> => {
  const config = resolveLazyAnalysisTargetConfig(
    targetId,
    resolvedConfigsByTargetId
  );

  if (config == null) {
    // Config churn between request resolution and analysis should degrade
    // gracefully. The caller can simply keep the request on the pass-through
    // path if the target disappeared in the meantime.
    return null;
  }

  const cachedRoutePlanRecord = readLazySingleRouteCachedPlanRecord(
    config,
    routePath,
    bootstrapGenerationToken
  );

  if (cachedRoutePlanRecord != null) {
    return toLazySingleRouteAnalysisResult({
      source: 'cache',
      config,
      routePath,
      routePlanRecord: cachedRoutePlanRecord
    });
  }

  // Planner construction is intentionally deferred until the first true single-
  // route cache miss. This keeps the warm path cheap and matches the
  // just-in-time design goal of the lazy proxy flow.
  const planRoute = await createRouteHandlerRoutePlanner({
    rootDir: config.paths.rootDir,
    processorConfig: config.processorConfig
  });
  const routePlanRecord = await createPersistedRoutePlanRecord(
    routePath,
    config,
    planRoute
  );

  writeLazySingleRouteCachedPlanRecord(
    config,
    routePath,
    routePlanRecord,
    bootstrapGenerationToken
  );

  return toLazySingleRouteAnalysisResult({
    source: 'fresh',
    config,
    routePath,
    routePlanRecord
  });
};
