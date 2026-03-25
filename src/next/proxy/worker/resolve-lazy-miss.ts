import { resolveRouteHandlerLazyRequest } from '../lazy/request-resolution';
import { removeRouteHandlerLazyOutputForIdentity } from '../lazy/stale-output-cleanup';
import { resolveRouteHandlerLazyRewriteDestination } from '../lazy/single-route-rewrite';
import { prepareRouteHandlerLazyMatchedRoute } from '../lazy/cold-request-dedupe';
import { getRouteHandlerProxyRoutingState } from '../runtime/routing-state';
import { debugRouteHandlerProxyWorker } from './debug-log';

import type { RouteHandlerProxyWorkerResponse } from './types';
import type { LocaleConfig } from '../../../core/types';

/**
 * Resolve one proxy lazy miss completely inside the worker process.
 *
 * @param input - Worker-resolution input.
 * @param input.pathname - Public pathname being handled by proxy.
 * @param input.localeConfig - Locale config captured by the generated root proxy.
 * @returns Serialized semantic result for the thin proxy runtime.
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
 * result so it can stay focused on request transport, warm-up, and response
 * materialization.
 */
export const resolveRouteHandlerProxyLazyMiss = async ({
  pathname,
  localeConfig
}: {
  pathname: string;
  localeConfig: LocaleConfig;
}): Promise<RouteHandlerProxyWorkerResponse> => {
  debugRouteHandlerProxyWorker('lazy-miss:start', {
    pathname,
    localeConfig
  });

  const routingState = await getRouteHandlerProxyRoutingState({
    localeConfig
  });

  debugRouteHandlerProxyWorker('lazy-miss:routing-state', {
    pathname,
    targetRouteBasePaths: routingState.targetRouteBasePaths,
    rewriteCount: routingState.rewriteBySourcePath.size
  });

  const lazyRequestResolution = await resolveRouteHandlerLazyRequest({
    pathname,
    localeConfig
  });

  debugRouteHandlerProxyWorker('lazy-miss:request-resolution', {
    pathname,
    resolutionKind: lazyRequestResolution.kind
  });

  if (lazyRequestResolution.kind === 'matched-route-file') {
    const lazyMatchedRoutePreparation =
      await prepareRouteHandlerLazyMatchedRoute(
        lazyRequestResolution.config.targetId,
        lazyRequestResolution.config.localeConfig,
        lazyRequestResolution.routePath
      );

    if (lazyMatchedRoutePreparation?.kind === 'heavy') {
      const rewriteDestination = resolveRouteHandlerLazyRewriteDestination({
        pathname,
        analysisResult: lazyMatchedRoutePreparation.analysisResult
      });

      if (rewriteDestination != null) {
        return {
          kind: 'heavy',
          source: lazyMatchedRoutePreparation.analysisResult.source,
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
