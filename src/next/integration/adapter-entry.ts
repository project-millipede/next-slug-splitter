import { createRequire } from 'node:module';
import path from 'node:path';
import process from 'node:process';

import { isNonEmptyString } from '../../utils/type-guards-extended';
import { isObjectRecord, readObjectProperty } from '../config/shared';
import type { RouteHandlersConfig } from '../types';
import { registerRouteHandlersConfig } from './config-registry';

const ROUTE_HANDLERS_ADAPTER_PATH = 'next-slug-splitter/next/adapter';
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
