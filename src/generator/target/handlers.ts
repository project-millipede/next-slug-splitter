/**
 * Orchestrates route-handler file generation and writes emitted sources to disk.
 *
 * @remarks
 * This file stays outside the syntax-emission layer. Its responsibility is
 * path resolution, component-entry selection, factory import rewriting, and
 * file persistence. Generated source text continues to come from the renderer
 * layer.
 *
 * In the current phase-local architecture this module rebuilds one target's
 * handler output directory from the current heavy-route set:
 * 1. clear the target handlers directory
 * 2. render one page for each current heavy route
 * 3. write those rendered pages to disk
 *
 * This module does not decide whether a route is heavy. It assumes
 * `heavyRoutes` is already the final generation set for the target.
 */
import {
  clearRouteHandlerOutputDirectory,
  synchronizeRenderedRouteHandlerPage
} from '../protocol/output-lifecycle';
import { renderRouteHandlerPage } from '../protocol/rendered-page';

import type {
  DynamicRouteParam,
  EmitFormat,
  PlannedHeavyRoute,
  ResolvedRouteHandlerModuleReference,
  RouteHandlerPaths
} from '../../core/types';

/**
 * Emits one generated page per heavy route using the prepared route-local
 * component plans.
 *
 * @param input - Handler emission input for one target.
 * @returns A promise that resolves once all route-handler pages are written.
 */
export const emitRouteHandlerPages = async ({
  paths,
  heavyRoutes,
  emitFormat,
  baseStaticPropsImport,
  handlerRouteParam,
  routeBasePath
}: {
  /**
   * Filesystem paths for the target.
   */
  paths: RouteHandlerPaths;
  /**
   * Heavy routes selected for handler generation.
   */
  heavyRoutes: Array<PlannedHeavyRoute>;
  /**
   * Output format for generated files.
   */
  emitFormat: EmitFormat;
  /**
   * Resolved base static props module reference.
   */
  baseStaticPropsImport: ResolvedRouteHandlerModuleReference;
  /**
   * Dynamic route parameter descriptor for the handler page.
   */
  handlerRouteParam: DynamicRouteParam;
  /**
   * Base path for public routes in this target.
   */
  routeBasePath: string;
}): Promise<void> => {
  // Generate mode is intentionally phase-local and fresh. Clearing the target
  // handlers directory up front keeps build/generate independent from prior
  // dev artifacts before the current heavy-route set is written back to disk.
  await clearRouteHandlerOutputDirectory(paths.handlersDir);

  const renderedPages = [];

  for (const entry of heavyRoutes) {
    renderedPages.push(
      renderRouteHandlerPage({
        paths,
        heavyRoute: entry,
        emitFormat,
        baseStaticPropsImport,
        handlerRouteParam,
        routeBasePath
      })
    );
  }

  for (const page of renderedPages) {
    await synchronizeRenderedRouteHandlerPage({
      page
    });
  }
};
