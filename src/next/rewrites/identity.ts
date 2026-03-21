import type { RouteHandlerRewriteLike } from '../types';

/**
 * Boolean flags that participate in rewrite identity.
 */
type RewriteIdentityState = {
  /**
   * Whether locale handling is disabled.
   */
  disablesLocale: boolean;
  /**
   * Whether base path handling is disabled.
   */
  disablesBasePath: boolean;
};

/**
 * Nested map structure for tracking seen rewrite identities.
 */
type RewriteIdentityMap = Map<string, Map<string, Map<boolean, Set<boolean>>>>;

/**
 * Project one rewrite into the boolean flags that participate in rewrite
 * identity.
 *
 * @param rewrite - Rewrite-like value whose identity should be tracked.
 * @returns Normalized rewrite identity state.
 */
const toRewriteIdentityState = (
  rewrite: RouteHandlerRewriteLike
): RewriteIdentityState => ({
  disablesLocale: rewrite.locale === false,
  disablesBasePath: rewrite.basePath === false
});

/**
 * Get or create the destination bucket for one rewrite source.
 *
 * @param rewriteMapsBySource - Top-level rewrite identity map.
 * @param source - Rewrite source path.
 * @returns Destination bucket for the source.
 */
const getOrCreateDestinationMap = (
  rewriteMapsBySource: RewriteIdentityMap,
  source: string
): Map<string, Map<boolean, Set<boolean>>> => {
  const existingDestinationMap = rewriteMapsBySource.get(source);
  if (existingDestinationMap) {
    return existingDestinationMap;
  }

  const destinationMap = new Map<string, Map<boolean, Set<boolean>>>();
  rewriteMapsBySource.set(source, destinationMap);
  return destinationMap;
};

/**
 * Get or create the locale-state bucket for one destination.
 *
 * @param destinationMap - Destination bucket scoped to one source.
 * @param destination - Rewrite destination path.
 * @returns Locale-state bucket for the destination.
 */
const getOrCreateLocaleMap = (
  destinationMap: Map<string, Map<boolean, Set<boolean>>>,
  destination: string
): Map<boolean, Set<boolean>> => {
  const existingLocaleMap = destinationMap.get(destination);
  if (existingLocaleMap) {
    return existingLocaleMap;
  }

  const localeMap = new Map<boolean, Set<boolean>>();
  destinationMap.set(destination, localeMap);
  return localeMap;
};

/**
 * Get or create the base-path state set for one locale-state bucket.
 *
 * @param localeMap - Locale-state bucket scoped to one destination.
 * @param disablesLocale - Whether locale handling is disabled for the rewrite.
 * @returns Base-path state set for the locale state.
 */
const getOrCreateBasePathStates = (
  localeMap: Map<boolean, Set<boolean>>,
  disablesLocale: boolean
): Set<boolean> => {
  const existingBasePathStates = localeMap.get(disablesLocale);
  if (existingBasePathStates) {
    return existingBasePathStates;
  }

  const basePathStates = new Set<boolean>();
  localeMap.set(disablesLocale, basePathStates);
  return basePathStates;
};

/**
 * Check whether a rewrite identity has already been recorded.
 *
 * @param rewriteMapsBySource - Top-level rewrite identity map.
 * @param rewrite - Rewrite-like value to test.
 * @returns `true` when the rewrite identity has already been seen.
 */
const hasSeenRewriteIdentity = (
  rewriteMapsBySource: RewriteIdentityMap,
  rewrite: RouteHandlerRewriteLike
): boolean => {
  const destinationMap = rewriteMapsBySource.get(rewrite.source);
  if (destinationMap == null) {
    return false;
  }

  const localeMap = destinationMap.get(rewrite.destination);
  if (localeMap == null) {
    return false;
  }

  const { disablesLocale, disablesBasePath } = toRewriteIdentityState(rewrite);
  const basePathStates = localeMap.get(disablesLocale);
  if (basePathStates == null) {
    return false;
  }

  return basePathStates.has(disablesBasePath);
};

/**
 * Record one rewrite identity in the nested identity map.
 *
 * @param rewriteMapsBySource - Top-level rewrite identity map.
 * @param rewrite - Rewrite-like value to record.
 */
const markRewriteIdentitySeen = (
  rewriteMapsBySource: RewriteIdentityMap,
  rewrite: RouteHandlerRewriteLike
): void => {
  const { disablesLocale, disablesBasePath } = toRewriteIdentityState(rewrite);
  const destinationMap = getOrCreateDestinationMap(
    rewriteMapsBySource,
    rewrite.source
  );
  const localeMap = getOrCreateLocaleMap(destinationMap, rewrite.destination);
  const basePathStates = getOrCreateBasePathStates(localeMap, disablesLocale);
  basePathStates.add(disablesBasePath);
};

/**
 * Deduplicate rewrites by their semantic identity while preserving first-seen
 * order.
 *
 * @param rewrites - Rewrite records to deduplicate.
 * @returns Deduplicated rewrite records.
 */
export const dedupeRewriteIdentities = <TRewrite extends RouteHandlerRewriteLike>(
  rewrites: Array<TRewrite>
): Array<TRewrite> => {
  const rewriteMapsBySource: RewriteIdentityMap = new Map();
  const deduped: Array<TRewrite> = [];

  for (const rewrite of rewrites) {
    if (hasSeenRewriteIdentity(rewriteMapsBySource, rewrite)) {
      continue;
    }

    markRewriteIdentitySeen(rewriteMapsBySource, rewrite);
    deduped.push(rewrite);
  }

  return deduped;
};
