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
 *   full generate fallback when shared cache is stale
 *
 * That last decision is the important one for fully lazy dev behavior. In
 * proxy development mode, page-time lookup must become read-only and must not
 * re-enter whole-target generation just to answer `getStaticPaths`.
 */
export type RouteHandlerLookupPolicy = {
  /**
   * Whether page-time lookup may consult persisted lazy discoveries and merge
   * them into the heavy-route answer.
   */
  readPersistedLazyDiscoveries: boolean;

  /**
   * Whether page-time lookup may fall back to full `mode: 'generate'` runtime
   * execution when shared persistent cache is missing or stale.
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
 * @param input - Policy-resolution input.
 * @param input.routingPolicy - Resolved app-level routing policy.
 * @returns Explicit lookup policy for the current environment.
 */
export const resolveRouteHandlerLookupPolicy = ({
  routingPolicy
}: {
  routingPolicy: ResolvedRouteHandlersRoutingPolicy;
}): RouteHandlerLookupPolicy => {
  const routingStrategy = resolveRouteHandlerRoutingStrategy({
    phase: resolveLookupPhaseFromEnvironment(),
    routingPolicy
  });

  if (routingStrategy.kind === 'proxy') {
    // In proxy development mode, page-time lookup becomes best-effort and
    // read-only. Request-time routing is the authority for cold heavy-route
    // discovery, so `getStaticPaths` must not trigger whole-target generation.
    return {
      readPersistedLazyDiscoveries: true,
      allowGenerateFallback: false
    };
  }

  // Rewrite mode preserves the historical contract: page-time lookup may
  // repair missing shared cache by running one full generate pass, because the
  // rewrite/build path still needs an exact heavy/light split up front.
  return {
    readPersistedLazyDiscoveries: false,
    allowGenerateFallback: true
  };
};
