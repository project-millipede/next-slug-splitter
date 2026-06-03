import { emitAppRouteHandlerPages } from '../../../../generator/app/target/handlers';
import { buildRouteHandlerNextResult } from '../results';
import { executeRouteHandlerTargetWithRuntimeHarness } from '../../../shared/runtime/target';

import type { PipelineMode } from '../../../../core/types';
import type { RouteHandlerNextResult } from '../../../shared/types';
import type { ResolvedRouteHandlersConfig } from '../../types';

/**
 * Execute one resolved App target: plan its heavy routes, emit the generated
 * handler pages, and build the Next integration result.
 *
 * @param config - Resolved App target config; its `localeConfig` decides whether
 *   each handler bakes its locale into `handlerParams` (multi-locale) or keeps
 *   the slug-only bag (single-locale).
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
      emitAppRouteHandlerPages({
        paths,
        heavyRoutes,
        emitFormat,
        routeContract: config.routeContract,
        handlerRouteParam,
        routeBasePath,
        routeModuleContract: config.routeModule,
        localeConfig: config.localeConfig
      }),
    buildNextResult: buildRouteHandlerNextResult
  });
