import { createPipelineError } from '../utils/errors';
import { isDefined, isNonEmptyArray } from '../utils/type-guards-extended';
import { classifyHeavyRoutes } from './analysis';
import { discoverLocalizedContentRoutes } from './discovery';
import { loadRouteRegistrySnapshot } from './registry';

import type {
  LocaleConfig,
  RouteHandlerPipelineOptions,
  RouteHandlerPlan
} from './types';

/**
 * Validate and return the locale configuration required for route discovery.
 *
 * @param options - Pipeline options containing the candidate locale config.
 * @returns The validated locale config.
 * @throws If locales are missing or the default locale is not part of the set.
 */
const assertLocaleConfig = (
  options: RouteHandlerPipelineOptions
): LocaleConfig => {
  const localeConfig = options.localeConfig;

  if (!isDefined(localeConfig) || !isNonEmptyArray(localeConfig.locales)) {
    throw createPipelineError('localeConfig.locales must be configured.');
  }

  if (!localeConfig.locales.includes(localeConfig.defaultLocale)) {
    throw createPipelineError(
      `defaultLocale "${localeConfig.defaultLocale}" is not in localeConfig.locales.`
    );
  }

  return localeConfig;
};

/**
 * Build the semantic route-handler plan without emitting files.
 *
 * @param options - Pipeline options describing the target route space.
 * @returns The analyzed route-handler plan containing heavy routes and the
 * resolved registry snapshot.
 */
export const planRouteHandlers = async (
  options: RouteHandlerPipelineOptions
): Promise<RouteHandlerPlan> => {
  const localeConfig = assertLocaleConfig(options);

  const routePaths = await discoverLocalizedContentRoutes(
    options.paths.contentPagesDir,
    localeConfig,
    options.contentLocaleMode
  );

  const registry = await loadRouteRegistrySnapshot(
    options.paths.buildtimeHandlerRegistryPath,
    options.paths.rootDir
  );

  const { analysisRecords, heavyRoutes } = await classifyHeavyRoutes({
    routePaths,
    registry,
    includeLocaleInHandlerPath: options.contentLocaleMode !== 'default-locale'
  });

  return {
    analyzedCount: analysisRecords.length,
    heavyRoutes,
    registry
  };
};
