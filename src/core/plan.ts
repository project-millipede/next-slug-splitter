import { createPipelineError } from '../utils/errors';
import { isDefined, isNonEmptyArray } from '../utils/type-guards-extended';
import { classifyHeavyRoutes } from './analysis';
import { discoverLocalizedContentRoutes } from './discovery';
import {
  createRouteContext,
  createRouteHandlerRoutePlanner
} from './processor-runner';

import type {
  LocaleConfig,
  PlannedHeavyRoute,
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
 * @returns The analyzed route-handler plan containing heavy routes and their
 * resolved route-local generation plans.
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

  const { analysisRecords, heavyRoutes } = await classifyHeavyRoutes({
    routePaths,
    mdxCompileOptions: options.mdxCompileOptions,
    includeLocaleInHandlerPath: options.contentLocaleMode !== 'default-locale'
  });

  const planRoute = await createRouteHandlerRoutePlanner({
    rootDir: options.paths.rootDir,
    componentsImport: options.componentsImport,
    processorConfig: options.processorConfig,
    runtimeHandlerFactoryImportBase: options.runtimeHandlerFactoryImportBase
  });

  const routePathsByIdentity = new Map<string, string>();
  for (const routePath of routePaths) {
    routePathsByIdentity.set(
      `${routePath.locale}:${routePath.slugArray.join('/')}`,
      routePath.filePath
    );
  }

  const plannedHeavyRoutes: Array<PlannedHeavyRoute> = [];
  for (const heavyRoute of heavyRoutes) {
    const routeFilePath = routePathsByIdentity.get(
      `${heavyRoute.locale}:${heavyRoute.slugArray.join('/')}`
    );
    if (!isDefined(routeFilePath)) {
      throw createPipelineError(
        `Could not resolve source file path for handler "${heavyRoute.handlerId}".`
      );
    }

    const route = createRouteContext({
      filePath: routeFilePath,
      handlerId: heavyRoute.handlerId,
      handlerRelativePath: heavyRoute.handlerRelativePath,
      locale: heavyRoute.locale,
      routeBasePath: options.routeBasePath,
      slugArray: heavyRoute.slugArray,
      targetId: heavyRoute.targetId
    });

    const { factoryVariant, componentEntries } = await planRoute({
      route,
      capturedKeys: heavyRoute.usedLoadableComponentKeys
    });

    plannedHeavyRoutes.push({
      ...heavyRoute,
      factoryVariant,
      componentEntries
    });
  }

  return {
    analyzedCount: analysisRecords.length,
    heavyRoutes: plannedHeavyRoutes
  };
};
