import { resolveRouteHandlersAppConfig } from '../../config/app';
import { resolveRouteHandlersConfigBases } from '../../config/resolve-configs';
import { loadRegisteredSlugSplitterConfig } from '../../integration/slug-splitter-config-loader';
import { prepareRouteHandlersFromConfig } from '../../prepare';
import { readResolvedRouteBasePaths } from './shared';

import type {
  ResolvedRouteHandlersConfig,
  RouteHandlerNextResult
} from '../../types';
import type {
  RouteHandlerProxyOptions,
  RouteHandlerProxyRoutingState
} from './types';

/**
 * Request-time routing-state loading for the dev proxy path.
 *
 * @remarks
 * This module owns everything that is expensive or configuration-aware:
 * - loading registered slug-splitter config
 * - running app preparation when needed
 * - exposing current resolved target configs to the request-time worker path
 *
 * It deliberately does not decide what one specific request should do. That
 * higher-level request decision lives in `request-routing.ts`.
 */

let inFlightRoutingStatePromise: Promise<RouteHandlerProxyRoutingState> | null =
  null;

/**
 * Convert a Next pipeline result into the lightweight state used by the proxy
 * request-decision layer.
 *
 * @param input - State construction input.
 * @param input.resolvedConfigs - Fully resolved target configs.
 * @param input.result - Next-facing route-handler pipeline result.
 * @returns Lightweight request-time routing state.
 */
const buildRouteHandlerProxyRoutingState = ({
  resolvedConfigs,
  result
}: {
  resolvedConfigs: Array<ResolvedRouteHandlersConfig>;
  result: RouteHandlerNextResult | null;
}): RouteHandlerProxyRoutingState => {
  // The request layer needs only three things:
  // - exact heavy-route rewrite lookups
  // - route-base metadata for diagnostics
  // - resolved target configs for later worker-side request handling
  //
  // Converting the pipeline result into that narrow shape here keeps the
  // per-request code simple and makes the layering explicit.
  return {
    rewriteBySourcePath: new Map(
      (result?.rewrites ?? []).map(rewrite => [rewrite.source, rewrite.destination])
    ),
    targetRouteBasePaths: readResolvedRouteBasePaths(resolvedConfigs),
    // The routing-state loader is already the one place that knows the fully
    // resolved configs for the current request environment. Publishing them
    // here keeps later worker-side handling isolated from config loading.
    resolvedConfigsByTargetId: new Map(
      resolvedConfigs.map(resolvedConfig => [
        resolvedConfig.targetId,
        resolvedConfig
      ])
    )
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
  localeConfig
}: RouteHandlerProxyOptions): Promise<RouteHandlerProxyRoutingState> => {
  const routeHandlersConfig = await loadRegisteredSlugSplitterConfig();

  if (routeHandlersConfig == null) {
    // A missing registration should degrade to a no-op proxy state. That keeps
    // the generated root file harmless if the surrounding app setup is absent
    // or temporarily inconsistent.
    return {
      rewriteBySourcePath: new Map(),
      targetRouteBasePaths: [],
      resolvedConfigsByTargetId: new Map()
    };
  }

  const appConfig = resolveRouteHandlersAppConfig({
    routeHandlersConfig
  });

  // Proxy request handling still needs app-owned preparation side effects such
  // as TypeScript project compilation. We reuse the normal preparation entry so
  // the request-time path stays consistent with the rest of the integration.
  await prepareRouteHandlersFromConfig({
    rootDir: appConfig.rootDir,
    routeHandlersConfig
  });

  // The proxy runtime deliberately avoids importing the app's `next.config.*`
  // module. Instead, adapter-time setup captured the shared locale config and
  // the request-time path reconstructs only the resolved target data it needs.
  const resolvedConfigs = resolveRouteHandlersConfigBases({
    routeHandlersConfig
  }).map(resolvedConfig => ({
    ...resolvedConfig,
    localeConfig
  }));
  // Proxy routing state no longer seeds exact rewrites up front here. Request-
  // time worker handling is responsible for discovering heavy routes on demand.
  return buildRouteHandlerProxyRoutingState({
    resolvedConfigs,
    result: null
  });
};

/**
 * Get proxy routing state with process-local in-flight deduplication.
 *
 * @param input - Routing-state request input.
 * @param input.localeConfig - Shared app locale config captured at adapter time.
 * @returns Request-time routing state.
 *
 * @remarks
 * This helper intentionally deduplicates only concurrent requests. It does not
 * retain a long-lived snapshot because content can change while the dev server
 * stays up. Any longer-lived reuse belongs outside the routing-state loader.
 */
export const getRouteHandlerProxyRoutingState = async ({
  localeConfig
}: RouteHandlerProxyOptions): Promise<RouteHandlerProxyRoutingState> => {
  if (inFlightRoutingStatePromise != null) {
    // Concurrent cold requests should share one routing-state load so they do
    // not all race through preparation and config resolution.
    return inFlightRoutingStatePromise;
  }

  const routingStatePromise = loadFreshRouteHandlerProxyRoutingState({
    localeConfig
  }).finally(() => {
    // Clearing the slot after completion ensures the next request can observe
    // changes made during a long-lived dev session. This is dedupe, not a
    // permanent process cache.
    inFlightRoutingStatePromise = null;
  });

  inFlightRoutingStatePromise = routingStatePromise;
  return routingStatePromise;
};
