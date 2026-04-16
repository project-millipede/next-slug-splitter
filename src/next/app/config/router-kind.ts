import { createConfigError } from '../../../utils/errors';
import { resolveRouteHandlerRouterKind } from '../../shared/config/router-kind';

import type {
  AppRouteHandlersConfig,
  RouteHandlersConfig
} from '../../types';

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

  if (resolveRouteHandlerRouterKind(routeHandlersConfig) !== 'app') {
    throw createConfigError(
      `${label} currently supports only routeHandlersConfig.routerKind = "app".`
    );
  }

  return routeHandlersConfig as AppRouteHandlersConfig;
};
