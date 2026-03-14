import { existsSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'url';

import type { NextConfig } from 'next';
import { PHASE_PRODUCTION_BUILD } from 'next/constants.js';

import { createConfigError } from '../../utils/errors';
import { isFunction } from '../../utils/type-guards';
import { isObjectRecord } from './shared';

/**
 * Alias for Next.js config type.
 */
export type NextConfigLike = NextConfig;

/**
 * Supported default Next config filenames for CLI auto-discovery.
 *
 * @remarks
 * This list is only used when the CLI needs to locate a Next config file
 * without an explicit `--config` argument. The core library contract remains
 * app-config-driven through `routeHandlersConfig.app.nextConfigPath`.
 */
export const DEFAULT_NEXT_CONFIG_FILENAMES = [
  'next.config.ts',
  'next.config.js',
  'next.config.mjs',
  'next.config.cjs'
] as const;

/**
 * Resolve the first supported Next config file that exists inside `rootDir`.
 *
 * @param rootDir - App root directory to search.
 * @returns The absolute Next config path when one of the supported default
 * filenames exists, otherwise `undefined`.
 */
export const findNextConfigPath = (rootDir: string): string | undefined => {
  for (const fileName of DEFAULT_NEXT_CONFIG_FILENAMES) {
    const nextConfigPath = path.resolve(rootDir, fileName);
    if (existsSync(nextConfigPath)) {
      return nextConfigPath;
    }
  }

  return undefined;
};

/**
 * Load the configured Next config file into an object shape usable by the
 * next-slug-splitter integration.
 *
 * @param nextConfigPath - Absolute Next config file path.
 * @returns Loaded Next config object.
 * @throws If the module does not resolve to an object-valued config.
 */
export const loadNextConfig = async (
  nextConfigPath: string
): Promise<NextConfigLike> => {
  const nextConfigModule = await import(pathToFileURL(nextConfigPath).href);
  let loadedConfig: unknown = nextConfigModule.default;
  if (loadedConfig == null) {
    loadedConfig = nextConfigModule;
  }

  if (isFunction(loadedConfig)) {
    const resolvedConfig = await loadedConfig(PHASE_PRODUCTION_BUILD, {
      defaultConfig: {}
    });

    if (!isObjectRecord(resolvedConfig)) {
      throw createConfigError(
        'Configured Next config function must resolve to an object.'
      );
    }

    return resolvedConfig;
  }

  if (!isObjectRecord(loadedConfig)) {
    throw createConfigError(
      'Configured Next config file must export an object.'
    );
  }

  return loadedConfig;
};
