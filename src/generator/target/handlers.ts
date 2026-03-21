/**
 * Orchestrates route-handler file generation and writes emitted sources to disk.
 *
 * @remarks
 * This file stays outside the syntax-emission layer. Its responsibility is
 * path resolution, component-entry selection, factory import rewriting, and
 * file persistence. Generated source text continues to come from the renderer
 * layer.
 *
 * In the cache architecture this file is the bridge into the selective
 * emission group. It does not decide whether a route is heavy; that decision
 * already happened in the target-local incremental planning cache. Instead it
 * turns planned heavy routes into deterministic page outputs and then asks the
 * selective emission layer to synchronize those outputs to disk.
 */
import { renderRouteHandlerPage } from '../protocol/rendered-page';
import { syncEmittedHandlerPages } from './selective-emission';

import type {
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
  runtimeHandlerFactoryImportBase,
  baseStaticPropsImport,
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
   * Resolved runtime handler factory import base.
   */
  runtimeHandlerFactoryImportBase: ResolvedRouteHandlerModuleReference;
  /**
   * Resolved base static props module reference.
   */
  baseStaticPropsImport: ResolvedRouteHandlerModuleReference;
  /**
   * Base path for public routes in this target.
   */
  routeBasePath: string;
}): Promise<void> => {
  // Consumer entry into the render-and-sync side of generation. The caller has
  // already chosen the heavy routes, so this function's responsibility is to
  // derive stable emitted source text and output hashes for the emission layer.
  const renderedPages = [];

  for (const entry of heavyRoutes) {
    renderedPages.push(
      renderRouteHandlerPage({
        paths,
        heavyRoute: entry,
        emitFormat,
        runtimeHandlerFactoryImportBase,
        baseStaticPropsImport,
        routeBasePath
      })
    );
  }

  await syncEmittedHandlerPages({
    paths,
    pages: renderedPages
  });
};
