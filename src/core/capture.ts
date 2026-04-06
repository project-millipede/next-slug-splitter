import type { PluggableList } from 'unified';

import {
  buildResolvedComponentGraph,
  recmaCapture,
  type CapturedModule
} from 'recma-component-resolver';

import { runRouteCaptureBuild } from './capture-build';
import type { RouteHandlerMdxCompileOptions } from './types';

/**
 * Reachable MDX capture facts for one root content source file.
 *
 * @remarks
 * `transitiveModulePaths` intentionally excludes the root entry file. The
 * root file is always known separately as `routePath.filePath`, so downstream
 * Stage 1 cache validity checks must validate the root file first and then
 * validate each persisted transitive module path.
 */
export type RouteHandlerComponentGraphCaptureResult = {
  /**
   * Component names reachable from the captured MDX graph.
   */
  usedComponentNames: Array<string>;
  /**
   * Non-root reachable MDX module paths discovered during capture.
   */
  transitiveModulePaths: Array<string>;
};

/**
 * Collect the non-root reachable MDX module paths captured for one route.
 *
 * @remarks
 * This helper intentionally reuses the existing capture graph emitted by
 * `recmaCapture`. It does not introduce a second import walker or separate
 * dependency-discovery pass.
 *
 * @param entryFilePath - Absolute path to the root content source file.
 * @param capturedModules - Captured MDX modules keyed by module id.
 * @returns Non-root transitive module paths discovered during capture.
 */
const collectTransitiveCapturedModulePaths = (
  entryFilePath: string,
  capturedModules: ReadonlyMap<string, CapturedModule>
): Array<string> =>
  Array.from(capturedModules.keys()).filter(
    capturedModulePath => capturedModulePath !== entryFilePath
  );

/**
 * Capture the reachable MDX component graph for one content source file.
 *
 * @remarks
 * This is the single capture seam used by both full-pipeline analysis and the
 * Stage 1 lazy single-route cache. The underlying recma plugin reports module
 * captures, then the shared component-graph builder derives the final
 * referenced component set from that same captured graph.
 *
 * @param filePath - Absolute path to the root content source file being
 * analyzed.
 * @param mdxCompileOptions - MDX compile plugins forwarded into the capture
 * build.
 * @returns Reachable component names plus non-root transitive MDX module
 * paths discovered during the current capture build.
 */
export const captureRouteHandlerComponentGraph = async (
  filePath: string,
  mdxCompileOptions?: RouteHandlerMdxCompileOptions
): Promise<RouteHandlerComponentGraphCaptureResult> => {
  const capturedModules = new Map<string, CapturedModule>();

  /**
   * Cache the latest capture payload per module id.
   *
   * @param payload - Captured module payload emitted by the recma plugin.
   * @returns `void` after the module payload has been recorded.
   */
  const onModuleCapture = (payload: CapturedModule): void => {
    capturedModules.set(payload.moduleId, payload);
  };

  const remarkPlugins: PluggableList = mdxCompileOptions?.remarkPlugins ?? [];
  const externalRecmaPlugins: PluggableList =
    mdxCompileOptions?.recmaPlugins ?? [];
  const recmaPlugins: PluggableList = [
    ...externalRecmaPlugins,
    [recmaCapture, { onModuleCapture }]
  ];

  await runRouteCaptureBuild({
    filePath,
    remarkPlugins,
    recmaPlugins
  });

  const resolvedComponentGraph = buildResolvedComponentGraph(
    filePath,
    Object.fromEntries(capturedModules)
  );

  return {
    usedComponentNames: resolvedComponentGraph.usedComponentNames,
    transitiveModulePaths: collectTransitiveCapturedModulePaths(
      filePath,
      capturedModules
    )
  };
};
