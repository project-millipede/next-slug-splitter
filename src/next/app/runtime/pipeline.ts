import {
  loadResolvedRouteHandlersConfigs
} from './config';
import { executeRouteHandlerTarget } from './target/index';
import {
  executeResolvedRouteHandlerNextPipelineWithRuntimeHarness,
  executeRouteHandlerNextPipelineWithRuntimeHarness,
  type ExecuteRouteHandlerNextPipelineInput as SharedExecuteRouteHandlerNextPipelineInput
} from '../../shared/runtime/pipeline';

import type { PipelineMode } from '../../../core/types';
import type { RouteHandlerNextResult } from '../../shared/types';
import type {
  ResolvedRouteHandlersConfig,
  RouteHandlersConfig
} from '../types';

export type ExecuteRouteHandlerNextPipelineInput =
  SharedExecuteRouteHandlerNextPipelineInput<RouteHandlersConfig>;

export const executeResolvedRouteHandlerNextPipeline = async (
  resolvedConfigs: Array<ResolvedRouteHandlersConfig>,
  mode: PipelineMode = 'generate'
): Promise<Array<RouteHandlerNextResult>> =>
  executeResolvedRouteHandlerNextPipelineWithRuntimeHarness({
    resolvedConfigs,
    mode,
    executeTarget: executeRouteHandlerTarget
  });

export const executeRouteHandlerNextPipeline = async ({
  rootDir,
  localeConfig,
  routeHandlersConfig,
  mode = 'generate'
}: ExecuteRouteHandlerNextPipelineInput): Promise<
  Array<RouteHandlerNextResult>
> =>
  executeRouteHandlerNextPipelineWithRuntimeHarness({
    rootDir,
    localeConfig,
    routeHandlersConfig,
    mode,
    loadResolvedConfigs: loadResolvedRouteHandlersConfigs,
    executeTarget: executeRouteHandlerTarget
  });
