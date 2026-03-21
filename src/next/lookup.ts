import type { GetStaticPaths } from 'next';
import { createConfigMissingError, createLookupError } from '../utils/errors';
import { toHeavyRoutePathKey } from './heavy-route-path-key';
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
import { resolveRouteHandlerLookupPolicy } from './policy/lookup-policy';
import { readPersistedRouteHandlerLazyDiscoveryHeavyRoutePathKeys } from './proxy/lazy/lookup';
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
 * Build a page-facing heavy-route lookup for one target.
 *
 * @remarks
 * Pages should ask a semantic question such as `isHeavyRoute(...)` instead of
 * understanding cache shape, target filtering, or route-key encoding.
 *
 * @param input - Lookup construction input.
 * @returns Semantic heavy-route lookup scoped to one configured target.
 */
const createHeavyRouteLookupFromPathKeys = ({
  targetId,
  heavyRoutePathKeys
}: {
  /**
   * Target identifier for cache separation.
   */
  targetId: string;
  /**
   * Already-normalized heavy-route lookup keys.
   */
  heavyRoutePathKeys: ReadonlySet<string>;
}): RouteHandlerHeavyRouteLookup => ({
  targetId,
  heavyRoutePathKeys,
  isHeavyRoute: (locale, slugArray) =>
    heavyRoutePathKeys.has(toHeavyRoutePathKey(locale, slugArray))
});

/**
 * Build a page-facing heavy-route lookup from one Next pipeline result.
 *
 * @param input - Lookup construction input.
 * @returns Semantic heavy-route lookup scoped to one configured target.
 */
const createHeavyRouteLookupFromResult = ({
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

  return createHeavyRouteLookupFromPathKeys({
    targetId,
    heavyRoutePathKeys
  });
};

/**
 * Decide whether page-time `getStaticPaths` should actively filter out heavy
 * routes right now.
 *
 * @param input - Policy input.
 * @param input.routeHandlersConfig - App-owned route-handlers config.
 * @returns `true` when `getStaticPaths` should exclude heavy routes from the
 * light catch-all page, `false` when page-time filtering should be skipped.
 *
 * @remarks
 * This helper intentionally exposes the higher-level policy question instead of
 * leaking lookup-policy details into app code.
 *
 * The current split is:
 * - build / rewrite mode: `true`
 * - development + proxy mode: `false`
 *
 * In dev proxy mode, request-time Proxy routing owns cold heavy-route
 * discovery. `getStaticPaths` should therefore return the full public path set
 * and must not treat page-time heavy lookup as an exact owner partition.
 */
export const shouldFilterHeavyRoutesInStaticPaths = async (options?: {
  routeHandlersConfig?: RouteHandlersConfig;
}): Promise<boolean> => {
  // Explicit config provided by the caller.
  const routeHandlersConfig = options?.routeHandlersConfig;

  if (routeHandlersConfig != null) {
    const appConfig = resolveRouteHandlersAppConfig({
      routeHandlersConfig
    });
    const lookupPolicy = resolveRouteHandlerLookupPolicy({
      routingPolicy: appConfig.routing
    });
    return !lookupPolicy.readPersistedLazyDiscoveries;
  }

  // Fall back to the process-local registration from withSlugSplitter(...).
  const registeredConfig = await loadRegisteredSlugSplitterConfig();

  if (registeredConfig == null) {
    // No config available — default to filtering (rewrite mode behavior).
    return true;
  }

  const appConfig = resolveRouteHandlersAppConfig({
    routeHandlersConfig: registeredConfig
  });
  const lookupPolicy = resolveRouteHandlerLookupPolicy({
    routingPolicy: appConfig.routing
  });
  return !lookupPolicy.readPersistedLazyDiscoveries;
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
  const lookupPolicy = resolveRouteHandlerLookupPolicy({
    routingPolicy: appConfig.routing
  });

  // Consumer entry into the preparation-cache group from the lookup path.
  // `getStaticPaths`-style callers need the same app-owned prerequisites as
  // the adapter path before they can trust cache identities or fallback
  // generation.
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

  // This fingerprint belongs to the shared persistent runtime-cache group. The
  // lookup path uses it only to decide whether the merged cache artifact is
  // fresh enough to answer directly, not to skip target execution within the
  // generate pipeline itself.
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
  const sharedHeavyRoutePathKeys = hasFreshCache
    ? createHeavyRouteLookupFromResult({
        targetId,
        result: cachedRecord.result
      }).heavyRoutePathKeys
    : new Set<string>();

  if (lookupPolicy.readPersistedLazyDiscoveries) {
    // Proxy-mode page-time lookup is intentionally read-only and best-effort.
    // It may merge:
    // - exact heavy routes from a fresh shared cache record
    // - exact heavy routes that were lazily discovered earlier in proxy mode
    //
    // What it may not do is trigger a whole-target generate pass just to make
    // `getStaticPaths` exact. Request-time proxy routing now owns cold heavy
    // discovery in development.
    const lazyDiscoveryHeavyRoutePathKeys =
      await readPersistedRouteHandlerLazyDiscoveryHeavyRoutePathKeys({
        rootDir: appConfig.rootDir,
        targetId
      });

    return createHeavyRouteLookupFromPathKeys({
      targetId,
      heavyRoutePathKeys: new Set([
        ...sharedHeavyRoutePathKeys,
        ...lazyDiscoveryHeavyRoutePathKeys
      ])
    });
  }

  /**
   * Missing or stale cache records trigger one internal generation pass so
   * `getStaticPaths` can recover without a manual pre-step.
   *
   * That fallback generation call enters the full runtime stack:
   * preparation caching may already be warm, shared-cache policy is applied,
   * target-local incremental planning runs, and generate mode can resync
   * emitted handler files before the new shared cache record is written.
   */
  if (!hasFreshCache) {
    if (!lookupPolicy.allowGenerateFallback) {
      // This branch should currently be unreachable because the proxy-mode
      // policy already returned through the persisted-lazy-discovery path
      // above. Keeping the explicit guard here makes the lookup contract easy
      // to follow if future policy variants are added.
      return createHeavyRouteLookupFromPathKeys({
        targetId,
        heavyRoutePathKeys: new Set()
      });
    }

    const freshResult = await executeRouteHandlerNextPipeline({
      routeHandlersConfig: effectiveRouteHandlersConfig,
      nextConfig,
      mode: 'generate'
    });

    return createHeavyRouteLookupFromResult({
      targetId,
      result: freshResult
    });
  }

  return createHeavyRouteLookupFromPathKeys({
    targetId,
    heavyRoutePathKeys: sharedHeavyRoutePathKeys
  });
};

/**
 * Normalize a slug value to an array for heavy-route lookup.
 *
 * Handles both single-segment routes (`[slug]`) where the slug is a string
 * and catch-all routes (`[...slug]`) where the slug is already an array.
 */
const normalizeSlugArray = (slug: string | Array<string>): Array<string> =>
  Array.isArray(slug) ? slug : [slug];

/**
 * Create a `getStaticPaths` function that automatically filters heavy routes.
 *
 * Wraps a user-owned path provider so the catch-all page excludes heavy
 * routes in rewrite mode and returns all paths in proxy mode — without
 * the page needing to understand policy, cache loading, or slug encoding.
 *
 * When `routeHandlersConfig` is omitted, the wrapper attempts to load it
 * from the process-local registration created by `withSlugSplitter(...)`.
 * In environments where the page worker runs in a separate process (e.g.
 * Turbopack dev mode), pass the config explicitly.
 *
 * @example
 * ```typescript
 * // pages/docs/[...slug].tsx
 * import { withHeavyRouteFilter } from 'next-slug-splitter/next/lookup';
 * import { routeHandlersConfig } from '../../route-handlers-config';
 * import { getPath, PageVariant } from '@content/assembler';
 *
 * export const getStaticPaths = withHeavyRouteFilter({
 *   targetId: 'docs',
 *   routeHandlersConfig,
 *   getStaticPaths: async () => {
 *     const paths = await getPath(PageVariant.Doc);
 *     return { paths, fallback: false };
 *   },
 * });
 * ```
 *
 * @param options - Wrapper configuration.
 * @returns An async function matching the `getStaticPaths` contract.
 */
/**
 * Options for `withHeavyRouteFilter`.
 */
export type WithHeavyRouteFilterOptions = {
  /**
   * Target identifier for cache lookup scoping.
   */
  targetId: string;

  /**
   * App-owned route-handlers configuration.
   *
   * When omitted, resolved from the process-local registration.
   */
  routeHandlersConfig?: RouteHandlersConfig;

  /**
   * Name of the slug parameter in the path entries.
   *
   * Defaults to `'slug'`.
   */
  slugParam?: string;

  /**
   * User-owned `getStaticPaths` implementation.
   *
   * The wrapper calls this function, intercepts the result, and filters
   * heavy routes from `paths` before returning. The `fallback` value is
   * preserved as-is.
   */
  getStaticPaths: GetStaticPaths;
};

export const withHeavyRouteFilter = ({
  targetId,
  routeHandlersConfig,
  slugParam = 'slug',
  getStaticPaths
}: WithHeavyRouteFilterOptions): GetStaticPaths => {
  return async context => {
    // Run the user-owned getStaticPaths implementation.
    const result = await getStaticPaths(context);
    const allPaths = result.paths;
    const fallback = result.fallback;

    // Proxy mode skips filtering — request-time routing owns heavy discovery.
    const shouldFilter = await shouldFilterHeavyRoutesInStaticPaths({
      routeHandlersConfig
    });

    if (!shouldFilter) {
      return { paths: allPaths, fallback };
    }

    // Rewrite mode — load the heavy-route lookup and filter.
    const heavyRouteLookup = await loadRouteHandlerCacheLookup({
      routeHandlersConfig,
      targetId
    });

    const paths = allPaths.filter(entry => {
      // Next.js allows plain string entries in paths — these are not
      // parameterized and cannot be heavy routes.
      if (typeof entry === 'string') {
        return true;
      }

      const locale = entry.locale;
      const slug = entry.params?.[slugParam];

      // Entries without a locale or slug cannot be matched against
      // the heavy-route lookup which requires both — keep them as-is.
      if (!locale || !slug) {
        return true;
      }

      return !heavyRouteLookup.isHeavyRoute(locale, normalizeSlugArray(slug));
    });

    return { paths, fallback };
  };
};
