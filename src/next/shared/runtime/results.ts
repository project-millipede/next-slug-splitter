import {
  buildRouteRewriteBuckets,
  type RouteHandlerGeneratedDestinationOptions,
  type RouteHandlerRewriteTargetConfig
} from '../rewrites/index';

import type { RouteHandlerPipelineResult } from '../../../core/types';
import type {
  ResolvedRouteHandlersConfigBase,
  RouteHandlerNextResult
} from '../types';

type RouteHandlerResultConfig = Pick<
  ResolvedRouteHandlersConfigBase,
  'targetId'
> &
  RouteHandlerRewriteTargetConfig;

type RouteHandlerNextResultOptions = RouteHandlerGeneratedDestinationOptions;

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
export const buildRouteHandlerNextResultWithRuntimeHarness = <
  TResolvedConfig extends RouteHandlerResultConfig
>(
  config: TResolvedConfig,
  pipelineResult: RouteHandlerPipelineResult,
  options: RouteHandlerNextResultOptions = {}
): RouteHandlerNextResult => {
  const rewriteBuckets = buildRouteRewriteBuckets(
    pipelineResult.heavyPaths,
    config.localeConfig,
    config.routeBasePath,
    config.handlerRouteSegment,
    options.generatedHandlersAreLocaleScoped
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
