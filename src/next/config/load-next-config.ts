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
