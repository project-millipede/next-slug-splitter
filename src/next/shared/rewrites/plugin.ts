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
type RouteHandlerRewriteInput =
  | Array<RouteHandlerRewrite>
  | RouteHandlerRewritePhaseConfig<RouteHandlerRewrite>;

/**
 * User rewrite return variants supported by Next.js config.
 *
 * Variants:
 * 1. Array<RewriteLike>: user `rewrites()` array return.
 * 2. RewritePhaseObject: user `rewrites()` object return with explicit phases.
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
 * Normalize user-owned Next.js rewrites into explicit phases.
 *
 * 1. A user `rewrites()` array return does not name a phase.
 * 2. Next.js assigns that array return to `afterFiles`.
 * 3. A user `rewrites()` object return already names the phase buckets.
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
    // Match Next.js: user `rewrites()` array returns become `afterFiles`.
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
 * Normalize library-owned rewrite input into explicit phase buckets.
 *
 * 1. A library rewrite array preserves the existing route-handler contract.
 * 2. Library rewrite arrays are intentionally installed into `beforeFiles`.
 * 3. A library rewrite object can place broad rewrites in later buckets.
 *
 * @param rewrites - Library-owned rewrite input.
 * @returns Fully populated library rewrite phases.
 */
const toRouteHandlerRewritePhases = (
  rewrites: RouteHandlerRewriteInput
): RouteHandlerRewritePhases => {
  if (isArray(rewrites)) {
    return {
      beforeFiles: rewrites,
      afterFiles: [],
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
 * Wrap a Next config and merge library rewrites into explicit phases.
 *
 * Input normalization:
 * 1. User `rewrites()` array returns keep Next.js behavior and become
 *    `afterFiles`.
 * 2. Library rewrite arrays keep route-handler behavior and become
 *    `beforeFiles`.
 * 3. Object returns already name the target phase buckets.
 *
 * Effective insertion order:
 * 1. `beforeFiles`
 *    `library.beforeFiles` -> `user.beforeFiles`
 *
 *    Generated-handler guards and exact heavy rewrites get the first chance.
 *
 * 2. `afterFiles`
 *    `user.afterFiles` -> `library.afterFiles`
 *
 *    Broad App default-locale normalization runs after user `afterFiles`.
 *
 * 3. `fallback`
 *    `user.fallback` -> `library.fallback`
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
  routeRewrites: RouteHandlerRewriteInput
): TNextConfig & {
  rewrites: () => Promise<ResolvedRewritePhases>;
} => {
  const base = nextConfig.rewrites;

  // Return a wrapped config object instead of mutating the incoming Next config.
  // The wrapper preserves the existing rewrites contract while placing
  // library-owned rewrites in their intended Next rewrite phases.
  return {
    ...nextConfig,
    rewrites: async () => {
      const resolved = isFunction(base) ? await base() : base;

      const phases = toRewritePhases(resolved);
      const routeHandlerPhases = toRouteHandlerRewritePhases(routeRewrites);
      const beforeFiles = dedupeRewrites([
        ...routeHandlerPhases.beforeFiles,
        ...phases.beforeFiles
      ]);
      const afterFiles = dedupeRewrites([
        ...phases.afterFiles,
        ...routeHandlerPhases.afterFiles
      ]);
      const fallback = dedupeRewrites([
        ...phases.fallback,
        ...routeHandlerPhases.fallback
      ]);

      return {
        beforeFiles,
        afterFiles,
        fallback
      };
    }
  };
};
