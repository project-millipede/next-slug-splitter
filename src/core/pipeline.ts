import { emitRouteHandlerPages } from '../generator/handlers';
import { planRouteHandlers } from './plan';

import type {
  PipelineMode,
  RouteHandlerPipelineOptions,
  RouteHandlerPipelineResult
} from './types';

/**
 * Execute the next-slug-splitter pipeline for one resolved target.
 *
 * Pipeline phases:
 * 1. Analysis
 *    Discover localized content routes, build the loadable-component snapshot, and
 *    classify the target's heavy routes.
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
  const plan = await planRouteHandlers(config);

  if (mode === 'generate') {
    let emitFormat = config.emitFormat;
    if (emitFormat == null) {
      emitFormat = 'ts';
    }

    await emitRouteHandlerPages({
      paths: config.paths,
      heavyRoutes: plan.heavyRoutes,
      loadableComponents: plan.loadableComponents,
      emitFormat,
      resolveHandlerFactoryVariant: config.resolveHandlerFactoryVariant,
      runtimeHandlerFactoryImportBase: config.runtimeHandlerFactoryImportBase,
      baseStaticPropsImport: config.baseStaticPropsImport,
      routeBasePath: config.routeBasePath
    });
  }

  return {
    analyzedCount: plan.analyzedCount,
    heavyCount: plan.heavyRoutes.length,
    heavyPaths: plan.heavyRoutes
  };
};
