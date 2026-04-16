/**
 * Executes one resolved route-handler target without cache reuse.
 *
 * @remarks
 * This module is narrow by design. It takes a fully resolved Next target
 * config, delegates execution to the core pipeline, and converts the resulting
 * pipeline data into the Next-specific runtime result shape. Cache policy and
 * multi-target orchestration live in the pipeline layer.
 *
 * Consumers never call the lower-level core pipeline directly from application
 * code. Instead they call the runtime pipeline, and this module is the point
 * where one resolved Next target is handed off to core execution.
 */
import { executeRouteHandlerPipeline } from '../../../core/pipeline'

import type {
  DynamicRouteParam,
  EmitFormat,
  LocaleConfig,
  PipelineMode,
  PlannedHeavyRoute,
  RouteHandlerPaths,
  RouteHandlerPipelineResult
} from '../../../core/types'
import type {
  ResolvedRouteHandlersTargetConfigBase,
  RouteHandlerNextResult
} from '../types'

type RouteHandlerRuntimeExecutionConfig = ResolvedRouteHandlersTargetConfigBase & {
  /**
   * Normalized locale configuration for the current router path.
   */
  localeConfig: LocaleConfig;
}

/**
 * Execute one resolved route-handler target directly against the core pipeline.
 *
 * @param input - Target execution input.
 * @returns Next integration result for the target.
 */
export const executeRouteHandlerTargetWithRuntimeHarness = async <
  TResolvedConfig extends RouteHandlerRuntimeExecutionConfig,
  TResult extends RouteHandlerNextResult = RouteHandlerNextResult
>({
  config,
  mode,
  emitHandlerPages,
  buildNextResult
}: {
  /**
   * Fully resolved target config.
   */
  config: TResolvedConfig;
  /**
   * Pipeline execution mode.
   */
  mode: PipelineMode;
  /**
   * Router-specific generated-handler emitter.
   */
  emitHandlerPages: (input: {
    paths: RouteHandlerPaths;
    heavyRoutes: Array<PlannedHeavyRoute>;
    emitFormat: EmitFormat;
    handlerRouteParam: DynamicRouteParam;
    routeBasePath: string;
  }) => Promise<void>;
  /**
   * Router-specific Next result builder.
   */
  buildNextResult: (
    config: TResolvedConfig,
    pipelineResult: RouteHandlerPipelineResult
  ) => TResult;
}): Promise<TResult> => {
  // This is the per-target hand-off from the Next runtime layer into core
  // planning/generation for one fully resolved target.
  const coreResult: RouteHandlerPipelineResult =
    await executeRouteHandlerPipeline(
      {
        ...config,
        emitHandlerPages
      },
      mode
    )

  return buildNextResult(config, coreResult)
}
