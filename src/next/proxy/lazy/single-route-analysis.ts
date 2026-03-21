import { createRouteHandlerRoutePlanner } from '../../../core/processor-runner';
import { computeTargetStaticCacheIdentity } from '../../cache';
import { resolveRouteHandlersAppConfig } from '../../config/app';
import { resolveRouteHandlersConfigBases } from '../../config/resolve-configs';
import { loadRegisteredSlugSplitterConfig } from '../../integration/slug-splitter-config-loader';
import { prepareRouteHandlersFromConfig } from '../../prepare';
import {
  createPersistedRoutePlanRecord,
  type PersistedRoutePlanRecord
} from '../../runtime/route-plan-record';
import {
  readLazySingleRouteCachedPlanRecord,
  writeLazySingleRouteCachedPlanRecord
} from './single-route-cache';

import type {
  RouteHandlerLazyRequestResolution,
  RouteHandlerLazySingleRouteAnalysisResult
} from './types';
import type { ResolvedRouteHandlersConfig } from '../../types';

/**
 * Single-file heavy/light analysis for the lazy dev proxy path.
 *
 * @remarks
 * This module is the second major lazy seam after request resolution.
 *
 * Responsibilities:
 * - re-resolve the full target config required for real route planning
 * - consult the lazy single-route cache
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
 * Re-resolve the full target config needed for one-file planning.
 *
 * @param input - Target-resolution input.
 * @param input.targetId - Target identifier selected by lazy request resolution.
 * @param input.localeConfig - Shared locale config captured at adapter time.
 * @returns Fully resolved target config, or `null` when the target is no
 * longer present.
 *
 * @remarks
 * Lazy request resolution intentionally uses a lightweight target shape. Once
 * we cross into real analysis, we are allowed to pay the cost of resolving the
 * processor binding and related planning inputs, because they are now actually
 * required.
 */
const resolveLazyAnalysisTargetConfig = async ({
  targetId,
  localeConfig
}: {
  targetId: string;
  localeConfig: ResolvedRouteHandlersConfig['localeConfig'];
}): Promise<ResolvedRouteHandlersConfig | null> => {
  const routeHandlersConfig = await loadRegisteredSlugSplitterConfig();

  if (routeHandlersConfig == null) {
    return null;
  }

  const appConfig = resolveRouteHandlersAppConfig({
    routeHandlersConfig
  });

  // Preparation belongs here rather than in request resolution because the
  // lightweight request-to-file seam should stay purely structural. Once we are
  // about to perform real planning work, preparation side effects are fair game.
  await prepareRouteHandlersFromConfig({
    rootDir: appConfig.rootDir,
    routeHandlersConfig
  });

  const resolvedConfigs = resolveRouteHandlersConfigBases({
    routeHandlersConfig
  }).map(resolvedConfig => ({
    ...resolvedConfig,
    localeConfig
  }));

  return (
    resolvedConfigs.find(resolvedConfig => resolvedConfig.targetId === targetId) ??
    null
  );
};

/**
 * Convert a persisted one-file route-plan record into the public lazy-analysis
 * result shape.
 *
 * @param input - Conversion input.
 * @param input.source - Whether the record came from cache or fresh analysis.
 * @param input.config - Fully resolved target config.
 * @param input.routePath - Localized content route file.
 * @param input.routePlanRecord - Persisted one-file route-plan record.
 * @returns Lazy single-route analysis result.
 */
const toLazySingleRouteAnalysisResult = ({
  source,
  config,
  routePath,
  routePlanRecord
}: {
  source: 'cache' | 'fresh';
  config: ResolvedRouteHandlersConfig;
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
 * @param input.resolution - Lazy request resolution that already matched one
 * concrete route file.
 * @returns One-file lazy analysis result, or `null` when the target can no
 * longer be resolved by the time analysis begins.
 */
export const analyzeRouteHandlerLazyMatchedRoute = async ({
  resolution
}: {
  resolution: Extract<
    RouteHandlerLazyRequestResolution,
    {
      kind: 'matched-route-file';
    }
  >;
}): Promise<RouteHandlerLazySingleRouteAnalysisResult | null> => {
  const config = await resolveLazyAnalysisTargetConfig({
    targetId: resolution.config.targetId,
    localeConfig: resolution.config.localeConfig
  });

  if (config == null) {
    // Config churn between request resolution and analysis should degrade
    // gracefully. The caller can simply keep the request on the pass-through
    // path if the target disappeared in the meantime.
    return null;
  }

  const targetIdentity = await computeTargetStaticCacheIdentity({
    config
  });
  const cachedRoutePlanRecord = readLazySingleRouteCachedPlanRecord({
    config,
    targetIdentity,
    routePath: resolution.routePath
  });

  if (cachedRoutePlanRecord != null) {
    return toLazySingleRouteAnalysisResult({
      source: 'cache',
      config,
      routePath: resolution.routePath,
      routePlanRecord: cachedRoutePlanRecord
    });
  }

  // Planner construction is intentionally deferred until the first true single-
  // route cache miss. This keeps the warm path cheap and matches the
  // just-in-time design goal of the lazy proxy flow.
  const planRoute = await createRouteHandlerRoutePlanner({
    rootDir: config.paths.rootDir,
    componentsImport: config.componentsImport,
    processorConfig: config.processorConfig,
    runtimeHandlerFactoryImportBase: config.runtimeHandlerFactoryImportBase
  });
  const routePlanRecord = await createPersistedRoutePlanRecord({
    routePath: resolution.routePath,
    config,
    planRoute
  });

  writeLazySingleRouteCachedPlanRecord({
    config,
    targetIdentity,
    routePath: resolution.routePath,
    routePlanRecord
  });

  return toLazySingleRouteAnalysisResult({
    source: 'fresh',
    config,
    routePath: resolution.routePath,
    routePlanRecord
  });
};
