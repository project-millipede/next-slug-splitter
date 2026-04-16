import { resolveRouteHandlersAppConfig } from '../config/app';

import type { ResolvedRouteHandlersAppConfig } from '../types';
import type {
  RouteHandlersConfig
} from '../../types';

/**
 * Resolved route-handlers app context used after the app-owned config object
 * and its derived app settings have been lined up.
 */
export type RouteHandlersAppContext = {
  appConfig: ResolvedRouteHandlersAppConfig;
  routeHandlersConfig: RouteHandlersConfig | undefined;
};

/**
 * Resolve the app-level route-handlers context from explicit entrypoint values
 * plus an optional already-loaded route-handlers config.
 *
 * @param routeHandlersConfig - Already-loaded route-handlers config when available.
 * @param rootDir - Optional explicit app root override.
 * @returns Resolved app config plus the exact route-handlers config used.
 */
export const resolveRouteHandlersAppContext = (
  routeHandlersConfig: RouteHandlersConfig | undefined,
  rootDir?: string
): RouteHandlersAppContext => ({
  routeHandlersConfig,
  appConfig: resolveRouteHandlersAppConfig({
    rootDir,
    routeHandlersConfig
  })
});
