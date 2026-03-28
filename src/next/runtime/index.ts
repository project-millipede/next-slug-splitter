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
 * 4. multi-target callers merge fresh per-target results here
 *
 * There is no longer any persisted build-side runtime cache in this layer.
 */
import { type NextConfigLike } from '../config/index';
import { synchronizeRouteHandlerPhaseArtifacts } from '../phase-artifacts';
import { deriveRouteHandlerRuntimeSemantics } from '../runtime-semantics/derive';
import {
  loadResolvedRouteHandlersConfigs,
  type LoadResolvedRouteHandlersConfigsInput
} from './config';
import { mergeRouteHandlerNextResults } from './shared/results';
import { executeRouteHandlerTarget } from './target/index';

import type { PipelineMode } from '../../core/types';
import type {
  ResolvedRouteHandlersConfig,
  RouteHandlerNextResult
} from '../types';

/**
 * Input for executing the Next-integrated route-handler pipeline.
 */
export type ExecuteRouteHandlerNextPipelineInput =
  LoadResolvedRouteHandlersConfigsInput & {
    /**
     * Already-loaded Next config object when available.
     */
    nextConfig?: NextConfigLike;
    /**
     * Pipeline execution mode.
     */
    mode?: PipelineMode;
  };

/**
 * Execute the route-handler pipeline from pre-resolved configs.
 *
 * @param input - Pipeline execution input with already-resolved target configs.
 * @returns The merged Next integration result for the configured targets.
 */
export const executeResolvedRouteHandlerNextPipeline = async ({
  resolvedConfigs,
  mode = 'generate'
}: {
  resolvedConfigs: Array<ResolvedRouteHandlersConfig>;
  mode?: PipelineMode;
}): Promise<RouteHandlerNextResult> => {
  if (mode === 'generate') {
    // Generate mode first establishes build ownership of emitted handlers and
    // other shared artifacts. That keeps build/generate independent from prior
    // dev-owned state before any target execution begins.
    await synchronizeRouteHandlerPhaseArtifacts({
      resolvedConfigs,
      phase: 'build'
    });
  }

  if (resolvedConfigs.length === 1) {
    const [singleResolvedTarget] = resolvedConfigs;

    // Single-target execution is now a direct hand-off. After phase
    // synchronization, this layer just executes the one resolved target and
    // returns its Next-facing result.
    return executeRouteHandlerTarget({
      config: singleResolvedTarget,
      mode
    });
  }

  const freshResults = await Promise.all(
    resolvedConfigs.map(config =>
      // Multi-target execution is equally direct. Each resolved target runs
      // fresh against the core pipeline, and this layer only collects the
      // per-target results for the final merge step.
      executeRouteHandlerTarget({
        config,
        mode
      })
    )
  );

  // Merging is the remaining orchestration responsibility after the fresh
  // per-target executions above complete.
  return mergeRouteHandlerNextResults({
    results: freshResults
  });
};

/**
 * Execute the full Next-integrated route-handler pipeline.
 *
 * @param input - Pipeline execution input.
 * @returns The merged Next integration result for the configured targets.
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
 * - result merging for multi-target callers
 */
export const executeRouteHandlerNextPipeline = async ({
  rootDir,
  localeConfig,
  nextConfig,
  routeHandlersConfig,
  mode = 'generate'
}: ExecuteRouteHandlerNextPipelineInput = {}): Promise<RouteHandlerNextResult> => {
  const resolvedLocaleConfig =
    localeConfig ??
    (nextConfig == null
      ? undefined
      : deriveRouteHandlerRuntimeSemantics(nextConfig).localeConfig);

  // Consumer entry into the runtime config-loading group. This stage is where
  // app-owned preparation may run before the actual target execution phase.
  const resolvedConfigs = await loadResolvedRouteHandlersConfigs({
    rootDir,
    localeConfig: resolvedLocaleConfig,
    routeHandlersConfig
  });
  return executeResolvedRouteHandlerNextPipeline({
    resolvedConfigs,
    mode
  });
};
