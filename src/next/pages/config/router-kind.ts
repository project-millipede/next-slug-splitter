import { createConfigError } from '../../../utils/errors';
import { resolveRouteHandlerRouterKind } from '../../shared/config/router-kind';

import type {
  PagesRouteHandlersConfig,
  RouteHandlersConfig
} from '../../types';

/**
 * Narrow one loaded route-handlers config to the Pages Router contract.
 */
export const requirePagesRouteHandlersConfig = (
  routeHandlersConfig: RouteHandlersConfig | undefined,
  label = 'This route-handlers execution path'
): PagesRouteHandlersConfig | undefined => {
  if (routeHandlersConfig == null) {
    return undefined;
  }

  if (resolveRouteHandlerRouterKind(routeHandlersConfig) !== 'pages') {
    throw createConfigError(
      `${label} currently supports only routeHandlersConfig.routerKind = "pages".`
    );
  }

  return routeHandlersConfig as PagesRouteHandlersConfig;
};
