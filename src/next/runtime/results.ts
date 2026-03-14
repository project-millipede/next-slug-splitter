import { dedupeRewriteIdentities } from '../rewrite-identity';
import { buildRouteRewriteEntries } from '../rewrites';

import type { RouteHandlerPipelineResult } from '../../core/types';
import type {
  ResolvedRouteHandlersConfig,
  RouteHandlerNextResult
} from '../types';

/**
 * Convert one core pipeline result into the Next integration result shape.
 *
 * @remarks
 * Target tagging is what lets one shared cache record preserve docs/blog
 * separation for later lookup and generation ownership.
 *
 * @param input - Result construction input.
 * @returns Next integration result for one target.
 */
export const buildRouteHandlerNextResult = ({
  config,
  pipelineResult
}: {
  /**
   * Resolved target config that owns the result.
   */
  config: ResolvedRouteHandlersConfig;
  /**
   * Core pipeline result for the target.
   */
  pipelineResult: RouteHandlerPipelineResult;
}): RouteHandlerNextResult => ({
  analyzedCount: pipelineResult.analyzedCount,
  heavyCount: pipelineResult.heavyCount,
  // Target tagging is what lets one shared cache record preserve docs/blog
  // separation for later lookup and generation ownership.
  heavyPaths: pipelineResult.heavyPaths.map(heavyRoute => ({
    ...heavyRoute,
    targetId: config.targetId
  })),
  rewrites: buildRouteRewriteEntries({
    heavyRoutes: pipelineResult.heavyPaths,
    defaultLocale: config.localeConfig.defaultLocale,
    routeBasePath: config.routeBasePath
  })
});

/**
 * Merge target-local Next results into the shared cache result shape.
 *
 * @remarks
 * The cache remains one shared record, but heavy-route entries keep their
 * `targetId` so target-local ownership can be recovered later.
 *
 * @param input - Merge input.
 * @returns One merged cache result for all configured targets.
 */
export const mergeRouteHandlerNextResults = ({
  results
}: {
  /**
   * Target-local Next results.
   */
  results: Array<RouteHandlerNextResult>;
}): RouteHandlerNextResult => {
  const analyzedCount = results.reduce(
    (count, result) => count + result.analyzedCount,
    0
  );
  const heavyCount = results.reduce(
    (count, result) => count + result.heavyCount,
    0
  );
  const heavyPaths = results.flatMap(result => result.heavyPaths);
  const rewrites = results.flatMap(result => result.rewrites);

  return {
    analyzedCount,
    heavyCount,
    heavyPaths,
    rewrites: dedupeRewriteIdentities(rewrites)
  };
};
