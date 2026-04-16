import { loadRegisteredSlugSplitterConfig } from './slug-splitter-config-loader';

import type { RouteHandlersConfig } from '../types';

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
