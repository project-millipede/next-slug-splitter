import { pathToFileURL } from 'node:url';

import { createConfigError } from '../../utils/errors';
import type { RouteHandlersConfig } from '../types';

import { isObjectRecord, readObjectProperty } from '../shared/config/shared';
import {
  readRegisteredRouteHandlersConfig,
  registerRouteHandlersConfig
} from './config-registry';
import { readRegisteredSlugSplitterConfigPath } from './slug-splitter-config';

/**
 * Load one app-owned next-slug-splitter config module from disk.
 *
 * Supported module shapes:
 * 1. named export `routeHandlersConfig`
 * 2. default export
 *
 * @param configPath - Absolute path to the config module.
 * @returns Loaded route handlers config object.
 */
export const loadSlugSplitterConfigFromPath = async (
  configPath: string
): Promise<RouteHandlersConfig> => {
  const configModule = await import(pathToFileURL(configPath).href);
  let loadedConfig = readObjectProperty(configModule, 'routeHandlersConfig');
  if (loadedConfig == null) {
    loadedConfig = readObjectProperty(configModule, 'default');
  }

  if (!isObjectRecord(loadedConfig)) {
    throw createConfigError(
      `next-slug-splitter config module "${configPath}" must export an object as either "routeHandlersConfig" or the default export.`
    );
  }

  return loadedConfig as RouteHandlersConfig;
};

/**
 * Load the registered route handlers config object, if one exists.
 *
 * Resolution order:
 * 1. process-local config registered by `createRouteHandlersAdapterPath(...)`
 * 2. file-based config registered by `withSlugSplitter(...)`
 *
 * @returns Registered route handlers config object, or `undefined` when no
 * registration has occurred yet.
 */
export const loadRegisteredSlugSplitterConfig = async ():
  Promise<RouteHandlersConfig | undefined> => {
  const existingConfig = readRegisteredRouteHandlersConfig();
  if (existingConfig) {
    return existingConfig;
  }

  const registeredConfigPath = readRegisteredSlugSplitterConfigPath();
  if (registeredConfigPath == null) {
    return undefined;
  }

  return registerRouteHandlersConfig(
    await loadSlugSplitterConfigFromPath(registeredConfigPath)
  );
};
