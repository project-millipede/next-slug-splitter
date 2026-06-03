import { buildRouteRewriteBuckets } from '../rewrites/index'

import type {
  LocaleConfig,
  PlannedHeavyRoute,
  RouteHandlerPipelineResult
} from '../../../core/types'
import type {
  ResolvedRouteHandlersConfigBase,
  RouteHandlerNextResult
} from '../types'

type RouteHandlerResultConfig = Pick<
  ResolvedRouteHandlersConfigBase,
  'targetId' | 'routeBasePath'
> & {
  /**
   * Normalized locale configuration for the current router path.
   */
  localeConfig: LocaleConfig;
  /**
   * Internal route segment owning generated handler pages.
   */
  handlerRouteSegment?: string;
}

/**
 * Convert one core pipeline result into the Next integration result shape.
 *
 * @remarks
 * Two derivations happen here:
 * 1. rewrite buckets are built from `rewriteHeavyPaths` (which may carry merged,
 *    locale-less destinations), and
 * 2. the returned `heavyPaths` are tagged with `targetId` so one shared cache
 *    record preserves docs/blog separation for later lookup and ownership.
 *
 * @param config - Resolved target config that owns the result.
 * @param pipelineResult - Core pipeline result for the target.
 * @param rewriteHeavyPaths - Heavy routes used to build rewrite destinations;
 *   defaults to `pipelineResult.heavyPaths`. A router applying the build-only
 *   `K = 1` merge passes routes whose merged groups point at one locale-less
 *   destination, while the returned `heavyPaths` (the lookup set) stay
 *   per-locale.
 * @returns Next integration result for one target.
 */
export const buildRouteHandlerNextResultWithRuntimeHarness = <
  TResolvedConfig extends RouteHandlerResultConfig
>(
  config: TResolvedConfig,
  pipelineResult: RouteHandlerPipelineResult,
  rewriteHeavyPaths: Array<PlannedHeavyRoute> = pipelineResult.heavyPaths
): RouteHandlerNextResult => {
  const rewriteBuckets = buildRouteRewriteBuckets(
    rewriteHeavyPaths,
    config.localeConfig,
    config.routeBasePath,
    config.handlerRouteSegment
  )

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
  }
}
