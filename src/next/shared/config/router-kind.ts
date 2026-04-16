import { createConfigError } from '../../../utils/errors';

import type {
  RouteHandlerRouterKind,
  RouteHandlersConfigBase
} from '../types';

/**
 * Resolve the router family selected by the app-owned config.
 */
export const resolveRouteHandlerRouterKind = (
  routeHandlersConfig?: Pick<RouteHandlersConfigBase, 'routerKind'>
): RouteHandlerRouterKind => {
  const configuredRouterKind = routeHandlersConfig?.routerKind;

  if (configuredRouterKind == null) {
    throw createConfigError(
      'routeHandlersConfig.routerKind must be "pages" or "app".'
    );
  }

  if (
    configuredRouterKind === 'pages' ||
    configuredRouterKind === 'app'
  ) {
    return configuredRouterKind;
  }

  throw createConfigError(
    'routeHandlersConfig.routerKind must be "pages" or "app".'
  );
};
