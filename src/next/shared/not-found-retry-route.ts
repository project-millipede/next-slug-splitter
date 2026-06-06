/**
 * Convert one route segment into a pathname containment prefix.
 *
 * 1. The input uses route-segment spelling, not URL pathname spelling.
 * 2. Nested route segments are allowed with `/`.
 * 3. The input must not start or end with `/`.
 * 4. Empty nested segments are invalid.
 * 5. The returned value includes leading and trailing `/` so simple pathname
 *    containment checks still match complete route segments.
 *
 * @example
 * // Single route segment
 * 'a' -> '/a/'
 *
 * // Nested route segment
 * 'a/b' -> '/a/b/'
 *
 * @param routeSegment - Route segment to convert.
 * @param optionName - Human-readable option name used in validation errors.
 * @returns Pathname containment prefix for segment-aware matching.
 */
const createRouteSegmentContainmentPrefix = (
  routeSegment: string,
  optionName: string
): string => {
  if (routeSegment.length === 0) {
    throw new Error(`${optionName} entries must be non-empty.`);
  }

  if (routeSegment.startsWith('/') || routeSegment.endsWith('/')) {
    throw new Error(`${optionName} entries must not start or end with "/".`);
  }

  if (routeSegment.includes('//')) {
    throw new Error(
      `${optionName} entries must not contain empty path segments.`
    );
  }

  return `/${routeSegment}/`;
};

const CATCH_ALL_ROUTE_SEGMENTS_OPTION_NAME = 'catchAllRouteSegments';

/**
 * Check whether one pathname belongs to a configured not-found retry route.
 *
 * 1. The caller provides route segments using the same spelling as
 *    `routeSegment`.
 * 2. Each route segment is converted into a pathname containment prefix.
 * 3. Matching remains intentionally simple so locale-prefixed public paths
 *    continue to work when they contain the configured route segment.
 * 4. Similar segment names do not match because the generated prefix includes
 *    both leading and trailing `/`.
 *
 * @example
 * // Direct public path
 * pathname: '/a/x', routeSegments: ['a'] -> true
 *
 * // Nested route segment
 * pathname: '/a/b/x', routeSegments: ['a/b'] -> true
 *
 * // Optional leading public segment
 * pathname: '/c/a/x', routeSegments: ['a'] -> true
 *
 * // Similar segment name
 * pathname: '/a-extra/x', routeSegments: ['a'] -> false
 *
 * @param pathname - Current browser pathname.
 * @param routeSegments - Configured catch-all route segments.
 * @returns `true` when the pathname should participate in the retry flow.
 */
export const isNotFoundRetryRoute = (
  pathname: string,
  routeSegments: ReadonlyArray<string>
): boolean =>
  routeSegments.some(routeSegment =>
    pathname.includes(
      createRouteSegmentContainmentPrefix(
        routeSegment,
        CATCH_ALL_ROUTE_SEGMENTS_OPTION_NAME
      )
    )
  );
