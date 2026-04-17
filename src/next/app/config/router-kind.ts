import { createConfigError } from '../../../utils/errors';
import { resolveRouteHandlerRouterKind } from '../../shared/config/router-kind';

import type {
  AppRouteHandlersConfig,
  RouteHandlersConfig
} from '../../types';

const isAppRouteHandlersConfig = (
  routeHandlersConfig: RouteHandlersConfig
): routeHandlersConfig is AppRouteHandlersConfig =>
  resolveRouteHandlerRouterKind(routeHandlersConfig) === 'app';

/**
 * Narrow one loaded route-handlers config to the App Router contract.
 */
export const requireAppRouteHandlersConfig = (
  routeHandlersConfig: RouteHandlersConfig | undefined,
  label = 'This route-handlers execution path'
): AppRouteHandlersConfig | undefined => {
  if (routeHandlersConfig == null) {
    return undefined;
  }

  if (!isAppRouteHandlersConfig(routeHandlersConfig)) {
    throw createConfigError(
      `${label} currently supports only routeHandlersConfig.routerKind = "app".`
    );
  }

  return routeHandlersConfig;
};
