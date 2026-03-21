import {
  synchronizeRenderedRouteHandlerPage,
  type RenderedHandlerPageSynchronizationStatus
} from '../../../generator/output-lifecycle';
import { renderRouteHandlerPage } from '../../../generator/rendered-page';

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
    runtimeHandlerFactoryImportBase:
      analysisResult.config.runtimeHandlerFactoryImportBase,
    baseStaticPropsImport: analysisResult.config.baseStaticPropsImport,
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
