import { statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createConfigError } from '../../utils/errors';
import { isNonEmptyString } from '../../utils/type-guards-extended';
import type { RouteHandlersConfig } from '../types';

const SLUG_SPLITTER_CONFIG_PATH_ENV = 'SLUG_SPLITTER_CONFIG_PATH';

/**
 * Resolve and validate the app-owned next-slug-splitter config module path.
 *
 * Validation rules:
 * 1. `configPath` must be a non-empty string.
 * 2. Relative paths are resolved from the Next entrypoint root.
 * 3. The resolved path must point to an existing file.
 *
 * @param input - Config file path input.
 * @returns Absolute path to the config module.
 */
export const resolveSlugSplitterConfigPath = ({
  rootDir,
  configPath
}: {
  rootDir: string;
  configPath: string;
}): string => {
  if (!isNonEmptyString(configPath)) {
    throw createConfigError(
      'withSlugSplitter(...) requires a non-empty configPath.'
    );
  }

  const resolvedConfigPath = path.isAbsolute(configPath)
    ? configPath
    : path.resolve(rootDir, configPath);
  const configStats = statSync(resolvedConfigPath, {
    throwIfNoEntry: false
  });

  if (!configStats?.isFile()) {
    throw createConfigError(
      `next-slug-splitter config file could not be found at "${resolvedConfigPath}".`
    );
  }

  return resolvedConfigPath;
};

/**
 * Register one config module path for later adapter-side loading.
 *
 * The path is stored in process environment state because `next.config.*`
 * evaluation and adapter execution may happen through separate module loads in
 * the same process.
 *
 * @param configPath - Absolute path to the config module.
 * @returns The same config path after registration.
 */
export const registerSlugSplitterConfigPath = (
  configPath: string
): string => {
  process.env[SLUG_SPLITTER_CONFIG_PATH_ENV] = configPath;
  return configPath;
};

/**
 * Read the registered config module path.
 *
 * @returns Absolute config path when registered, otherwise `undefined`.
 */
export const readRegisteredSlugSplitterConfigPath = (): string | undefined => {
  const configPath = process.env[SLUG_SPLITTER_CONFIG_PATH_ENV];

  if (!isNonEmptyString(configPath)) {
    return undefined;
  }

  return configPath;
};
