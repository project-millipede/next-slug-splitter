import process from 'node:process';

import type { GetStaticPaths } from 'next';

import { createConfigMissingError, createLookupError } from '../utils/errors';
import { toHeavyRoutePathKey } from './heavy-route-path-key';
import {
  readRouteHandlerLookupSnapshot,
  type PersistedRouteHandlerLookupSnapshot
} from './lookup-persisted';

import type { RouteHandlerHeavyRouteLookup } from './types';

const createMissingRouteHandlerLookupSnapshotError = (targetId?: string) =>
  createConfigMissingError(
    'Missing route-handler lookup snapshot. Page-time lookup requires a bootstrap-generated `.next/cache/route-handlers-lookup.json` snapshot.',
    targetId == null ? undefined : { targetId }
  );

const readRequiredRouteHandlerLookupSnapshot = async (
  targetId?: string
): Promise<PersistedRouteHandlerLookupSnapshot> => {
  const snapshot = await readRouteHandlerLookupSnapshot(process.cwd());

  if (snapshot == null) {
    throw createMissingRouteHandlerLookupSnapshotError(targetId);
  }

  return snapshot;
};

/**
 * Build a page-facing heavy-route lookup for one target.
 *
 * @remarks
 * Pages should ask a semantic question such as `isHeavyRoute(...)` instead of
 * understanding cache shape, target filtering, or route-key encoding.
 *
 * @param targetId - Stable target identifier for lookup separation.
 * @param heavyRoutePathKeys - Already-normalized heavy-route lookup keys.
 * @returns Semantic heavy-route lookup scoped to one configured target.
 */
const createHeavyRouteLookupFromPathKeys = (
  targetId: string,
  heavyRoutePathKeys: ReadonlySet<string>
): RouteHandlerHeavyRouteLookup => ({
  targetId,
  heavyRoutePathKeys,
  isHeavyRoute: (locale, slugArray) =>
    heavyRoutePathKeys.has(toHeavyRoutePathKey(locale, slugArray))
});

const createHeavyRouteLookupFromSnapshot = (
  targetId: string,
  snapshot: PersistedRouteHandlerLookupSnapshot
): RouteHandlerHeavyRouteLookup => {
  const targetSnapshot = snapshot.targets.find(
    target => target.targetId === targetId
  );

  if (targetSnapshot == null) {
    throw createLookupError(`Unknown targetId "${targetId}".`, { targetId });
  }

  return createHeavyRouteLookupFromPathKeys(
    targetId,
    new Set(targetSnapshot.heavyRoutePathKeys)
  );
};

/**
 * Resolve heavy-route membership for one configured target during
 * `getStaticPaths`.
 *
 * @remarks
 * The pages router needs an exact answer for "should this path stay in the
 * light catch-all page, or is it owned by a generated heavy handler?" before
 * static paths are finalized.
 *
 * This module answers that question from a persisted bootstrap-owned lookup
 * snapshot instead of:
 *
 * - depending on process-local config registration
 * - importing generated handler-side helper code that may not exist yet
 * - pushing route-ownership logic into the page graph itself
 *
 * That keeps page code on a narrow, deterministic contract:
 *
 * - page-time lookup reads a persisted route-handler snapshot
 * - dev proxy lookup still skips filtering through the persisted policy bit
 * - no fresh route planning runs inside the page graph
 */

/**
 * Normalize a slug value to an array for heavy-route lookup.
 *
 * Handles both single-segment routes (`[slug]`) where the slug is a string
 * and catch-all routes (`[...slug]`) where the slug is already an array.
 */
const normalizeSlugArray = (slug: string | Array<string>): Array<string> =>
  Array.isArray(slug) ? slug : [slug];

/**
 * Filter `getStaticPaths` entries against heavy-route ownership.
 *
 * @param allPaths - Full `getStaticPaths` path list before heavy-route filtering.
 * @param fallback - Original fallback mode returned by the wrapped page.
 * @param isHeavyRoute - Semantic heavy-route membership check for one target.
 * @param slugParam - Catch-all slug param name to read from object entries.
 * @returns The original fallback plus the filtered path list.
 */
export const filterStaticPathsAgainstHeavyRoutes = (
  allPaths: Awaited<ReturnType<GetStaticPaths>>['paths'],
  fallback: Awaited<ReturnType<GetStaticPaths>>['fallback'],
  isHeavyRoute: (locale: string, slugArray: Array<string>) => boolean,
  slugParam = 'slug'
): Awaited<ReturnType<GetStaticPaths>> => ({
  paths: allPaths.filter(entry => {
    if (typeof entry === 'string') {
      return true;
    }

    const locale = entry.locale;
    const slug = entry.params?.[slugParam];

    if (!locale || !slug) {
      return true;
    }

    return !isHeavyRoute(locale, normalizeSlugArray(slug));
  }),
  fallback
});

/**
 * Create a `getStaticPaths` function that automatically filters heavy routes.
 *
 * Wraps a user-owned path provider so the catch-all page excludes heavy
 * routes in rewrite mode and returns all paths in proxy mode without the page
 * needing to understand snapshot loading or slug encoding.
 *
 * @example
 * ```typescript
 * // pages/docs/[...slug].tsx
 * import { withHeavyRouteFilter } from 'next-slug-splitter/next/lookup';
 * import { getPath, PageVariant } from '@content/assembler';
 *
 * export const getStaticPaths = withHeavyRouteFilter({
 *   targetId: 'docs',
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
export type WithHeavyRouteFilterOptions = {
  /**
   * Target identifier for cache lookup scoping.
   */
  targetId: string;
  /**
   * Name of the slug parameter in the path entries.
   *
   * Defaults to `'slug'`.
   */
  slugParam?: string;
  /**
   * User-owned `getStaticPaths` implementation.
   */
  getStaticPaths: GetStaticPaths;
};

export const withHeavyRouteFilter = ({
  targetId,
  slugParam = 'slug',
  getStaticPaths
}: WithHeavyRouteFilterOptions): GetStaticPaths => {
  return async context => {
    const result = await getStaticPaths(context);

    // 1. Load the single persisted route-handler lookup snapshot for this target.
    const snapshot = await readRequiredRouteHandlerLookupSnapshot(targetId);

    // 2. If page-time filtering is disabled, return the original paths unchanged.
    if (!snapshot.filterHeavyRoutesInStaticPaths) {
      return result;
    }

    // 3. Derive target-scoped heavy-route membership and filter the path list.
    const heavyRouteLookup = createHeavyRouteLookupFromSnapshot(
      targetId,
      snapshot
    );

    return filterStaticPathsAgainstHeavyRoutes(
      result.paths,
      result.fallback,
      heavyRouteLookup.isHeavyRoute,
      slugParam
    );
  };
};
