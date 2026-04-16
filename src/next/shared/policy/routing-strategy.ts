import process from 'node:process';

import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

import type {
  ResolvedRouteHandlersRoutingPolicy,
  RouteHandlerDevelopmentRoutingMode
} from '../types';

/**
 * Environment override for development routing mode.
 *
 * @remarks
 * The high-level routing policy lives in config (`app.routing.development`).
 * This env var acts as a debug/override escape hatch and is interpreted in
 * exactly one place: the top-level routing strategy resolver.
 *
 * Accepted values: `'proxy'` or `'rewrites'`.
 */
export const ROUTE_HANDLER_DEV_ROUTING_ENV_VAR =
  'NEXT_SLUG_SPLITTER_DEV_ROUTING';

/**
 * Routing strategy selected for the current Next phase.
 *
 * @remarks
 * The plugin has two distinct routing paths:
 *
 * - `rewrites`
 *   The stable path. The adapter eagerly generates route-handler rewrites and
 *   injects them into the effective Next config.
 * - `proxy`
 *   The dev-only path. The adapter installs no route-handler rewrites up front.
 *   Instead, a generated root `proxy.ts` delegates incoming requests back into
 *   the library so routing can be decided at request time.
 *
 * Keeping the selection explicit makes later code much easier to read because
 * conditionals can talk about "routing strategy" instead of sprinkling raw
 * environment-variable checks throughout the integration.
 */
export type RouteHandlerRoutingStrategy =
  | {
      /**
       * Stable routing path based on Next config rewrites.
       */
      kind: 'rewrites';
      /**
       * Human-readable explanation of why rewrites were selected.
       */
      reason:
        | 'non-development-phase'
        | 'development-policy-rewrites'
        | 'environment-override-rewrites'
        | 'proxy-disabled-in-production';
    }
  | {
      /**
       * Request-time proxy path.
       */
      kind: 'proxy';
      /**
       * Stable identifier for the current proxy strategy implementation.
       */
      implementation: 'synthetic-root-proxy-file';
      /**
       * Human-readable explanation of why proxy was selected.
       */
      reason: 'development-policy-proxy' | 'environment-override-proxy';
    };

/**
 * Resolve the optional environment override for development routing mode.
 *
 * @returns Explicit development routing override when present, otherwise
 * `null`.
 */
const readEnvironmentRoutingOverride =
  (): RouteHandlerDevelopmentRoutingMode | null => {
  const configuredValue = process.env[ROUTE_HANDLER_DEV_ROUTING_ENV_VAR];

  if (configuredValue == null) {
    return null;
  }

  if (configuredValue === 'proxy') {
    return 'proxy';
  }

  if (configuredValue === 'rewrites') {
    return 'rewrites';
  }

  return null;
};

/**
 * Resolve the active routing strategy for the current Next phase.
 *
 * @param phase - Current Next phase string.
 * @param routingPolicy - Resolved high-level app routing policy.
 * @returns The explicit routing strategy the adapter should follow.
 *
 * @remarks
 * The conditional splits are intentionally kept here so the rest of the
 * adapter/runtime code can ask a semantic question:
 *
 * - "are we in rewrite mode?"
 * - "are we in proxy mode?"
 *
 * instead of repeating environment/phase checks in multiple places.
 */
export const resolveRouteHandlerRoutingStrategy = (
  phase: string,
  routingPolicy: ResolvedRouteHandlersRoutingPolicy
): RouteHandlerRoutingStrategy => {
  if (phase !== PHASE_DEVELOPMENT_SERVER) {
    // The proxy path is intentionally dev-only. Production build and server
    // keep the stable rewrite-based behavior so shipped apps stay on the
    // already-hardened routing contract.
    return {
      kind: 'rewrites',
      reason:
        process.env.NODE_ENV === 'production'
          ? 'proxy-disabled-in-production'
          : 'non-development-phase'
    };
  }

  const environmentOverride = readEnvironmentRoutingOverride();

  if (environmentOverride === 'rewrites') {
    return {
      kind: 'rewrites',
      reason: 'environment-override-rewrites'
    };
  }

  if (environmentOverride === 'proxy') {
    return {
      kind: 'proxy',
      implementation: 'synthetic-root-proxy-file',
      reason: 'environment-override-proxy'
    };
  }

  if (routingPolicy.development === 'rewrites') {
    return {
      kind: 'rewrites',
      reason: 'development-policy-rewrites'
    };
  }

  // Development defaults to proxy through the resolved app-level policy.
  return {
    kind: 'proxy',
    implementation: 'synthetic-root-proxy-file',
    reason: 'development-policy-proxy'
  };
};
