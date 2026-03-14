/**
 * Orchestrates route-handler file generation and writes emitted sources to disk.
 *
 * @remarks
 * This file stays outside the syntax-emission layer. Its responsibility is
 * path resolution, registry selection, import path rewriting, and file
 * persistence. Generated source text continues to come from the renderer
 * layer.
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import {
  appendModuleReferenceSubpath,
  toEmittedImportSpecifier
} from '../module-reference';
import {
  buildHandlerNestedDependencyMap,
  expandLoadableKeyClosure,
  type PreparedHandlerRenderConfig,
  renderRouteHandlerModules
} from './render-modules';

import type {
  EmitFormat,
  HeavyRouteCandidate,
  NestedExpansionMap,
  RegistryEntry,
  RegistrySnapshot,
  ResolvedRouteHandlerModuleReference,
  RouteHandlerPaths
} from '../core/types';
import { createGeneratorError } from '../utils/errors';
import {
  isNonEmptyArray,
  isNonEmptyString
} from '../utils/type-guards-extended';

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
 * Resolve the handler factory variant for one generated page.
 *
 * @param input Variant-resolution input.
 * @returns Non-empty variant name selected for the handler.
 */
const resolveHandlerFactoryVariantName = ({
  selectedRegistryEntries,
  resolveHandlerFactoryVariant
}: {
  selectedRegistryEntries: Array<RegistryEntry>;
  resolveHandlerFactoryVariant: (entries: Array<RegistryEntry>) => string;
}): string => {
  const handlerFactoryVariant = resolveHandlerFactoryVariant(
    selectedRegistryEntries
  );
  if (!isNonEmptyString(handlerFactoryVariant)) {
    throw createGeneratorError(
      'resolveHandlerFactoryVariant must return a non-empty string.'
    );
  }

  return handlerFactoryVariant;
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
  selectedRegistryEntries,
  resolveHandlerFactoryVariant
}: {
  pageFilePath: string;
  emitFormat: EmitFormat;
  routeBasePath: string;
  baseStaticPropsImport: ResolvedRouteHandlerModuleReference;
  runtimeHandlerFactoryImportBase: ResolvedRouteHandlerModuleReference;
  selectedRegistryEntries: Array<RegistryEntry>;
  resolveHandlerFactoryVariant: (entries: Array<RegistryEntry>) => string;
}): PreparedHandlerRenderConfig => {
  const handlerFactoryVariant = resolveHandlerFactoryVariantName({
    selectedRegistryEntries,
    resolveHandlerFactoryVariant
  });
  const runtimeHandlerFactoryImport = toEmittedImportSpecifier({
    pageFilePath,
    reference: appendModuleReferenceSubpath(
      runtimeHandlerFactoryImportBase,
      handlerFactoryVariant
    )
  });

  return {
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
 * Emits one generated page per heavy route using the prepared registry and
 * route planning result.
 *
 * @param input - Handler emission input for one target.
 * @returns A promise that resolves once all route-handler pages are written.
 */
export const emitRouteHandlerPages = async ({
  paths,
  heavyRoutes,
  registry,
  nestedDependencyMap,
  emitFormat,
  resolveHandlerFactoryVariant,
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
  heavyRoutes: Array<HeavyRouteCandidate>;
  /**
   * Registry snapshot used for component resolution.
   */
  registry: RegistrySnapshot;
  /**
   * Nested dependency map for loadable components.
   */
  nestedDependencyMap: NestedExpansionMap;
  /**
   * Output format for generated files.
   */
  emitFormat: EmitFormat;
  /**
   * Function that selects the handler factory variant.
   */
  resolveHandlerFactoryVariant: (entries: Array<RegistryEntry>) => string;
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
    const handlerLoadableKeys = expandLoadableKeyClosure({
      baseLoadableKeys: entry.usedLoadableComponentKeys,
      nestedDependencyMap,
      availableLoadableKeys: registry.loadableKeys
    });

    const selectedRegistryEntries = handlerLoadableKeys
      .map(key => registry.entriesByKey.get(key))
      .filter((value): value is RegistryEntry => Boolean(value));

    if (!isNonEmptyArray(selectedRegistryEntries)) {
      throw createGeneratorError(
        `Handler ${entry.handlerId} has zero selected registry entries.`
      );
    }

    const handlerNestedDependencyMap = buildHandlerNestedDependencyMap({
      handlerLoadableKeys,
      nestedDependencyMap
    });

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
      selectedRegistryEntries,
      resolveHandlerFactoryVariant
    });

    const { pageSource } = renderRouteHandlerModules({
      locale: entry.locale,
      slugArray: entry.slugArray,
      handlerId: entry.handlerId,
      usedLoadableComponentKeys: entry.usedLoadableComponentKeys,
      selectedRegistryEntries,
      nestedDependencyMap: handlerNestedDependencyMap,
      renderConfig
    });

    await ensureDirectory(path.dirname(pageFilePath));

    await writeFile(pageFilePath, pageSource, 'utf8');
  }
};
