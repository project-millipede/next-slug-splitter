import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

import type { RouteHandlersConfig } from '../types';
import { isNonEmptyString } from '../../utils/type-guards-extended';
import { readDeepProperty } from '../../utils/type-guards-custom';
import { registerRouteHandlersConfig } from './config-registry';

const ROUTE_HANDLERS_ADAPTER_PATH = 'next-slug-splitter/next/adapter';
const APP_ROOT_PACKAGE_RESOLUTION_ANCHOR = '__app_root_resolver__';

/**
 * Resolve the published slug-splitter adapter entry from the application root.
 *
 * This resolution logic performs two critical operations:
 *
 * 1. Root-Anchored Workspace Escape
 *    Resolution is explicitly anchored at the application root to force Node.js
 *    to look into the consumer's 'node_modules' tree.
 *    This ensures the returned path reflects a real installation rather than a
 *    relative path inside the 'next-slug-splitter' development workspace.
 *    Example:
 *     '/abs/path/to/app' ->
 *     '/abs/path/to/app/node_modules/next-slug-splitter/...'
 *
 * 2. Virtual Entrypoint Midpoint
 *    A static anchor string is appended to the root directory to create a
 *    virtual file path. This provides 'createRequire' with a stable base file
 *    context, allowing it to resolve the adapter module as if it were being
 *    imported by a file located directly at the application root.
 *    Example:
 *     Uses '__app_root_resolver__' as a simulated filename for resolution.
 *
 * @param rootDir - Absolute path to the application root directory.
 * @returns Absolute path to the published adapter entrypoint.
 */
export const resolveSlugSplitterAdapterEntry = (rootDir: string): string => {
  // 2. Virtual Entrypoint Midpoint:
  const requireFromRoot = createRequire(
    path.resolve(rootDir, APP_ROOT_PACKAGE_RESOLUTION_ANCHOR)
  );

  return requireFromRoot.resolve(ROUTE_HANDLERS_ADAPTER_PATH);
};

/**
 * Register one route-handlers config and return the static adapter module path.
 *
 * This registration process performs two critical operations:
 *
 * 1. Global Configuration Registry
 *    The application-owned configuration is registered into a global singleton.
 *    This ensures the internal adapter can access specific route handlers and
 *    processor logic during Next.js build and runtime phases.
 *    Example:
 *     registerRouteHandlersConfig(config)
 *
 * 2. Root Directory Resolution
 *    Determines the primary application root by checking 'app.rootDir' in the
 *    provided config. If the path is missing or invalid, it defaults to the
 *    current process working directory.
 *    Example:
 *     'app.rootDir' -> '/abs/path/to/project'
 *
 * @param config - App-owned config to register for the adapter.
 * @returns Static adapter module specifier for Next's `adapterPath`.
 */
export const createRouteHandlersAdapterPath = (
  config: RouteHandlersConfig
): string => {
  // 1. Global Configuration Registry:
  registerRouteHandlersConfig(config);

  // 2. Root Directory Resolution:
  let rootDir = process.cwd();

  /**
   * Type-safe deep resolution ensures 'app.rootDir' exists on the config.
   * If 'app' or 'rootDir' are missing, it safely returns undefined.
   */
  const configuredRootDir = readDeepProperty<RouteHandlersConfig, string>(
    config,
    'app.rootDir'
  );

  if (
    isNonEmptyString(configuredRootDir) &&
    path.isAbsolute(configuredRootDir)
  ) {
    rootDir = configuredRootDir;
  }

  return resolveSlugSplitterAdapterEntry(rootDir);
};
