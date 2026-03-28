import process from 'node:process';

import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_BUILD
} from 'next/constants.js';

import { resolveRouteHandlerRoutingStrategy } from './routing-strategy';

import type { ResolvedRouteHandlersRoutingPolicy } from '../types';

/**
 * Page-time lookup execution policy.
 *
 * @remarks
 * `loadRouteHandlerCacheLookup(...)` is a distinct consumer from the adapter
 * and proxy runtime:
 *
 * - adapter decides whether dev boot installs rewrites or proxy
 * - proxy decides request-time rewrite vs pass-through
 * - lookup decides whether page-time heavy-route inspection may trigger a
 *   fresh analyze pass when rewrite/build mode needs an exact answer
 *
 * That last decision is the important one for fully lazy dev behavior. In
 * proxy development mode, page-time lookup must become read-only and must not
 * re-enter target-wide analysis just to answer `getStaticPaths`.
 */
export type RouteHandlerLookupPolicy = {
  /**
   * Whether page-time lookup is in the proxy-mode best-effort branch.
   *
   * @remarks
   * The property name is historical. In the current simplified architecture it
   * acts as the "proxy dev mode" flag that tells page-time lookup to stay
   * read-only and return an empty heavy-route set.
   */
  readPersistedLazyDiscoveries: boolean;

  /**
   * Whether page-time lookup may fall back to a fresh runtime analyze pass
   * when rewrite/build mode needs an exact heavy-route answer.
   *
   * @remarks
   * The property name is historical. In the current simplified architecture
   * the fallback is a fresh `analyze` pass, not `generate`.
   *
   * This remains `false` in proxy development mode because request-time proxy
   * routing is the authority for cold heavy-route discovery there.
   */
  allowGenerateFallback: boolean;
};

/**
 * Resolve the best available Next phase approximation for page-time lookup.
 *
 * @returns Phase string compatible with the shared routing-strategy resolver.
 *
 * @remarks
 * Page-time lookup does not receive the real adapter `phase` argument, so we
 * intentionally derive the closest equivalent from `NODE_ENV`:
 *
 * - `development` behaves like the dev server phase
 * - everything else behaves like a production/build phase
 *
 * That is sufficient for the current policy split because the key question is
 * simply "are we on the dev proxy path or not?"
 */
const resolveLookupPhaseFromEnvironment = (): string =>
  process.env.NODE_ENV === 'development'
    ? PHASE_DEVELOPMENT_SERVER
    : PHASE_PRODUCTION_BUILD;

/**
 * Resolve the page-time lookup policy from the already-resolved app routing
 * policy.
 *
 * @param routingPolicy - Resolved app-level routing policy.
 * @returns Explicit lookup policy for the current environment.
 */
export const resolveRouteHandlerLookupPolicy = (
  routingPolicy: ResolvedRouteHandlersRoutingPolicy
): RouteHandlerLookupPolicy => {
  const routingStrategy = resolveRouteHandlerRoutingStrategy(
    resolveLookupPhaseFromEnvironment(),
    routingPolicy
  );

  if (routingStrategy.kind === 'proxy') {
    // In proxy development mode, page-time lookup becomes best-effort and
    // read-only.
    //
    // That means:
    // 1. request-time routing is the authority for cold heavy-route discovery
    // 2. `getStaticPaths` must not trigger target-wide analysis
    // 3. page-time lookup must not act as an exact owner split
    return {
      readPersistedLazyDiscoveries: true,
      allowGenerateFallback: false
    };
  }

  // Rewrite/build mode still needs an exact heavy/light split up front.
  //
  // That means:
  // 1. static path generation must know which routes belong to generated
  //    handlers
  // 2. page-time lookup may run a fresh analyze pass when necessary
  return {
    readPersistedLazyDiscoveries: false,
    allowGenerateFallback: true
  };
};
