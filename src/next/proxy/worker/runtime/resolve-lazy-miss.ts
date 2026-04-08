import { prepareRouteHandlerLazyMatchedRoute } from '../../lazy/cold-request-dedupe';
import { resolveRouteHandlerLazyRequest } from '../../lazy/request-resolution';
import { resolveRouteHandlerLazyRewriteDestination } from '../../lazy/single-route-rewrite';
import { removeRouteHandlerLazyOutputForIdentity } from '../../lazy/stale-output-cleanup';
import { debugRouteHandlerProxyWorker } from '../debug-log';

import type { RouteHandlerProxyWorkerBootstrapState } from './bootstrap';
import type { RouteHandlerProxyWorkerResponse } from '../types';

/**
 * Worker-runtime lazy-miss resolution pipeline.
 *
 * @remarks
 * This module owns the semantic cold-path work that the thin host proxy must
 * not import directly:
 * - resolve a public pathname to one concrete content route when possible
 * - prepare that route as light or heavy
 * - compute rewrite destinations for heavy routes
 * - emit or clean up lazy output as required
 *
 * The host process intentionally receives only the compact serialized result so
 * the heavy MDX-analysis graph stays isolated inside the worker runtime.
 */

/**
 * Resolve one proxy lazy miss completely inside the worker process.
 *
 * @remarks
 * This worker owns the full cold lazy-miss protocol that would otherwise drag
 * the heavy MDX-analysis graph into the main proxy bundle:
 * - resolve the request pathname to one concrete route file when possible
 * - prepare that one matched route as light or heavy
 * - resolve the rewrite destination for heavy routes
 * - emit one handler on demand when heavy preparation requires it
 * - remove stale lazy output when the route is light or missing
 *
 * The parent proxy runtime intentionally receives only a compact semantic
 * result so it can stay focused on request transport and response
 * materialization.
 *
 * @param pathname - Public pathname being handled by proxy.
 * @param bootstrapState - Bootstrapped worker state for the current generation.
 * @returns Serialized semantic result for the thin proxy runtime.
 */
export const resolveRouteHandlerProxyLazyMiss = async (
  pathname: string,
  bootstrapState: RouteHandlerProxyWorkerBootstrapState
): Promise<RouteHandlerProxyWorkerResponse> => {
  debugRouteHandlerProxyWorker('lazy-miss:start', {
    pathname,
    bootstrapGenerationToken: bootstrapState.bootstrapGenerationToken,
    targetCount: bootstrapState.lazyResolvedTargets.length
  });

  const lazyRequestResolution = await resolveRouteHandlerLazyRequest(
    pathname,
    bootstrapState.lazyResolvedTargets
  );

  debugRouteHandlerProxyWorker('lazy-miss:request-resolution', {
    pathname,
    resolutionKind: lazyRequestResolution.kind
  });

  if (lazyRequestResolution.kind === 'matched-route-file') {
    const lazyMatchedRoutePreparation =
      await prepareRouteHandlerLazyMatchedRoute({
        targetId: lazyRequestResolution.config.targetId,
        routePath: lazyRequestResolution.routePath,
        resolvedConfigsByTargetId: bootstrapState.resolvedConfigsByTargetId,
        lazySingleRouteCacheManager: bootstrapState.lazySingleRouteCacheManager
      });

    if (lazyMatchedRoutePreparation?.kind === 'heavy') {
      const rewriteDestination = resolveRouteHandlerLazyRewriteDestination(
        pathname,
        lazyMatchedRoutePreparation.analysisResult
      );

      if (rewriteDestination != null) {
        return {
          kind: 'heavy',
          handlerSynchronizationStatus:
            lazyMatchedRoutePreparation.handlerSynchronizationStatus,
          rewriteDestination,
          routeBasePath:
            lazyMatchedRoutePreparation.analysisResult.config.routeBasePath
        };
      }

      return {
        kind: 'pass-through',
        reason: 'missing-rewrite-destination'
      };
    }

    if (lazyMatchedRoutePreparation?.kind === 'light') {
      await removeRouteHandlerLazyOutputForIdentity({
        config: lazyMatchedRoutePreparation.analysisResult.config,
        identity: {
          locale: lazyMatchedRoutePreparation.analysisResult.routePath.locale,
          slugArray:
            lazyMatchedRoutePreparation.analysisResult.routePath.slugArray
        }
      });

      return {
        kind: 'pass-through',
        reason: 'light'
      };
    }
  } else if (lazyRequestResolution.kind === 'missing-route-file') {
    await removeRouteHandlerLazyOutputForIdentity({
      config: lazyRequestResolution.config,
      identity: lazyRequestResolution.identity
    });

    return {
      kind: 'pass-through',
      reason: 'missing-route-file'
    };
  }

  return {
    kind: 'pass-through',
    reason: 'no-target'
  };
};
