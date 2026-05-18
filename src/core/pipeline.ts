import { createPipelineError } from '../utils/errors';
import { isDefined, isNonEmptyArray } from '../utils/type-guards-extended';
import { captureRouteHandlerComponentGraph } from './capture';
import {
  compareLocalizedRouteIdentity,
  discoverLocalizedContentRoutes,
  sortStringArray
} from './discovery';
import { createHeavyRoutePlanner } from './heavy-route-planning';

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
  processorConfig: ResolvedRouteHandlerProcessorConfig;
  runtime?: {
    mdxCompileOptions?: RouteHandlerMdxCompileOptions;
  };
  handlerRouteParam: DynamicRouteParam;
  routeBasePath: string;
  paths: RouteHandlerPaths;
  targetId?: string;
  emitHandlerPages?: (input: {
    paths: RouteHandlerPaths;
    heavyRoutes: Array<PlannedHeavyRoute>;
    emitFormat: EmitFormat;
    handlerRouteParam: DynamicRouteParam;
    routeBasePath: string;
  }) => Promise<void>;
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
    config.paths.contentDir,
    localeConfig,
    config.contentLocaleMode
  );
  const planHeavyRoute = await createHeavyRoutePlanner(
    config.paths.rootDir,
    config.processorConfig,
    config
  );

  const plannedHeavyRoutes: Array<PlannedHeavyRoute> = [];
  for (const routePath of routePaths) {
    const { usedComponentNames } = await captureRouteHandlerComponentGraph(
      routePath.filePath,
      config.runtime?.mdxCompileOptions
    );

    // Capture reports every MDX component name. The heavy-route planner keeps
    // only component entries that should be emitted into generated handlers.
    const capturedComponentKeys = sortStringArray(usedComponentNames);

    if (capturedComponentKeys.length === 0) {
      continue;
    }

    const plannedHeavyRoute = await planHeavyRoute(
      routePath,
      capturedComponentKeys
    );

    if (plannedHeavyRoute == null) {
      // No component entries were emitted, so this route remains on the MDX
      // component scope path; eager generation skips handler emission.
      continue;
    }

    plannedHeavyRoutes.push(plannedHeavyRoute);
  }

  plannedHeavyRoutes.sort(compareLocalizedRouteIdentity);

  if (mode === 'generate') {
    await config.emitHandlerPages?.({
      paths: config.paths,
      heavyRoutes: plannedHeavyRoutes,
      emitFormat: config.emitFormat ?? 'ts',
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
