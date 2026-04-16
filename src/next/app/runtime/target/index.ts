import { emitAppRouteHandlerPages } from '../../../../generator/app/target/handlers';
import { buildRouteHandlerNextResult } from '../results';
import { executeRouteHandlerTargetWithRuntimeHarness } from '../../../shared/runtime/target';

import type {
  PipelineMode,
} from '../../../../core/types';
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
      emitAppRouteHandlerPages({
        paths,
        heavyRoutes,
        emitFormat,
        routeModuleImport: config.routeModuleImport,
        handlerRouteParam,
        routeBasePath,
        routeModuleContract: config.routeModule
      }),
    buildNextResult: buildRouteHandlerNextResult
  });
