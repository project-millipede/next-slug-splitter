import { buildRouteHandlerNextResultWithRuntimeHarness } from '../../shared/runtime/results';

import type { RouteHandlerPipelineResult } from '../../../core/types';
import type { RouteHandlerNextResult } from '../../shared/types';
import type { ResolvedRouteHandlersConfig } from '../types';

export const buildRouteHandlerNextResult = (
  config: ResolvedRouteHandlersConfig,
  pipelineResult: RouteHandlerPipelineResult
): RouteHandlerNextResult =>
  buildRouteHandlerNextResultWithRuntimeHarness(config, pipelineResult);
