/**
 * Executes one resolved route-handler target without cache reuse.
 *
 * @remarks
 * This module is narrow by design. It takes a fully resolved Next target
 * config, runs the core pipeline once for that target, and converts the core
 * result into the Next-specific runtime result shape. Cache policy and
 * multi-target orchestration live in `index.ts`.
 */
import { executeRouteHandlerPipeline } from '../../core/pipeline';

import { buildRouteHandlerNextResult } from './results';

import type { PipelineMode, RouteHandlerPipelineResult } from '../../core/types';
import type {
  ResolvedRouteHandlersConfig,
  RouteHandlerNextResult
} from '../types';

/**
 * Execute one resolved route-handler target directly against the core pipeline.
 *
 * @param input - Target execution input.
 * @returns Next integration result for the target.
 */
export const executeRouteHandlerTarget = async ({
  config,
  mode
}: {
  /**
   * Fully resolved target config.
   */
  config: ResolvedRouteHandlersConfig;
  /**
   * Pipeline execution mode.
   */
  mode: PipelineMode;
}): Promise<RouteHandlerNextResult> => {
  const coreResult: RouteHandlerPipelineResult = await executeRouteHandlerPipeline(
    config,
    mode
  );

  return buildRouteHandlerNextResult({
    config,
    pipelineResult: coreResult
  });
};
