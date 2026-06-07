import { hasGeneratedHandlersInAppLocaleSubtree } from '../generated-handlers/location';
import { buildRouteHandlerNextResultWithRuntimeHarness } from '../../shared/runtime/results';

import type { RouteHandlerPipelineResult } from '../../../core/types';
import type { RouteHandlerNextResult } from '../../shared/types';
import type { ResolvedRouteHandlersConfig } from '../types';

/**
 * Check whether one App target emits generated handlers below its physical
 * locale route segment.
 *
 * 1. Conventional generated output uses locale-less internal destinations.
 * 2. Locale-scoped generated output must keep the route locale at the front of
 *    the internal destination so Next resolves the matching layout subtree.
 *
 * @param config - Resolved App target config.
 * @returns `true` when generated-handler destinations need a route-locale
 * prefix.
 */
const hasLocaleScopedAppGeneratedHandlerDestinations = (
  config: ResolvedRouteHandlersConfig
): boolean =>
  hasGeneratedHandlersInAppLocaleSubtree(
    config.paths,
    config.app.localeRouteParamName
  );

export const buildRouteHandlerNextResult = (
  config: ResolvedRouteHandlersConfig,
  pipelineResult: RouteHandlerPipelineResult
): RouteHandlerNextResult =>
  buildRouteHandlerNextResultWithRuntimeHarness(config, pipelineResult, {
    generatedHandlersAreLocaleScoped:
      hasLocaleScopedAppGeneratedHandlerDestinations(config)
  });
