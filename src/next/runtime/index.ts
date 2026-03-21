/**
 * Orchestrates the Next-facing route-handler runtime.
 *
 * @remarks
 * This file is the top-level coordinator for the Next integration layer. It
 * decides how the shared persistent cache participates in execution, and it
 * owns the single-target vs multi-target control flow.
 *
 * The runtime subsystem is split into smaller modules so each one has a narrow
 * responsibility:
 *
 * - `config.ts`
 *   Loads the Next config and resolves every configured target into the fully
 *   resolved runtime shape consumed by the Next integration layer.
 * - `cache.ts`
 *   Reads and writes the shared persistent cache record.
 * - `persistent-cache-policy.ts`
 *   Decides whether that shared cache may bypass target execution or is only
 *   written after execution completes.
 * - `target.ts`
 *   Executes one resolved target with no cache reuse and adapts the core
 *   pipeline result into the Next-specific result shape.
 * - `results.ts`
 *   Shapes target-local results and merges them back into the shared
 *   multi-target result stored in cache.
 *
 * Keeping those concerns separate makes this file read as orchestration rather
 * than as a mixture of config loading, cache internals, and result-shaping
 * details.
 *
 * This is also the most useful place to understand which cache group a
 * consumer is touching:
 * - callers entering `executeRouteHandlerNextPipeline()` are entering the
 *   top-level runtime orchestration group
 * - that orchestration group consults the shared persistent-cache policy group
 * - it then delegates to the per-target incremental planning cache group
 * - and, in generate mode, the target path later enters the selective handler
 *   emission group
 */
import { createRuntimeError } from '../../utils/errors';
import {
  computePipelineFingerprint,
  computePipelineFingerprintForConfigs,
  resolvePersistentCachePath
} from '../cache';
import { type NextConfigLike } from '../config/index';
import { resolveSharedEmitFormat } from '../emit-format';
import {
  readReusablePipelineCacheResult,
  writePipelineCacheResult
} from './cache';
import {
  loadResolvedRouteHandlersConfigs,
  type LoadResolvedRouteHandlersConfigsInput
} from './config';
import { resolvePersistentCacheExecutionPolicy } from './persistent-cache-policy';
import { mergeRouteHandlerNextResults } from './results';
import { executeRouteHandlerTarget } from './target';

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
  // Consumer entry into the runtime orchestration group. At this point the
  // caller has already chosen to execute the Next-facing pipeline, and this
  // module decides which deeper cache groups are allowed to participate.
  const emitFormat = resolveSharedEmitFormat({
    configs: resolvedConfigs,
    createError: createRuntimeError
  });
  // This is the hand-off into the shared persistent-cache policy group. The
  // returned policy answers one precise question: may the shared cache record
  // answer immediately, or may it only be refreshed after target execution?
  const persistentCachePolicy = resolvePersistentCacheExecutionPolicy({
    mode
  });

  if (resolvedConfigs.length > 1) {
    const [referenceResolvedTarget] = resolvedConfigs;
    let cachePath: string | undefined;
    let fingerprint: string | undefined;

    if (
      persistentCachePolicy.readResultBeforeTargetExecution ||
      persistentCachePolicy.writeResultAfterTargetExecution
    ) {
      // This call belongs to the shared persistent runtime-cache group. Even
      // when generate mode is not allowed to return early, we still need the
      // shared cache location and fingerprint so the merged result can be
      // written back after target execution completes.
      cachePath = resolvePersistentCachePath({
        rootDir: referenceResolvedTarget.app.rootDir
      });
      fingerprint = await computePipelineFingerprintForConfigs({
        configs: resolvedConfigs,
        mode
      });
    }

    if (
      persistentCachePolicy.readResultBeforeTargetExecution &&
      cachePath &&
      fingerprint
    ) {
      // This is the only place where the orchestrator would allow the shared
      // cache group to bypass target execution. The policy currently prevents
      // that in generate mode so target-local planning reuse and emission sync
      // still get a chance to run.
      const cachedResult = await readReusablePipelineCacheResult({
        cachePath,
        fingerprint,
        emitFormat
      });
      if (cachedResult) {
        return cachedResult;
      }
    }

    const freshResults = await Promise.all(
      resolvedConfigs.map(config =>
        // Consumer hand-off from the orchestration group into the per-target
        // execution group. Each target execution may reuse the target-local
        // incremental planning cache and, in generate mode, the selective
        // emission group.
        executeRouteHandlerTarget({
          config,
          mode
        })
      )
    );
    const result = mergeRouteHandlerNextResults({
      results: freshResults
    });

    if (
      persistentCachePolicy.writeResultAfterTargetExecution &&
      cachePath &&
      fingerprint
    ) {
      // The shared persistent cache is refreshed only after the deeper cache
      // groups have done their work. This keeps the shared record as the
      // lookup artifact without letting it hide stale emitted files.
      await writePipelineCacheResult({
        cachePath,
        fingerprint,
        emitFormat,
        result
      });
    }

    return result;
  }

  const [singleResolvedTarget] = resolvedConfigs;

  if (
    !persistentCachePolicy.readResultBeforeTargetExecution &&
    !persistentCachePolicy.writeResultAfterTargetExecution
  ) {
    // Analyze mode reaches the target execution group directly. There is no
    // participation from the shared persistent-cache group in this branch.
    return executeRouteHandlerTarget({
      config: singleResolvedTarget,
      mode
    });
  }

  const cachePath = resolvePersistentCachePath({
    rootDir: singleResolvedTarget.paths.rootDir
  });
  const fingerprint = await computePipelineFingerprint({
    config: singleResolvedTarget,
    mode
  });

  if (persistentCachePolicy.readResultBeforeTargetExecution) {
    // Single-target early return would happen here if the policy allowed it.
    // Keeping this branch explicit makes the difference between "cache file
    // exists" and "cache file may skip execution" obvious to future readers.
    const cachedResult = await readReusablePipelineCacheResult({
      cachePath,
      fingerprint,
      emitFormat
    });

    if (cachedResult) {
      return cachedResult;
    }
  }

  /**
   * Single-target generate runs always execute the target path so incremental
   * planning and selective emission can resync generated handler files before
   * the shared persistent cache record is refreshed.
   *
   * @remarks
   * The shared persistent cache remains the lookup-facing artifact, but it is
   * not allowed to bypass target execution in generate mode.
   */
  const result = await executeRouteHandlerTarget({
    config: singleResolvedTarget,
    mode
  });

  if (persistentCachePolicy.writeResultAfterTargetExecution) {
    await writePipelineCacheResult({
      cachePath,
      fingerprint,
      emitFormat,
      result
    });
  }

  return result;
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
 * calling this function is the top-level entry into the runtime cache system.
 * From here the call chain can traverse, in order:
 * - preparation caching while config is being loaded
 * - shared runtime-cache policy
 * - target-local incremental planning cache
 * - selective emission in generate mode
 */
export const executeRouteHandlerNextPipeline = async ({
  rootDir,
  nextConfigPath,
  nextConfig,
  routeHandlersConfig,
  mode = 'generate'
}: ExecuteRouteHandlerNextPipelineInput = {}): Promise<RouteHandlerNextResult> => {
  // Consumer entry into the runtime config-loading group. This stage is where
  // preparation caching may run before the actual target execution phase.
  const resolvedConfigs = await loadResolvedRouteHandlersConfigs({
    rootDir,
    nextConfigPath,
    nextConfig,
    routeHandlersConfig
  });
  return executeResolvedRouteHandlerNextPipeline({
    resolvedConfigs,
    mode
  });
};
