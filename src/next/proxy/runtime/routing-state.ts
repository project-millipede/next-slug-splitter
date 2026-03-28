import {
  clearRouteHandlerProxyBootstrapStateCache,
  getRouteHandlerProxyBootstrapState
} from './bootstrap-state';

import type {
  RouteHandlerProxyOptions,
  RouteHandlerProxyRoutingState
} from './types';

/**
 * Request-time routing-state loading for the dev proxy path.
 *
 * @remarks
 * This module owns the thin proxy runtime's lightweight bootstrap view:
 * - whether splitter config currently exists
 * - which route bases are configured for diagnostics
 * - which bootstrap generation token the lazy worker should use
 *
 * It deliberately does not decide what one specific request should do. That
 * higher-level request decision lives in `request-routing.ts`.
 */

/**
 * Convert lightweight bootstrap state into the request-time routing-state
 * shape consumed by the proxy decision layer.
 *
 * @param input - State construction input.
 * @returns Lightweight request-time routing state.
 */
const buildRouteHandlerProxyRoutingState = ({
  bootstrapState
}: {
  bootstrapState: Awaited<ReturnType<typeof getRouteHandlerProxyBootstrapState>>;
}): RouteHandlerProxyRoutingState => {
  // The thin proxy runtime intentionally keeps no long-lived exact heavy-route
  // rewrite map. Cold heavy discovery lives in the worker session; the parent
  // process only carries enough bootstrap state to decide whether a worker is
  // needed and which generation it should be using.
  return {
    rewriteBySourcePath: new Map(),
    targetRouteBasePaths: [...bootstrapState.targetRouteBasePaths],
    hasConfiguredTargets: bootstrapState.hasConfiguredTargets,
    bootstrapGenerationToken: bootstrapState.bootstrapGenerationToken
  };
};

/**
 * Load fresh routing state for the proxy request-decision layer.
 *
 * @param input - Routing-state load input.
 * @param input.localeConfig - Shared app locale config captured at adapter time.
 * @returns Fresh request-time routing state.
 */
const loadFreshRouteHandlerProxyRoutingState = async ({
  localeConfig,
  configRegistration
}: RouteHandlerProxyOptions): Promise<RouteHandlerProxyRoutingState> => {
  const bootstrapState = await getRouteHandlerProxyBootstrapState(
    localeConfig,
    configRegistration
  );

  return buildRouteHandlerProxyRoutingState({
    bootstrapState
  });
};

/**
 * Get proxy routing state for the thin request-decision layer.
 *
 * @param input - Routing-state request input.
 * @param input.localeConfig - Shared app locale config captured at adapter time.
 * @returns Request-time routing state.
 *
 * @remarks
 * Long-lived reuse now belongs to the dedicated proxy bootstrap-state layer.
 * This wrapper simply exposes that state in the narrow request-facing shape.
 */
export const getRouteHandlerProxyRoutingState = async ({
  localeConfig,
  configRegistration
}: RouteHandlerProxyOptions): Promise<RouteHandlerProxyRoutingState> => {
  return loadFreshRouteHandlerProxyRoutingState({
    localeConfig,
    ...(configRegistration == null ? {} : { configRegistration })
  });
};

export { clearRouteHandlerProxyBootstrapStateCache };
