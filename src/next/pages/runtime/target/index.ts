import { emitRouteHandlerPages } from '../../../../generator/pages/target/handlers';
import { buildRouteHandlerNextResult } from '../results';
import { executeRouteHandlerTargetWithRuntimeHarness } from '../../../shared/runtime/target';

import type { PipelineMode } from '../../../../core/types';
import type { RouteHandlerNextResult } from '../../../shared/types';
import type { ResolvedRouteHandlersConfig } from '../../types';

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
        routeBasePath
      }),
    buildNextResult: buildRouteHandlerNextResult
  });
