/**
 * Executes one resolved route-handler target without cache reuse.
 *
 * @remarks
 * This module is narrow by design. It takes a fully resolved Next target
 * config, delegates execution to the core pipeline, and converts the resulting
 * pipeline data into the Next-specific runtime result shape. Cache policy and
 * multi-target orchestration live in `index.ts`.
 *
 * Consumers never call the lower-level core pipeline directly from application
 * code. Instead they call the runtime pipeline, and this module is the point
 * where one resolved Next target is handed off to core execution.
 */
import { executeRouteHandlerPipeline } from '../../../core/pipeline';
import { buildRouteHandlerNextResult } from '../shared/results';

import type {
  PipelineMode,
  RouteHandlerPipelineResult
} from '../../../core/types';
import type {
  ResolvedRouteHandlersConfig,
  RouteHandlerNextResult
} from '../../types';

/**
 * Execute one resolved route-handler target directly against the core pipeline.
 *
 * @param config - Fully resolved target config.
 * @param mode - Pipeline execution mode.
 * @returns Next integration result for the target.
 */
export const executeRouteHandlerTarget = async (
  config: ResolvedRouteHandlersConfig,
  mode: PipelineMode
): Promise<RouteHandlerNextResult> => {
  // This is the per-target hand-off from the Next runtime layer into core
  // planning/generation for one fully resolved target.
  const coreResult: RouteHandlerPipelineResult =
    await executeRouteHandlerPipeline(config, mode);

  return buildRouteHandlerNextResult(config, coreResult);
};
