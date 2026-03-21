/**
 * Executes one resolved route-handler target without cache reuse.
 *
 * @remarks
 * This module is narrow by design. It takes a fully resolved Next target
 * config, reuses cached per-file planning state when possible, and converts
 * the resulting core pipeline data into the Next-specific runtime result
 * shape. Cache policy and multi-target orchestration live in `index.ts`.
 *
 * This file is where two major cache groups meet for one target:
 * - the target-local incremental planning cache group
 * - the selective handler emission group
 *
 * Consumers never call those lower-level groups directly from application
 * code. Instead they call the runtime pipeline, and this module is the point
 * where the runtime hands one resolved target into those deeper layers.
 */
import { emitRouteHandlerPages } from '../../../generator/handlers';

import { buildIncrementalRouteHandlerPipelineResult } from './incremental-cache';
import { buildRouteHandlerNextResult } from '../results';

import type {
  PipelineMode,
  PlannedHeavyRoute,
  RouteHandlerPipelineResult
} from '../../../core/types';
import type {
  ResolvedRouteHandlersConfig,
  RouteHandlerNextResult
} from '../../types';

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
  // Consumer entry into the target-local incremental planning cache group.
  // This call is responsible for reusing per-file planned-route records when
  // the target's static identity is unchanged and only recomputing changed
  // route files.
  const coreResult: RouteHandlerPipelineResult =
    await buildIncrementalRouteHandlerPipelineResult(config);

  if (mode === 'generate') {
    let emitFormat = config.emitFormat;
    if (emitFormat == null) {
      emitFormat = 'ts';
    }

    // Consumer entry into the selective handler-emission group. By the time we
    // reach this call, planning is already complete and this layer decides
    // whether handler files can be skipped, rewritten, or removed based on the
    // emission manifest.
    await emitRouteHandlerPages({
      paths: config.paths,
      heavyRoutes: coreResult.heavyPaths as Array<PlannedHeavyRoute>,
      emitFormat,
      runtimeHandlerFactoryImportBase: config.runtimeHandlerFactoryImportBase,
      baseStaticPropsImport: config.baseStaticPropsImport,
      routeBasePath: config.routeBasePath
    });
  }

  return buildRouteHandlerNextResult({
    config,
    pipelineResult: coreResult
  });
};
