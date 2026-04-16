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
import { synchronizeRouteHandlerPhaseArtifacts } from '../phase-artifacts'
import type {
  LoadResolvedRouteHandlersConfigsInput
} from './config'

import type { PipelineMode } from '../../../core/types'
import type {
  ResolvedRouteHandlersConfigBase,
  RouteHandlerNextResult
} from '../types'

type RouteHandlerPhaseRuntimeConfig = Pick<
  ResolvedRouteHandlersConfigBase,
  'app' | 'paths'
>

/**
 * Input for executing the Next-integrated route-handler pipeline.
 */
export type ExecuteRouteHandlerNextPipelineInput<TConfig = unknown> =
  LoadResolvedRouteHandlersConfigsInput<TConfig> & {
    /**
     * Pipeline execution mode.
     */
    mode?: PipelineMode;
  }

/**
 * Execute the route-handler pipeline from pre-resolved configs.
 *
 * @param input - Already-resolved target configs plus runtime hooks.
 * @returns Per-target Next integration results.
 */
export const executeResolvedRouteHandlerNextPipelineWithRuntimeHarness = async <
  TResolvedConfig extends RouteHandlerPhaseRuntimeConfig,
  TResult extends RouteHandlerNextResult = RouteHandlerNextResult
>({
  resolvedConfigs,
  mode = 'generate',
  executeTarget
}: {
  /**
   * Already-resolved target configs.
   */
  resolvedConfigs: Array<TResolvedConfig>;
  /**
   * Pipeline execution mode.
   */
  mode?: PipelineMode;
  /**
   * Router-specific per-target executor.
   */
  executeTarget: (
    config: TResolvedConfig,
    mode: PipelineMode
  ) => Promise<TResult>;
}): Promise<Array<TResult>> => {
  if (mode === 'generate') {
    // Generate mode first establishes build ownership of emitted handlers and
    // other shared artifacts. That keeps build/generate independent from prior
    // dev-owned state before any target execution begins.
    await synchronizeRouteHandlerPhaseArtifacts(resolvedConfigs, 'build')
  }

  return Promise.all(
    resolvedConfigs.map(config => executeTarget(config, mode))
  )
}

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
export const executeRouteHandlerNextPipelineWithRuntimeHarness = async <
  TConfig,
  TResolvedConfig extends RouteHandlerPhaseRuntimeConfig,
  TResult extends RouteHandlerNextResult = RouteHandlerNextResult
>({
  rootDir,
  localeConfig,
  routeHandlersConfig,
  mode = 'generate',
  loadResolvedConfigs,
  executeTarget
}: ExecuteRouteHandlerNextPipelineInput<TConfig> & {
  /**
   * Router-specific resolved-config loader.
   */
  loadResolvedConfigs: (
    input: LoadResolvedRouteHandlersConfigsInput<TConfig>
  ) => Promise<Array<TResolvedConfig>>;
  /**
   * Router-specific per-target executor.
   */
  executeTarget: (
    config: TResolvedConfig,
    mode: PipelineMode
  ) => Promise<TResult>;
}): Promise<Array<TResult>> => {
  // Consumer entry into the runtime config-loading group. This stage is where
  // app-owned preparation may run before the actual target execution phase.
  const resolvedConfigs = await loadResolvedConfigs({
    rootDir,
    localeConfig,
    routeHandlersConfig
  })

  return executeResolvedRouteHandlerNextPipelineWithRuntimeHarness({
    resolvedConfigs,
    mode,
    executeTarget
  })
}
