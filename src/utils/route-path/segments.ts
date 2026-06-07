import { isNonEmptyString } from '../type-guards-extended';

/**
 * Split one slash-delimited route path into clean route segments.
 *
 * 1. The input is route-like, not filesystem-like.
 * 2. Leading, trailing, and repeated `/` separators do not create segments.
 * 3. Returned segments satisfy {@link isNonEmptyString}.
 * 4. The returned array is always new.
 *
 * @example
 * '/de/docs/' -> ['de', 'docs']
 * '/'         -> []
 * ''          -> []
 *
 * @param routePath - Raw pathname or route base path.
 * @returns Ordered non-empty route path segments.
 */
export const toRoutePathSegments = (routePath: string): Array<string> =>
  routePath.split('/').filter(isNonEmptyString);
