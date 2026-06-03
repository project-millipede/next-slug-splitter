import {
  doesRouteHandlerOutputFileExist,
  synchronizeRenderedRouteHandlerPage,
  type RouteHandlerOutputSynchronizationStatus
} from '../../../generator/shared/protocol/output-lifecycle';
import {
  renderAppRouteHandlerPage,
  resolveRenderedAppHandlerPageLocation
} from '../../../generator/app/protocol/rendered-page';
import {
  renderRouteHandlerPage,
  resolveRenderedHandlerPageLocation
} from '../../../generator/pages/protocol/rendered-page';
import { isMultiLocaleConfig } from '../../../core/locale-config';

import type { RouteHandlerLazyHeavyAnalysisResult } from './types';

/**
 * Emit exactly one lazily analyzed heavy route to disk.
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
 *
 * @param analysisResult - One-file heavy-route analysis result.
 * @returns Synchronization status describing whether the emitted handler file
 * was unchanged, newly created, or updated in place.
 */
export const emitRouteHandlerLazySingleHandler = async (
  analysisResult: RouteHandlerLazyHeavyAnalysisResult
): Promise<RouteHandlerOutputSynchronizationStatus> => {
  // Pages and App gate their multi-locale shape on the same predicate, so
  // compute it once. This is correctness, not the build-only merge (which dev
  // never runs): a multi-locale handler must take its multi-locale shape in dev
  // and build alike — Pages under the optional-catch-all leaf, App by baking the
  // locale into handlerParams for loadPageProps.
  const isMultiLocale = isMultiLocaleConfig(analysisResult.config.localeConfig);

  const renderedPage =
    analysisResult.config.routerKind === 'app'
      ? renderAppRouteHandlerPage({
          paths: analysisResult.config.paths,
          heavyRoute: analysisResult.plannedHeavyRoute,
          emitFormat: analysisResult.config.emitFormat,
          routeContract: analysisResult.config.routeContract,
          handlerRouteParam: analysisResult.config.handlerRouteParam,
          routeBasePath: analysisResult.config.routeBasePath,
          routeModuleContract: analysisResult.config.routeModule,
          includeLocaleParam: isMultiLocale
        })
      : renderRouteHandlerPage({
          paths: analysisResult.config.paths,
          route: analysisResult.plannedHeavyRoute,
          handlerRelativePath: analysisResult.plannedHeavyRoute.handlerRelativePath,
          // Dev never merges, so a lazily emitted Pages handler is always a lone
          // per-locale route: it enumerates its own locale at L > 1 and stays a
          // concrete page at L = 1.
          getStaticPathsLocales: isMultiLocale
            ? [analysisResult.plannedHeavyRoute.locale]
            : [],
          emitFormat: analysisResult.config.emitFormat,
          routeContract: analysisResult.config.routeContract,
          handlerRouteParam: analysisResult.config.handlerRouteParam,
          routeBasePath: analysisResult.config.routeBasePath
        });

  return synchronizeRenderedRouteHandlerPage(renderedPage);
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
 * Stage 1 no longer uses this helper because cached Stage 1 hits still rerun
 * processor planning and synchronize one emitted handler file. This helper is
 * retained for the later Stage 2 fast path, where a cached processor-plan hit
 * plus an existing handler file can safely skip one-file synchronization.
 *
 * @param analysisResult - Cached heavy-route analysis result whose emitted
 * handler file should be checked.
 * @returns `true` when the emitted handler file currently exists on disk,
 * otherwise `false`.
 */
export const doesRouteHandlerLazySingleHandlerExist = async (
  analysisResult: RouteHandlerLazyHeavyAnalysisResult
): Promise<boolean> => {
  const { pageFilePath } =
    analysisResult.config.routerKind === 'app'
      ? resolveRenderedAppHandlerPageLocation(
          analysisResult.config.paths,
          analysisResult.config.emitFormat,
          analysisResult.plannedHeavyRoute.handlerRelativePath
        )
      : resolveRenderedHandlerPageLocation(
          analysisResult.config.paths,
          analysisResult.config.emitFormat,
          analysisResult.plannedHeavyRoute.handlerRelativePath,
          isMultiLocaleConfig(analysisResult.config.localeConfig)
        );

  return doesRouteHandlerOutputFileExist(pageFilePath);
};
