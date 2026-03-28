import { statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { createConfigError } from '../../utils/errors';
import { isNonEmptyString } from '../../utils/type-guards-extended';
import type { RouteHandlersConfig } from '../types';

const SLUG_SPLITTER_CONFIG_PATH_ENV = 'SLUG_SPLITTER_CONFIG_PATH';
const SLUG_SPLITTER_CONFIG_ROOT_DIR_ENV = 'SLUG_SPLITTER_CONFIG_ROOT_DIR';
const SLUG_SPLITTER_CONVENTIONAL_CONFIG_FILE_NAMES = [
  'route-handlers-config.ts',
  'route-handlers-config.mts',
  'route-handlers-config.cts',
  'route-handlers-config.js',
  'route-handlers-config.mjs',
  'route-handlers-config.cjs',
  'route-handlers.config.ts',
  'route-handlers.config.mts',
  'route-handlers.config.cts',
  'route-handlers.config.js',
  'route-handlers.config.mjs',
  'route-handlers.config.cjs'
] as const;

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
 * @param options - Additional app-registration context.
 * @param options.rootDir - True app root captured during `next.config.*`
 * evaluation.
 * @returns The same config path after registration.
 */
export const registerSlugSplitterConfigPath = (
  configPath: string,
  options?: {
    rootDir?: string;
  }
): string => {
  process.env[SLUG_SPLITTER_CONFIG_PATH_ENV] = configPath;

  if (isNonEmptyString(options?.rootDir)) {
    process.env[SLUG_SPLITTER_CONFIG_ROOT_DIR_ENV] = options.rootDir;
  }

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

/**
 * Read the registered app root directory captured during `next.config.*`
 * evaluation.
 *
 * @returns Absolute app root when registered, otherwise `undefined`.
 */
export const readRegisteredSlugSplitterConfigRootDir = ():
  | string
  | undefined => {
  const rootDir = process.env[SLUG_SPLITTER_CONFIG_ROOT_DIR_ENV];

  if (!isNonEmptyString(rootDir)) {
    return undefined;
  }

  return rootDir;
};

/**
 * Resolve the strongest config-registration information available for later
 * adapter or proxy bridging work.
 *
 * @param rootDir - True app root directory.
 * @returns Explicit registration when available, otherwise a conventional
 * root-level config file guess for direct-object integrations.
 *
 * @remarks
 * There are two ways apps register splitter config:
 *
 * 1. `withSlugSplitter({ configPath })`
 *    We know the exact config module path and can persist it directly.
 *
 * 2. `withSlugSplitter({ routeHandlersConfig })`
 *    We receive only the already materialized config object. That is enough
 *    for the main adapter process, but the dev-only proxy worker later needs a
 *    concrete module path so a fresh child Node process can reload the app's
 *    config-heavy planning stack.
 *
 * In that direct-object case we cannot faithfully reconstruct arbitrary module
 * provenance from the object itself, so we intentionally fall back to a narrow
 * set of conventional root-level filenames. This keeps the heuristic small and
 * explicit while supporting the common app layout used by local workspaces like
 * Millipede.
 */
export const resolveRegisteredSlugSplitterConfigRegistration = (
  rootDir: string
): {
  configPath?: string;
  rootDir: string;
} => {
  const registeredConfigPath = readRegisteredSlugSplitterConfigPath();
  const registeredRootDir = readRegisteredSlugSplitterConfigRootDir();

  if (registeredConfigPath != null) {
    return {
      configPath: registeredConfigPath,
      rootDir: registeredRootDir ?? rootDir
    };
  }

  for (const fileName of SLUG_SPLITTER_CONVENTIONAL_CONFIG_FILE_NAMES) {
    const candidatePath = path.join(rootDir, fileName);
    const configStats = statSync(candidatePath, {
      throwIfNoEntry: false
    });

    if (configStats?.isFile()) {
      return {
        configPath: candidatePath,
        rootDir
      };
    }
  }

  return {
    rootDir: registeredRootDir ?? rootDir
  };
};
