import { emitRouteHandlerPages } from '../generator/pages/target/handlers';
import { createPipelineError } from '../utils/errors';
import { isDefined, isNonEmptyArray } from '../utils/type-guards-extended';
import { captureRouteHandlerComponentGraph } from './capture';
import {
  compareLocalizedRouteIdentity,
  discoverLocalizedContentRoutes,
  sortStringArray,
  toHandlerId,
  toHandlerRelativePath
} from './discovery';
import {
  createRouteContext,
  createRouteHandlerRoutePlanner
} from './processor-runner';

import type {
  ContentLocaleMode,
  DynamicRouteParam,
  EmitFormat,
  LocaleConfig,
  PlannedHeavyRoute,
  ResolvedRouteHandlerModuleReference,
  ResolvedRouteHandlerProcessorConfig,
  RouteHandlerMdxCompileOptions,
  RouteHandlerPaths,
  RouteHandlerPipelineResult,
  PipelineMode
} from './types';

type RouteHandlerPipelineOptions = {
  localeConfig: LocaleConfig;
  contentLocaleMode?: ContentLocaleMode;
  emitFormat?: EmitFormat;
  baseStaticPropsImport: ResolvedRouteHandlerModuleReference;
  processorConfig: ResolvedRouteHandlerProcessorConfig;
  runtime?: {
    mdxCompileOptions?: RouteHandlerMdxCompileOptions;
  };
  handlerRouteParam: DynamicRouteParam;
  routeBasePath: string;
  paths: RouteHandlerPaths;
  targetId?: string;
};

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
 * Execute the next-slug-splitter pipeline for one resolved target.
 *
 * Pipeline phases:
 * 1. Analysis
 *    Discover localized content routes, capture referenced components, and
 *    build route-local generation plans for heavy routes.
 * 2. Generation
 *    When `mode === 'generate'`, emit one handler page for each heavy route
 *    selected during analysis.
 *
 * Runtime invariants:
 * 1. `config` has already been normalized to the resolved pipeline shape.
 * 2. `routeBasePath` is required at this stage because generated handlers and
 *    downstream rewrite construction both depend on a normalized public base
 *    path.
 *
 * @param config - Fully resolved pipeline configuration for the target.
 * @param mode - Execution mode. `analyze` stops after planning, while
 * `generate` performs planning and file emission.
 * @returns Pipeline result containing analyzed route counts and the heavy
 * route candidates selected during analysis.
 */
export const executeRouteHandlerPipeline = async (
  config: RouteHandlerPipelineOptions,
  mode: PipelineMode = 'generate'
): Promise<RouteHandlerPipelineResult> => {
  const localeConfig = assertLocaleConfig(config);
  const routePaths = await discoverLocalizedContentRoutes(
    config.paths.contentPagesDir,
    localeConfig,
    config.contentLocaleMode
  );
  const planRoute = await createRouteHandlerRoutePlanner({
    rootDir: config.paths.rootDir,
    processorConfig: config.processorConfig
  });

  const plannedHeavyRoutes: Array<PlannedHeavyRoute> = [];
  for (const routePath of routePaths) {
    const { usedComponentNames } = await captureRouteHandlerComponentGraph(
      routePath.filePath,
      config.runtime?.mdxCompileOptions
    );
    const usedLoadableComponentKeys = sortStringArray(usedComponentNames);

    if (usedLoadableComponentKeys.length === 0) {
      continue;
    }

    const handlerId = toHandlerId(routePath.locale, routePath.slugArray);
    const handlerRelativePath = toHandlerRelativePath(
      routePath.locale,
      routePath.slugArray,
      {
        includeLocaleLeaf: config.contentLocaleMode !== 'default-locale'
      }
    );
    const route = createRouteContext({
      filePath: routePath.filePath,
      handlerId,
      handlerRelativePath,
      locale: routePath.locale,
      routeBasePath: config.routeBasePath,
      slugArray: routePath.slugArray,
      targetId: config.targetId
    });
    const {
      factoryImport,
      factoryBindings,
      componentEntries
    } = await planRoute({
      route,
      capturedComponentKeys: usedLoadableComponentKeys
    });

    plannedHeavyRoutes.push({
      locale: routePath.locale,
      slugArray: routePath.slugArray,
      handlerId,
      handlerRelativePath,
      usedLoadableComponentKeys,
      factoryImport,
      factoryBindings,
      componentEntries
    });
  }

  plannedHeavyRoutes.sort(compareLocalizedRouteIdentity);

  if (mode === 'generate') {
    await emitRouteHandlerPages({
      paths: config.paths,
      heavyRoutes: plannedHeavyRoutes,
      emitFormat: config.emitFormat ?? 'ts',
      baseStaticPropsImport: config.baseStaticPropsImport,
      handlerRouteParam: config.handlerRouteParam,
      routeBasePath: config.routeBasePath
    });
  }

  return {
    analyzedCount: routePaths.length,
    heavyCount: plannedHeavyRoutes.length,
    heavyPaths: plannedHeavyRoutes
  };
};
