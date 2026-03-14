import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

import { isNonEmptyString } from '../../utils/type-guards-extended';
import { isObjectRecord, readObjectProperty } from '../config/shared';
import type {
  RouteHandlersConfig,
  RouteHandlersTargetConfig
} from '../types';

const ROUTE_HANDLERS_ADAPTER_PATH = 'next-slug-splitter/next/adapter';
const ROUTE_HANDLERS_CONFIG_SYMBOL = Symbol.for(
  'next-slug-splitter/next/config'
);
const APP_ROOT_PACKAGE_RESOLUTION_ANCHOR = '__app_root_resolver__';

/**
 * Resolve the published slug-splitter adapter entry from the application root.
 *
 * Resolution is anchored at the app root so the returned path reflects what a
 * real consumer installation can import, rather than a source-local package
 * path inside the next-slug-splitter workspace.
 *
 * @param input - Adapter resolution input.
 * @returns Absolute path to the published adapter entrypoint.
 */
export const resolveSlugSplitterAdapterEntry = ({
  rootDir
}: {
  rootDir: string;
}): string => {
  const requireFromRoot = createRequire(
    path.resolve(rootDir, APP_ROOT_PACKAGE_RESOLUTION_ANCHOR)
  );

  return requireFromRoot.resolve(ROUTE_HANDLERS_ADAPTER_PATH);
};

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
 * Register `RouteHandlersConfig` and return the static adapter module path.
 *
 * @param config - App-owned `RouteHandlersConfig` to register for the adapter.
 * @returns Static adapter module specifier for Next's `experimental.adapterPath`.
 */
export const createRouteHandlersAdapterPath = (
  config: RouteHandlersConfig
): string => {
  registerRouteHandlersConfig(config);

  let rootDir = process.cwd();
  const configuredApp = readObjectProperty(config, 'app');
  if (isObjectRecord(configuredApp)) {
    const configuredRootDir = readObjectProperty(configuredApp, 'rootDir');
    if (isNonEmptyString(configuredRootDir) && path.isAbsolute(configuredRootDir)) {
      rootDir = configuredRootDir;
    }
  }

  return resolveSlugSplitterAdapterEntry({ rootDir });
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
