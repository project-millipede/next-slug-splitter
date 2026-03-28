import {
  doesRouteHandlerOutputFileExist,
  synchronizeRenderedRouteHandlerPage,
  type RenderedHandlerPageSynchronizationStatus
} from '../../../generator/output-lifecycle';
import {
  renderRouteHandlerPage,
  resolveRenderedHandlerPageLocation
} from '../../../generator/rendered-page';

import type {
  RenderedHandlerPage
} from '../../../generator/rendered-page';
import type { RouteHandlerLazySingleRouteAnalysisResult } from './types';

/**
 * Result of synchronizing one lazily emitted handler page to disk.
 */
export type RouteHandlerLazySingleRouteEmissionResult = {
  /**
   * Whether the file had to be written or was already current on disk.
   */
  status: RenderedHandlerPageSynchronizationStatus;
  /**
   * Fully rendered emitted page artifact.
   */
  renderedPage: RenderedHandlerPage;
};

/**
 * Emit exactly one lazily analyzed heavy route to disk.
 *
 * @param input - Emission input.
 * @param input.analysisResult - One-file heavy-route analysis result.
 * @returns Synchronization result for the single emitted page.
 *
 * @remarks
 * This module is intentionally different from the target-wide selective
 * emission subsystem:
 * - target-wide emission reconciles the full desired handler directory
 * - lazy single-route emission only guarantees that one requested heavy route
 *   exists and is current on disk
 *
 * That means this module never deletes other generated handlers. Its job is
 * strictly "ensure this one heavy route's handler file is ready right now."
 */
export const emitRouteHandlerLazySingleHandler = async ({
  analysisResult
}: {
  analysisResult: Extract<
    RouteHandlerLazySingleRouteAnalysisResult,
    {
      kind: 'heavy';
    }
  >;
}): Promise<RouteHandlerLazySingleRouteEmissionResult> => {
  const renderedPage = renderRouteHandlerPage({
    paths: analysisResult.config.paths,
    heavyRoute: analysisResult.plannedHeavyRoute,
    emitFormat: analysisResult.config.emitFormat,
    baseStaticPropsImport: analysisResult.config.baseStaticPropsImport,
    handlerRouteParam: analysisResult.config.handlerRouteParam,
    routeBasePath: analysisResult.config.routeBasePath
  });
  const status = await synchronizeRenderedRouteHandlerPage({
    page: renderedPage
  });

  return {
    status,
    renderedPage
  };
};

/**
 * Check whether a cached heavy route still has its emitted handler file.
 *
 * @remarks
 * This helper does not decide whether a route is heavy. That decision already
 * came from the lazy one-file cache or from fresh one-file analysis.
 *
 * Its job is narrower:
 * 1. derive the expected emitted handler file path from `analysisResult`
 * 2. check whether that file currently exists on disk
 *
 * The caller combines this filesystem check with plan reuse from cached heavy
 * analysis. Emission may be skipped only when both are true:
 * - analysis says the route is already known to be heavy
 * - the corresponding emitted handler file still exists on disk
 *
 * @param analysisResult - Cached heavy-route analysis result whose emitted
 * handler file should be checked.
 * @returns `true` when the emitted handler file currently exists on disk,
 * otherwise `false`.
 */
export const doesRouteHandlerLazySingleHandlerExist = async (
  analysisResult: Extract<
    RouteHandlerLazySingleRouteAnalysisResult,
    {
      kind: 'heavy';
    }
  >
): Promise<boolean> => {
  const { pageFilePath } = resolveRenderedHandlerPageLocation({
    paths: analysisResult.config.paths,
    emitFormat: analysisResult.config.emitFormat,
    handlerRelativePath: analysisResult.plannedHeavyRoute.handlerRelativePath
  });

  return doesRouteHandlerOutputFileExist(pageFilePath);
};
