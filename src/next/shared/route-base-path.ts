/**
 * Check whether a route base path points below the public root route.
 *
 * 1. `/` is the root route base path.
 * 2. Non-root route base paths contain at least one public route segment.
 * 3. Root route base paths are still valid for exact route construction.
 * 4. Call sites decide whether their routing rule requires a non-root base.
 *
 * @example
 * // Root route base path
 * '/' -> false
 *
 * // Non-root route base paths
 * '/a' -> true
 * '/b' -> true
 *
 * @param routeBasePath - Public route base path owned by one target.
 * @returns `true` when the route base path is not `/`.
 */
export const hasNonRootRouteBasePath = (routeBasePath: string): boolean =>
  routeBasePath !== '/';
