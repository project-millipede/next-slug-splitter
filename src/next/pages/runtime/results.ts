import { buildRouteRewriteBuckets } from '../../shared/rewrites/index';

import type { RouteHandlerPipelineResult } from '../../../core/types';
import type { RouteHandlerNextResult } from '../../shared/types';
import type { ResolvedRouteHandlersConfig } from '../types';

/**
 * Convert one core pipeline result into the Next integration result shape.
 *
 * @remarks
 * Target tagging is what lets one shared cache record preserve docs/blog
 * separation for later lookup and generation ownership.
 *
 * @param config - Resolved target config that owns the result.
 * @param pipelineResult - Core pipeline result for the target.
 * @returns Next integration result for one target.
 */
export const buildRouteHandlerNextResult = (
  config: ResolvedRouteHandlersConfig,
  pipelineResult: RouteHandlerPipelineResult
): RouteHandlerNextResult => {
  const rewriteBuckets = buildRouteRewriteBuckets(
    pipelineResult.heavyPaths,
    config.localeConfig,
    config.routeBasePath
  );

  return {
    targetId: config.targetId,
    analyzedCount: pipelineResult.analyzedCount,
    heavyCount: pipelineResult.heavyCount,
    // Target tagging is what lets one shared cache record preserve docs/blog
    // separation for later lookup and generation ownership.
    heavyPaths: pipelineResult.heavyPaths.map(heavyRoute => ({
      ...heavyRoute,
      targetId: config.targetId
    })),
    rewrites: rewriteBuckets.rewrites,
    rewritesOfDefaultLocale: rewriteBuckets.rewritesOfDefaultLocale
  };
};
