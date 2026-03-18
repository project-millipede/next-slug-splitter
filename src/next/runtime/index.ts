/**
 * Orchestrates the Next-facing route-handler runtime.
 *
 * @remarks
 * This file is the top-level coordinator for the Next integration layer. It
 * decides whether to reuse cached pipeline state or execute a fresh target
 * run, and it owns the single-target vs multi-target control flow.
 *
 * The runtime subsystem is split into smaller modules so each one has a narrow
 * responsibility:
 *
 * - `config.ts`
 *   Loads the Next config and resolves every configured target into the fully
 *   resolved runtime shape consumed by the Next integration layer.
 * - `cache.ts`
 *   Implements the identity-only persistent cache read/write policy. This is
 *   where cache freshness is checked and persisted, without re-reading emitted
 *   handler files from disk.
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
 * Determine whether the current pipeline mode may reuse persistent cache state.
 *
 * @param input - Cache policy input.
 * @returns `true` when persistent cache reuse is allowed for the mode.
 */
const canUsePersistentCache = ({ mode }: { mode: PipelineMode }): boolean =>
  mode === 'generate';

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
  const emitFormat = resolveSharedEmitFormat({
    configs: resolvedConfigs,
    createError: createRuntimeError
  });

  if (resolvedConfigs.length > 1) {
    const [referenceResolvedTarget] = resolvedConfigs;
    const cachePath = resolvePersistentCachePath({
      rootDir: referenceResolvedTarget.app.rootDir
    });
    const fingerprint = await computePipelineFingerprintForConfigs({
      configs: resolvedConfigs,
      mode
    });

    if (canUsePersistentCache({ mode })) {
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
        executeRouteHandlerTarget({
          config,
          mode
        })
      )
    );
    const result = mergeRouteHandlerNextResults({
      results: freshResults
    });

    if (canUsePersistentCache({ mode })) {
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

  if (!canUsePersistentCache({ mode })) {
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
  const cachedResult = await readReusablePipelineCacheResult({
    cachePath,
    fingerprint,
    emitFormat
  });

  if (cachedResult) {
    return cachedResult;
  }

  /**
   * Single-target cache reuse follows the same identity-only rule as the
   * multi-target path.
   *
   * @remarks
   * Generated handler files are not read from disk here. A matching
   * fingerprint is the only freshness contract for runtime-side cache reuse.
   */
  const result = await executeRouteHandlerTarget({
    config: singleResolvedTarget,
    mode
  });

  await writePipelineCacheResult({
    cachePath,
    fingerprint,
    emitFormat,
    result
  });

  return result;
};

/**
 * Execute the full Next-integrated route-handler pipeline.
 *
 * @param input - Pipeline execution input.
 * @returns The merged Next integration result for the configured targets.
 *
 * @remarks
 * This module stays orchestration-focused. Config loading, fresh execution,
 * cache reuse, and result shaping live in dedicated helpers.
 */
export const executeRouteHandlerNextPipeline = async ({
  rootDir,
  nextConfigPath,
  nextConfig,
  routeHandlersConfig,
  mode = 'generate'
}: ExecuteRouteHandlerNextPipelineInput = {}): Promise<RouteHandlerNextResult> => {
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
