import type { NextConfig } from 'next';
import type { Rewrite } from 'next/dist/lib/load-custom-routes';

import { isArray, isFunction } from '../../../utils/type-guards';
import { dedupeRewriteIdentities } from './identity';
import type {
  RouteHandlerRewrite,
  RouteHandlerRewritePhaseConfig,
  RouteHandlerRewritePhases
} from '../types';

/**
 * Next.js rewrite with route handler properties.
 */
type RewriteLike = Rewrite & RouteHandlerRewrite;
type RewritePhaseObject = RouteHandlerRewritePhaseConfig<RewriteLike>;
type ResolvedRewritePhases = RouteHandlerRewritePhases<RewriteLike>;

/**
 * Rewrite configuration variants.
 *
 * Variants:
 * - Array<RewriteLike>: Shorthand for afterFiles.
 * - RewritePhaseObject: Explicit phase buckets.
 */
type RewritesConfig = Array<RewriteLike> | RewritePhaseObject;

/**
 * Next.js config with rewrites support.
 */
type NextConfigWithRewrites = NextConfig;

/**
 * Deduplicate rewrite records while preserving the first-seen order.
 *
 * @param rewrites - Rewrite records to normalize.
 * @returns Deduplicated rewrite records.
 */
const dedupeRewrites = <TRewrite extends RouteHandlerRewrite>(
  rewrites: Array<TRewrite>
): Array<TRewrite> => {
  return dedupeRewriteIdentities(rewrites);
};

/**
 * Normalize the different Next rewrites return shapes into explicit phases.
 *
 * @param rewrites - Resolved rewrites value returned by Next config.
 * @returns Rewrite phases with all buckets populated.
 */
const toRewritePhases = (
  rewrites: RewritesConfig | undefined
): ResolvedRewritePhases => {
  if (rewrites == null) {
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: []
    };
  }

  if (isArray(rewrites)) {
    // Array rewrites correspond to the historical `afterFiles` shape.
    return {
      beforeFiles: [],
      afterFiles: rewrites,
      fallback: []
    };
  }

  return {
    beforeFiles: rewrites.beforeFiles ?? [],
    afterFiles: rewrites.afterFiles ?? [],
    fallback: rewrites.fallback ?? []
  };
};

/**
 * Wrap a Next config so route-handler rewrites are prepended ahead of existing
 * `beforeFiles`.
 *
 * @template TNextConfig - Concrete Next config type being wrapped.
 * @param nextConfig - Existing Next config object.
 * @param routeRewrites - Route-handler rewrites generated for the current app.
 * @returns A wrapped config whose `rewrites()` result includes the generated
 * route-handler rewrites.
 */
export const withRouteHandlerRewrites = <
  TNextConfig extends NextConfigWithRewrites
>(
  nextConfig: TNextConfig,
  routeRewrites: Array<RouteHandlerRewrite>
): TNextConfig & {
  rewrites: () => Promise<ResolvedRewritePhases>;
} => {
  const base = nextConfig.rewrites;

  // Return a wrapped config object instead of mutating the incoming Next config.
  // The wrapper preserves the existing rewrites contract and prepends
  // route-handler entries ahead of user-defined beforeFiles.
  return {
    ...nextConfig,
    rewrites: async () => {
      const resolved = isFunction(base) ? await base() : base;

      const phases = toRewritePhases(resolved);
      const beforeFiles = dedupeRewrites([
        ...routeRewrites,
        ...phases.beforeFiles
      ]);

      return {
        beforeFiles,
        afterFiles: phases.afterFiles,
        fallback: phases.fallback
      };
    }
  };
};
