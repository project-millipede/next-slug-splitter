import { createRuntimeError } from '../../../utils/errors';
import {
  computePipelineFingerprintForConfigs,
  resolvePersistentCachePath
} from '../../cache';
import { resolveRouteHandlersAppConfig } from '../../config/app';
import { resolveRouteHandlersConfigBases } from '../../config/resolve-configs';
import { resolveSharedEmitFormat } from '../../emit-format';
import { loadRegisteredSlugSplitterConfig } from '../../integration/slug-splitter-config-loader';
import { prepareRouteHandlersFromConfig } from '../../prepare';
import { readReusablePipelineCacheResult } from '../../runtime/cache';
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
 * - consulting the shared persistent route-handler cache
 * - exposing current resolved target configs to the request-time lazy path
 * - publishing the currently resolved target configs so the isolated lazy
 *   discovery-snapshot layer can validate process-local lazy discoveries
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
  // The request layer needs only two things:
  // - exact heavy-route rewrite lookups
  // - route-base metadata for diagnostics
  // - resolved target configs for lazy discovery validation and cleanup
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
    // here keeps later lazy-snapshot validation isolated from config loading.
    resolvedConfigsByTargetId: new Map(
      resolvedConfigs.map(resolvedConfig => [
        resolvedConfig.targetId,
        resolvedConfig
      ])
    )
  };
};

/**
 * Load the freshest route-handler pipeline result usable by the proxy path.
 *
 * @param input - Result loading input.
 * @param input.resolvedConfigs - Fully resolved target configs.
 * @returns Shared cached result when still valid, otherwise `null`.
 *
 * @remarks
 * This is now the strict fully-lazy proxy strategy:
 * - trust the main shared persistent record when it is still fresh
 * - otherwise return no known rewrites and let the request-time lazy path do
 *   one-route resolution, one-route analysis, and one-route emission on demand
 *
 * The returned pipeline result remains the source of truth for the stable
 * shared heavy-route map. The separate lazy discovery snapshot later layers on
 * top of that map, but does not replace it.
 *
 * The proxy path therefore reuses the same heavy-route artifact as the stable
 * rewrite path instead of inventing a second classification system, while also
 * avoiding whole-target generation work on a cache miss.
 */
const loadProxyPipelineResult = async ({
  resolvedConfigs
}: {
  resolvedConfigs: Array<ResolvedRouteHandlersConfig>;
}): Promise<RouteHandlerNextResult | null> => {
  const [referenceResolvedTarget] = resolvedConfigs;

  // Cached results are only reusable when the emitted output format would be
  // the same for the current config set. This mirrors the safety checks used by
  // the normal runtime pipeline.
  const emitFormat = resolveSharedEmitFormat({
    configs: resolvedConfigs,
    createError: createRuntimeError
  });
  const cachePath = resolvePersistentCachePath({
    rootDir: referenceResolvedTarget.app.rootDir
  });

  // The proxy path intentionally bridges back into the existing shared cache
  // contract instead of inventing a proxy-specific fingerprint or manifest.
  const fingerprint = await computePipelineFingerprintForConfigs({
    configs: resolvedConfigs,
    mode: 'generate'
  });
  const cachedResult = await readReusablePipelineCacheResult({
    cachePath,
    fingerprint,
    emitFormat
  });

  if (cachedResult != null) {
    // Warm shared-cache hit: proxy can route immediately from previously known
    // heavy-route data without forcing eager startup generation.
    return cachedResult;
  }

  // Shared cache miss or stale record: return no known rewrites and rely on
  // the lazy request path instead of triggering a whole-target generate pass.
  return null;
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
  const result = await loadProxyPipelineResult({
    resolvedConfigs
  });

  return buildRouteHandlerProxyRoutingState({
    resolvedConfigs,
    result
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
 * stays up. The reusable long-lived request optimization now lives in the
 * separate lazy discovery-snapshot layer, not in the routing-state loader.
 */
export const getRouteHandlerProxyRoutingState = async ({
  localeConfig
}: RouteHandlerProxyOptions): Promise<RouteHandlerProxyRoutingState> => {
  if (inFlightRoutingStatePromise != null) {
    // Concurrent cold requests should share one routing-state load so they do
    // not all race through preparation and shared-cache reads.
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
