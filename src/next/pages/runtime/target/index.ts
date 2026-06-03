import { emitRouteHandlerPages } from '../../../../generator/pages/target/handlers';
import { buildRouteHandlerNextResult } from '../results';
import { executeRouteHandlerTargetWithRuntimeHarness } from '../../../shared/runtime/target';

import type { PipelineMode } from '../../../../core/types';
import type { RouteHandlerNextResult } from '../../../shared/types';
import type { ResolvedRouteHandlersConfig } from '../../types';

/**
 * Execute one resolved Pages target: plan its heavy routes, emit the generated
 * handler pages, and build the Next integration result.
 *
 * @param config - Resolved Pages target config; its `localeConfig` drives the
 *   per-locale vs concrete leaf shape and the build-only `K = 1` merge.
 * @param mode - Pipeline execution mode (e.g. `generate` for build).
 * @returns Next integration result for the target.
 */
export const executeRouteHandlerTarget = async (
  config: ResolvedRouteHandlersConfig,
  mode: PipelineMode
): Promise<RouteHandlerNextResult> =>
  executeRouteHandlerTargetWithRuntimeHarness({
    config,
    mode,
    emitHandlerPages: async ({
      paths,
      heavyRoutes,
      emitFormat,
      handlerRouteParam,
      routeBasePath
    }) =>
      emitRouteHandlerPages({
        paths,
        heavyRoutes,
        emitFormat,
        routeContract: config.routeContract,
        handlerRouteParam,
        routeBasePath,
        localeConfig: config.localeConfig
      }),
    buildNextResult: buildRouteHandlerNextResult
  });
