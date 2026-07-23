import { buildRouteHandlerNextResultWithRuntimeHarness } from '../../shared/runtime/results';
import { preservePagesRouterLocaleInRewriteDestination } from '../rewrites/destination';

import type { RouteHandlerPipelineResult } from '../../../core/types';
import type { RouteHandlerNextResult } from '../../shared/types';
import type { ResolvedRouteHandlersConfig } from '../types';

/**
 * Build the stable Pages Router integration result for one target.
 *
 * Multi-locale Pages rewrites carry their route locale as the leading
 * generated-handler destination segment. The Pages-shared transform remains a
 * no-op for single-locale configurations.
 *
 * Lazy proxy planning does not use this runtime harness. It keeps its
 * locale-less planning destination and applies the same Pages transform later,
 * at the proxy transport boundary.
 *
 * @param config - Resolved Pages target config.
 * @param pipelineResult - Core route-handler pipeline result.
 * @returns Pages integration result with build-safe rewrite destinations.
 */
export const buildRouteHandlerNextResult = (
  config: ResolvedRouteHandlersConfig,
  pipelineResult: RouteHandlerPipelineResult
): RouteHandlerNextResult =>
  buildRouteHandlerNextResultWithRuntimeHarness(config, pipelineResult, {
    transformGeneratedHandlerDestination: (
      rewriteDestination,
      routeLocale
    ) =>
      preservePagesRouterLocaleInRewriteDestination(
        rewriteDestination,
        routeLocale,
        config.localeConfig
      )
  });
