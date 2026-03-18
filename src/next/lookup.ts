import { createConfigMissingError, createLookupError } from '../utils/errors';
import {
  computePipelineFingerprintForConfigs,
  PIPELINE_CACHE_VERSION,
  readPersistentCacheRecord,
  resolvePersistentCachePath
} from './cache';
import type { NextConfigLike } from './config/load-next-config';
import { resolveRouteHandlersConfigBases } from './config/resolve-configs';
import { resolveSharedEmitFormat } from './emit-format';
import { loadRegisteredSlugSplitterConfig } from './integration/slug-splitter-config-loader';
import { prepareRouteHandlersFromConfig } from './prepare';
import { resolveRouteHandlersAppConfig } from './config/app';
import { executeRouteHandlerNextPipeline } from './runtime';

import type {
  RouteHandlerHeavyRouteLookup,
  RouteHandlerNextResult,
  RouteHandlersConfig
} from './types';

/**
 * Resolve heavy-route membership for one configured target during
 * `getStaticPaths`.
 *
 * @remarks
 * The pages router needs an exact answer for "should this path stay in the
 * light catch-all page, or is it owned by a generated heavy handler?" before
 * static paths are finalized.
 *
 * This module answers that question from the persistent splitter cache
 * whenever possible instead of:
 *
 * - re-running route analysis from page code
 * - importing generated helper source that might not exist yet
 * - loading the configured Next config file from the page graph
 *
 * That keeps page code on a narrow, deterministic contract:
 *
 * - generation writes a cache record for all configured targets
 * - page code reads the already-generated result for one target when it is
 *   available
 * - one fallback generation pass repairs missing or stale cache state during
 *   build-time `getStaticPaths`
 */

/**
 * Encode a locale and slug array into a unique path key.
 *
 * @param locale - Locale code.
 * @param slugArray - Ordered slug segments.
 * @returns Path key string.
 */
const toHeavyRoutePathKey = (
  locale: string,
  slugArray: Array<string>
): string => `${locale}:${slugArray.join('/')}`;

/**
 * Build a page-facing heavy-route lookup for one target.
 *
 * @remarks
 * Pages should ask a semantic question such as `isHeavyRoute(...)` instead of
 * understanding cache shape, target filtering, or route-key encoding.
 *
 * @param input - Lookup construction input.
 * @returns Semantic heavy-route lookup scoped to one configured target.
 */
const createHeavyRouteLookup = ({
  targetId,
  result
}: {
  /**
   * Target identifier for cache separation.
   */
  targetId: string;
  /**
   * Pipeline result containing heavy routes.
   */
  result: RouteHandlerNextResult;
}): RouteHandlerHeavyRouteLookup => {
  const heavyRoutePathKeys = new Set<string>();

  for (const heavyRoute of result.heavyPaths) {
    if (heavyRoute.targetId !== targetId) {
      continue;
    }

    heavyRoutePathKeys.add(
      toHeavyRoutePathKey(heavyRoute.locale, heavyRoute.slugArray)
    );
  }

  return {
    targetId,
    heavyRoutePathKeys,
    isHeavyRoute: (locale, slugArray) =>
      heavyRoutePathKeys.has(toHeavyRoutePathKey(locale, slugArray))
  };
};

/**
 * Read heavy-route membership for a single target from the persistent cache.
 *
 * @remarks
 * This loader prefers the persistent cache. It resolves the configured
 * targets, recomputes the expected pipeline fingerprint, validates the stored
 * cache record, and then exposes a semantic lookup for the requested target.
 *
 * When the persistent cache is missing or stale, one internal generation pass
 * is executed so `withSlugSplitter(...)` remains sufficient during build-time
 * `getStaticPaths` execution.
 *
 * Generated handler files on disk are not validated here. Heavy-route
 * membership comes from the persistent cache record exclusively so
 * `getStaticPaths` does not reintroduce filesystem-based output inspection
 * into the page-time path.
 *
 * @param options - Route-handler lookup inputs.
 * @returns A semantic heavy-route lookup scoped to one configured target.
 *
 * @throws If the target is unknown.
 * @throws If no route-handlers config is available.
 */
export const loadRouteHandlerCacheLookup = async ({
  routeHandlersConfig,
  nextConfig,
  targetId
}: {
  /**
   * App-owned `RouteHandlersConfig` that supplies app-level settings and
   * target definitions.
   */
  routeHandlersConfig?: RouteHandlersConfig;
  /**
   * Already-loaded Next config object to reuse during fallback generation.
   */
  nextConfig?: NextConfigLike;
  /**
   * Stable target identifier whose heavy-route membership should be exposed.
   */
  targetId: string;
}): Promise<RouteHandlerHeavyRouteLookup> => {
  const effectiveRouteHandlersConfig =
    routeHandlersConfig ?? (await loadRegisteredSlugSplitterConfig());

  if (effectiveRouteHandlersConfig == null) {
    throw createConfigMissingError(
      'Missing route handlers config. Pass routeHandlersConfig explicitly or register it through withSlugSplitter(...).',
      { targetId }
    );
  }

  const appConfig = resolveRouteHandlersAppConfig({
    routeHandlersConfig: effectiveRouteHandlersConfig
  });

  await prepareRouteHandlersFromConfig({
    rootDir: appConfig.rootDir,
    routeHandlersConfig: effectiveRouteHandlersConfig
  });

  const resolvedConfigs = resolveRouteHandlersConfigBases({
    routeHandlersConfig: effectiveRouteHandlersConfig
  });

  const resolvedTargetConfig = resolvedConfigs.find(
    config => config.targetId === targetId
  );

  if (resolvedTargetConfig == null) {
    throw createLookupError(`Unknown targetId "${targetId}".`, { targetId });
  }

  const emitFormat = resolveSharedEmitFormat({
    configs: resolvedConfigs,
    createError: createLookupError
  });

  const [referenceResolvedTarget] = resolvedConfigs;

  const cachePath = resolvePersistentCachePath({
    rootDir: referenceResolvedTarget.app.rootDir
  });

  const fingerprint = await computePipelineFingerprintForConfigs({
    configs: resolvedConfigs,
    mode: 'generate'
  });

  const cachedRecord = await readPersistentCacheRecord(cachePath);
  const hasFreshCache =
    cachedRecord != null &&
    cachedRecord.version === PIPELINE_CACHE_VERSION &&
    cachedRecord.fingerprint === fingerprint &&
    cachedRecord.emitFormat === emitFormat;

  /**
   * Missing or stale cache records trigger one internal generation pass so
   * `getStaticPaths` can recover without a manual pre-step.
   */
  if (!hasFreshCache) {
    const freshResult = await executeRouteHandlerNextPipeline({
      routeHandlersConfig: effectiveRouteHandlersConfig,
      nextConfig,
      mode: 'generate'
    });

    return createHeavyRouteLookup({
      targetId,
      result: freshResult
    });
  }

  return createHeavyRouteLookup({
    targetId,
    result: cachedRecord.result
  });
};
