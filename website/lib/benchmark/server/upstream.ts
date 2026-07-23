import { findDemoTarget, type DemoTarget } from '../catalog';

export type ResolvedDemoTarget = DemoTarget & {
  /**
   * Normalized upstream origin used by server-side facade requests.
   */
  origin: string;
};

/**
 * Remove one trailing slash from a configured origin.
 *
 * @param value - Origin value from an environment variable or local fallback.
 * @returns Origin string without a trailing slash.
 */
const normalizeOrigin = (value: string): string => value.replace(/\/$/, '');

/**
 * Resolve a configured target and attach the upstream origin used at runtime.
 *
 * Environment variables win over local fallback origins so the same target
 * table can drive both local development and deployed benchmark facades.
 *
 * @param targetId - Target identifier from a facade URL or measurement request.
 * @returns Resolved target with origin, or `null` when the id is unknown.
 */
export const resolveDemoTarget = (
  targetId: string
): ResolvedDemoTarget | null => {
  const target = findDemoTarget(targetId);

  if (target == null) {
    return null;
  }

  return {
    ...target,
    origin: normalizeOrigin(
      process.env[target.originEnvName] ?? target.localOrigin
    )
  };
};

/**
 * Build the upstream URL for a target route or asset request.
 *
 * Target apps are deployed at their own root. The website facade owns the
 * `/zones/<target>` prefix and strips it before forwarding upstream, so a
 * browser-visible `/zones/page-router-heavy/de` request becomes an upstream
 * `/de` request.
 *
 * @param target - Resolved target that owns the upstream request.
 * @param pathSegments - Route or asset path segments inside the target app.
 * @param search - Query string copied from the facade request.
 * @returns Absolute upstream URL for the selected target app.
 */
export const createUpstreamUrl = (
  target: ResolvedDemoTarget,
  pathSegments: ReadonlyArray<string>,
  search: string
): URL => {
  const encodedPath = pathSegments
    .filter(segment => segment.length > 0)
    .map(segment => encodeURIComponent(segment))
    .join('/');
  const pathname = encodedPath.length > 0 ? `/${encodedPath}` : '/';
  const upstreamUrl = new URL(pathname, target.origin);
  upstreamUrl.search = search;
  return upstreamUrl;
};
