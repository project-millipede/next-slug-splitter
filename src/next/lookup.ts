import type { GetStaticPaths } from 'next';
import { createConfigMissingError, createLookupError } from '../utils/errors';
import { toHeavyRoutePathKey } from './heavy-route-path-key';
import type { NextConfigLike } from './config/load-next-config';
import { resolveRouteHandlersConfigBases } from './config/resolve-configs';
import { loadRegisteredSlugSplitterConfig } from './integration/slug-splitter-config-loader';
import { prepareRouteHandlersFromConfig } from './prepare';
import { resolveRouteHandlerLookupPolicy } from './policy/lookup-policy';
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
 * This module answers that question from fresh route planning when an exact
 * answer is required instead of:
 *
 * - depending on persisted build-side cache artifacts
 * - importing generated handler-side helper code that may not exist yet
 * - pushing route-ownership logic into the page graph itself
 *
 * That keeps page code on a narrow, deterministic contract:
 *
 * - build/rewrite lookup runs fresh analysis when it needs an exact answer
 * - dev proxy lookup stays best-effort and intentionally does not try to be
 *   exact at page time
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
 * Read heavy-route membership for a single target.
 *
 * @remarks
 * Rewrite/build lookup answers this question from a fresh internal analyze
 * pass when an exact answer is required. Development proxy lookup remains
 * intentionally best-effort and never tries to recover exact heavy-route
 * membership at page time.
 *
 * Generated handler files on disk are not validated here. Page-time lookup is
 * a planning question only: "is this public path owned by a heavy route for
 * this target right now?"
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
   * Already-loaded Next config object to reuse during fallback analysis.
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
  // the adapter path before they can trust exact page-time lookup or fall
  // back to fresh analysis.
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

  if (lookupPolicy.readPersistedLazyDiscoveries) {
    // Proxy-mode page-time lookup is intentionally best-effort and read-only.
    // Request-time proxy routing owns exact cold heavy-route discovery in
    // development, so `getStaticPaths` should not:
    // - trigger target-wide analysis just to make page-time answers exact
    // - trust persisted artifacts as an ownership partition for the page graph
    //
    // The safe answer in this branch is therefore "no exact heavy-route view
    // is available here."
    return createHeavyRouteLookupFromPathKeys({
      targetId,
      heavyRoutePathKeys: new Set()
    });
  }

  if (!lookupPolicy.allowGenerateFallback) {
    // Keeping this guard explicit makes the lookup contract easy to follow if
    // future policy variants are added. Today rewrite/build mode is the only
    // branch that reaches the analyze fallback below.
    return createHeavyRouteLookupFromPathKeys({
      targetId,
      heavyRoutePathKeys: new Set()
    });
  }

  // Build/rewrite mode still needs an exact heavy-route answer, but page-time
  // lookup is only a planning question.
  //
  // That means:
  // 1. `mode: 'analyze'` is enough to compute heavy-route membership
  // 2. page-time lookup does not need to emit handlers or refresh build output
  // 3. `getStaticPaths` can recover an exact answer without requiring a
  //    separate pre-generation step
  const freshResult = await executeRouteHandlerNextPipeline({
    routeHandlersConfig: effectiveRouteHandlersConfig,
    nextConfig,
    mode: 'analyze'
  });

  return createHeavyRouteLookupFromResult({
    targetId,
    result: freshResult
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
