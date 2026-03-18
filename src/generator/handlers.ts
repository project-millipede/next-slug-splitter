/**
 * Orchestrates route-handler file generation and writes emitted sources to disk.
 *
 * @remarks
 * This file stays outside the syntax-emission layer. Its responsibility is
 * path resolution, component-entry selection, factory import rewriting, and
 * file persistence. Generated source text continues to come from the renderer
 * layer.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  appendModuleReferenceSubpath,
  toEmittedImportSpecifier
} from '../module-reference';
import {
  type PreparedHandlerRenderConfig,
  renderRouteHandlerModules
} from './render-modules';

import type {
  EmitFormat,
  PlannedHeavyRoute,
  ResolvedRouteHandlerModuleReference,
  RouteHandlerPaths
} from '../core/types';

/**
 * Ensures a directory exists before generated files are written into it.
 *
 * @param directoryPath - Absolute directory path to create.
 * @returns A promise that resolves once the directory exists.
 */
const ensureDirectory = async (directoryPath: string): Promise<void> => {
  await mkdir(directoryPath, { recursive: true });
};

/**
 * Clears and recreates the generated handlers directory.
 *
 * @param handlersDir - Absolute handlers directory path.
 * @returns A promise that resolves once the directory has been recreated.
 */
const clearGeneratedHandlers = async (handlersDir: string): Promise<void> => {
  await rm(handlersDir, { recursive: true, force: true });
  await ensureDirectory(handlersDir);
};

/**
 * Prepare the final render config for one emitted handler page.
 *
 * @param input Render-config preparation input.
 * @returns Fully prepared render config consumed by the renderer layer.
 */
const createPreparedHandlerRenderConfig = ({
  pageFilePath,
  emitFormat,
  routeBasePath,
  baseStaticPropsImport,
  runtimeHandlerFactoryImportBase,
  factoryVariant
}: {
  pageFilePath: string;
  emitFormat: EmitFormat;
  routeBasePath: string;
  baseStaticPropsImport: ResolvedRouteHandlerModuleReference;
  runtimeHandlerFactoryImportBase: ResolvedRouteHandlerModuleReference;
  factoryVariant: string;
}): PreparedHandlerRenderConfig => {
  const runtimeHandlerFactoryImport = toEmittedImportSpecifier({
    pageFilePath,
    reference: appendModuleReferenceSubpath(
      runtimeHandlerFactoryImportBase,
      factoryVariant
    )
  });

  return {
    pageFilePath,
    runtimeHandlerFactoryImport,
    baseStaticPropsImport: toEmittedImportSpecifier({
      pageFilePath,
      reference: baseStaticPropsImport
    }),
    routeBasePath,
    emitFormat
  };
};

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
  await clearGeneratedHandlers(paths.handlersDir);

  for (const entry of heavyRoutes) {
    const pageExtension = emitFormat === 'ts' ? 'tsx' : 'js';
    const pageFilePath = path.join(
      paths.handlersDir,
      `${entry.handlerRelativePath}.${pageExtension}`
    );
    const renderConfig = createPreparedHandlerRenderConfig({
      pageFilePath,
      emitFormat,
      routeBasePath,
      baseStaticPropsImport,
      runtimeHandlerFactoryImportBase,
      factoryVariant: entry.factoryVariant
    });

    const { pageSource } = renderRouteHandlerModules({
      locale: entry.locale,
      slugArray: entry.slugArray,
      handlerId: entry.handlerId,
      usedLoadableComponentKeys: entry.usedLoadableComponentKeys,
      selectedComponentEntries: entry.componentEntries,
      renderConfig
    });

    await ensureDirectory(path.dirname(pageFilePath));

    await writeFile(pageFilePath, pageSource, 'utf8');
  }
};
