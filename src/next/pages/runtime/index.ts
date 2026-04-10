/**
 * Orchestrates the Next-facing route-handler runtime.
 *
 * @remarks
 * This module is the top-level runtime coordinator for the Next integration
 * layer.
 *
 * In the current phase-local architecture:
 * 1. configs are resolved from source-of-truth inputs
 * 2. generate mode first enforces build ownership of shared artifacts
 * 3. each resolved target executes directly against the core pipeline
 * 4. callers receive one fresh Next-facing result per resolved target
 *
 * There is no longer any persisted build-side runtime cache in this layer.
 */
import { synchronizeRouteHandlerPhaseArtifacts } from '../../shared/phase-artifacts';
import {
  loadResolvedRouteHandlersConfigs,
  type LoadResolvedRouteHandlersConfigsInput
} from './config';
import { executeRouteHandlerTarget } from './target/index';

import type { PipelineMode } from '../../../core/types';
import type { RouteHandlerNextResult } from '../../shared/types';
import type { ResolvedRouteHandlersConfig } from '../types';

/**
 * Input for executing the Next-integrated route-handler pipeline.
 */
export type ExecuteRouteHandlerNextPipelineInput =
  LoadResolvedRouteHandlersConfigsInput & {
    /**
     * Pipeline execution mode.
     */
    mode?: PipelineMode;
  };

/**
 * Execute the route-handler pipeline from pre-resolved configs.
 *
 * @param resolvedConfigs - Already-resolved target configs.
 * @param mode - Pipeline execution mode.
 * @returns Per-target Next integration results.
 */
export const executeResolvedRouteHandlerNextPipeline = async (
  resolvedConfigs: Array<ResolvedRouteHandlersConfig>,
  mode: PipelineMode = 'generate'
): Promise<Array<RouteHandlerNextResult>> => {
  if (mode === 'generate') {
    // Generate mode first establishes build ownership of emitted handlers and
    // other shared artifacts. That keeps build/generate independent from prior
    // dev-owned state before any target execution begins.
    await synchronizeRouteHandlerPhaseArtifacts(resolvedConfigs, 'build');
  }

  return Promise.all(
    resolvedConfigs.map(config => executeRouteHandlerTarget(config, mode))
  );
};

/**
 * Execute the full Next-integrated route-handler pipeline.
 *
 * @param input - Pipeline execution input.
 * @returns Per-target Next integration results.
 *
 * @remarks
 * This module stays orchestration-focused. Config loading, shared-cache
 * policy, fresh execution, and result shaping live in dedicated helpers.
 *
 * Consumer note:
 * calling this function is the top-level entry into the runtime execution
 * system. From here the call chain can traverse, in order:
 * - preparation while config is being loaded
 * - phase-artifact ownership in generate mode
 * - fresh per-target pipeline execution
 */
export const executeRouteHandlerNextPipeline = async ({
  rootDir,
  localeConfig,
  routeHandlersConfig,
  mode = 'generate'
}: ExecuteRouteHandlerNextPipelineInput): Promise<
  Array<RouteHandlerNextResult>
> => {
  // Consumer entry into the runtime config-loading group. This stage is where
  // app-owned preparation may run before the actual target execution phase.
  const resolvedConfigs = await loadResolvedRouteHandlersConfigs({
    rootDir,
    localeConfig,
    routeHandlersConfig
  });
  return executeResolvedRouteHandlerNextPipeline(resolvedConfigs, mode);
};
