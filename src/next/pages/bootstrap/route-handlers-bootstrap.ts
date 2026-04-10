import { resolveRouteHandlersAppConfig } from '../../shared/config/app';
import { loadRegisteredSlugSplitterConfig } from '../../integration/slug-splitter-config-loader';

import type {
  ResolvedRouteHandlersAppConfig
} from '../../shared/types';
import type {
  RouteHandlersConfig,
  RouteHandlersEntrypointInput
} from '../types';

/**
 * Resolved route-handlers app context used after the app-owned config object
 * and its derived app settings have been lined up.
 */
export type RouteHandlersAppContext = {
  appConfig: ResolvedRouteHandlersAppConfig;
  routeHandlersConfig: RouteHandlersConfig | undefined;
};

/**
 * Read the app-owned route-handlers config from the current caller or the
 * registered loader path.
 *
 * @param routeHandlersConfig - Optional explicit route-handlers config.
 * @returns The explicit config when present, otherwise the registered config.
 */
export const loadRouteHandlersConfigOrRegistered = async (
  routeHandlersConfig?: RouteHandlersConfig
): Promise<RouteHandlersConfig | undefined> =>
  routeHandlersConfig ?? (await loadRegisteredSlugSplitterConfig());

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
  rootDir?: RouteHandlersEntrypointInput['rootDir']
): RouteHandlersAppContext => ({
  routeHandlersConfig,
  appConfig: resolveRouteHandlersAppConfig({
    rootDir,
    routeHandlersConfig
  })
});
