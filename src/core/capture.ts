import type { PluggableList } from 'unified';

import {
  buildResolvedComponentGraph,
  recmaCapture,
  type CapturedModule
} from 'recma-component-resolver';

import { runRouteCaptureBuild } from './capture-build';
import type { RouteHandlerMdxCompileOptions } from './types';

/**
 * Capture the component names referenced by one content source file.
 *
 * @param input - Capture input.
 * @returns Component names referenced by the compiled document.
 *
 * @remarks
 * This is a thin orchestration layer around the shared capture plugin contract.
 * The underlying recma plugin reports module captures, then the shared
 * component-graph builder derives the final referenced component set.
 */
export const captureReferencedComponentNames = async ({
  filePath,
  mdxCompileOptions
}: {
  /**
   * Absolute path to the content source file being analyzed.
   */
  filePath: string;
  /**
   * MDX compile plugins forwarded into the capture build.
   */
  mdxCompileOptions?: RouteHandlerMdxCompileOptions;
}): Promise<Array<string>> => {
  const capturedModules = new Map<string, CapturedModule>();

  /**
   * Cache the latest capture payload per module id.
   *
   * @param payload - Captured module payload emitted by the recma plugin.
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

  return resolvedComponentGraph.usedComponentNames;
};
