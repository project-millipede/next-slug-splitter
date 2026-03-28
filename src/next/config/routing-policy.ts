import { createConfigError } from '../../utils/errors';
import { readObjectProperty } from './shared';

import type {
  ResolvedRouteHandlersRoutingPolicy,
  RouteHandlerDevelopmentRoutingMode
} from '../types';

/**
 * Default app-level routing policy.
 *
 * @remarks
 * The default now intentionally points development toward the request-time
 * proxy path. That matches the current product direction: proxy is the primary
 * development experience, while rewrites remain the stable production/build
 * path and an explicit dev override.
 */
const DEFAULT_ROUTE_HANDLERS_ROUTING_POLICY: ResolvedRouteHandlersRoutingPolicy =
  {
    development: 'proxy'
  };

/**
 * Determine whether a candidate value is a supported development routing mode.
 *
 * @param value - Unknown candidate value.
 * @returns `true` when the value is one of the supported development routing
 * modes.
 */
const isRouteHandlerDevelopmentRoutingMode = (
  value: unknown
): value is RouteHandlerDevelopmentRoutingMode =>
  value === 'proxy' || value === 'rewrites';

/**
 * Resolve the app-level routing policy from the raw `routeHandlersConfig.app`
 * object.
 *
 * @param configuredApp - Already validated raw app config object.
 * @returns Fully resolved app-level routing policy.
 *
 * @remarks
 * This resolver intentionally owns the defaulting and validation logic for
 * routing strategy configuration. The deeper strategy selector should receive
 * only a resolved policy object, not raw config records, because:
 * - defaulting belongs at config resolution time
 * - validation errors should point to config shape, not runtime branches
 * - the rest of the system should consume one semantic policy contract
 */
export const resolveRouteHandlersRoutingPolicy = (
  configuredApp: Record<string, unknown>
): ResolvedRouteHandlersRoutingPolicy => {
  const configuredRouting = readObjectProperty(configuredApp, 'routing');

  if (configuredRouting == null) {
    return {
      ...DEFAULT_ROUTE_HANDLERS_ROUTING_POLICY
    };
  }

  if (
    typeof configuredRouting !== 'object' ||
    Array.isArray(configuredRouting)
  ) {
    throw createConfigError('routeHandlersConfig.app.routing must be an object.');
  }

  const configuredDevelopment = readObjectProperty(
    configuredRouting as Record<string, unknown>,
    'development'
  );

  if (configuredDevelopment == null) {
    return {
      ...DEFAULT_ROUTE_HANDLERS_ROUTING_POLICY
    };
  }

  if (!isRouteHandlerDevelopmentRoutingMode(configuredDevelopment)) {
    throw createConfigError(
      'routeHandlersConfig.app.routing.development must be "proxy" or "rewrites" when provided.'
    );
  }

  return {
    development: configuredDevelopment
  };
};
