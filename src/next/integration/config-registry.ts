import type {
  RouteHandlersConfig,
  RouteHandlersTargetConfig
} from '../types';

const ROUTE_HANDLERS_CONFIG_SYMBOL = Symbol.for(
  'next-slug-splitter/next/config'
);

/**
 * Global registry for passing route handlers config to the adapter.
 */
type RouteHandlersConfigRegistry = {
  /**
   * Registered route handlers configuration.
   */
  config?: RouteHandlersConfig;
};

/**
 * Get the global config registry used to pass app config into
 * the Next adapter module.
 *
 * @returns Mutable global registry object shared within the current process.
 */
const getRouteHandlersConfigRegistry = (): RouteHandlersConfigRegistry => {
  const globalScope = globalThis as typeof globalThis & {
    [ROUTE_HANDLERS_CONFIG_SYMBOL]?: RouteHandlersConfigRegistry;
  };

  const existingRegistry = globalScope[ROUTE_HANDLERS_CONFIG_SYMBOL];
  if (existingRegistry) {
    return existingRegistry;
  }

  const registry: RouteHandlersConfigRegistry = {};
  globalScope[ROUTE_HANDLERS_CONFIG_SYMBOL] = registry;
  return registry;
};

/**
 * Read the config registered for the adapter process.
 *
 * @returns Registered `RouteHandlersConfig`, or `undefined` when no config has
 * been registered yet.
 */
export const readRegisteredRouteHandlersConfig = ():
  | RouteHandlersConfig
  | undefined => getRouteHandlersConfigRegistry().config;

/**
 * Register one resolved route handlers config object in the process-local
 * registry shared by the legacy adapter entrypoint.
 *
 * @param config - App-owned `RouteHandlersConfig`.
 * @returns The same config object after registration.
 */
export const registerRouteHandlersConfig = (
  config: RouteHandlersConfig
): RouteHandlersConfig => {
  getRouteHandlersConfigRegistry().config = config;
  return config;
};

/**
 * Read a provided route handlers config, or fall back to the config registered
 * for the adapter process when the caller did not supply one explicitly.
 *
 * @param routeHandlersConfig - Optional config provided by the current caller.
 * @returns The provided config when present, otherwise the registered config.
 */
export const readProvidedOrRegisteredRouteHandlersConfig = <
  TRouteHandlersConfig extends
    | RouteHandlersConfig
    | RouteHandlersTargetConfig
>(
  routeHandlersConfig: TRouteHandlersConfig | undefined
): TRouteHandlersConfig | RouteHandlersConfig | undefined => {
  if (routeHandlersConfig != null) {
    return routeHandlersConfig;
  }

  return readRegisteredRouteHandlersConfig();
};
