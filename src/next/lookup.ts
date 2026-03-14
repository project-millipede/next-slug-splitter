import { createCacheError, createLookupError } from '../utils/errors';
import {
  computePipelineFingerprintForConfigs,
  PIPELINE_CACHE_VERSION,
  readPersistentCacheRecord,
  resolvePersistentCachePath
} from './cache';
import { resolveRouteHandlersConfigBases } from './config/index';
import { resolveSharedEmitFormat } from './emit-format';

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
 * This module deliberately answers that question from the persistent
 * persistent splitter cache instead of:
 *
 * - re-running route analysis from page code
 * - importing generated helper source that might not exist yet
 * - loading the configured Next config file from the page graph
 *
 * That keeps page code on a narrow, deterministic contract:
 *
 * - generation runs first
 * - generation writes a cache record for all configured targets
 * - page code reads the already-generated result for one target only
 *
 * If that contract is broken, this module fails loudly instead of silently
 * regenerating handlers from inside `getStaticPaths`.
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
 * This loader reads from the persistent cache only. It resolves the configured
 * targets, recomputes the expected pipeline fingerprint, validates the stored
 * cache record, and then exposes a semantic lookup for the requested target.
 *
 * Generation and analysis are not performed here. Route-handler generation
 * must already have run before `getStaticPaths` reaches this point.
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
 * @throws If the persistent cache is missing or stale.
 */
export const loadRouteHandlerCacheLookup = async ({
  routeHandlersConfig,
  targetId
}: {
  /**
   * App-owned `RouteHandlersConfig` that supplies app-level settings and
   * target definitions.
   */
  routeHandlersConfig: RouteHandlersConfig;
  /**
   * Stable target identifier whose heavy-route membership should be exposed.
   */
  targetId: string;
}): Promise<RouteHandlerHeavyRouteLookup> => {
  const resolvedConfigs = resolveRouteHandlersConfigBases({
    routeHandlersConfig
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

  /**
   * Missing or stale cache records cause `getStaticPaths` to throw when the
   * cache no longer matches the configured target inputs.
   */
  if (
    !cachedRecord ||
    cachedRecord.version !== PIPELINE_CACHE_VERSION ||
    cachedRecord.fingerprint !== fingerprint ||
    cachedRecord.emitFormat !== emitFormat
  ) {
    throw createCacheError(
      'Missing fresh cache for static paths. Generate route handlers before getStaticPaths runs.',
      { targetId }
    );
  }

  return createHeavyRouteLookup({
    targetId,
    result: cachedRecord.result
  });
};
