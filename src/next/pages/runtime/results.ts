import { buildRouteHandlerNextResultWithRuntimeHarness } from '../../shared/runtime/results';
import {
  groupHeavyRoutesForEmission,
  toRewriteHeavyPaths
} from '../../../core/handler-emission-grouping';

import type { RouteHandlerPipelineResult } from '../../../core/types';
import type { RouteHandlerNextResult } from '../../shared/types';
import type { ResolvedRouteHandlersConfig } from '../types';

/**
 * Build the Pages Router Next integration result for one resolved target.
 *
 * @remarks
 * Pages applies the build-only `K = 1` merge to rewrite destinations: every
 * locale of a merged group rewrites to the single locale-less destination its
 * merged handler is emitted at. The harness's returned `heavyPaths` (the
 * heavy-route lookup set) stay per-locale.
 *
 * @param config - Resolved Pages target config.
 * @param pipelineResult - Core pipeline result for the target.
 * @returns Next integration result for the target.
 */
export const buildRouteHandlerNextResult = (
  config: ResolvedRouteHandlersConfig,
  pipelineResult: RouteHandlerPipelineResult
): RouteHandlerNextResult =>
  buildRouteHandlerNextResultWithRuntimeHarness(
    config,
    pipelineResult,
    toRewriteHeavyPaths(
      groupHeavyRoutesForEmission(pipelineResult.heavyPaths, config.localeConfig)
    )
  );
