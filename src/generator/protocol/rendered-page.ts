/**
 * Shared one-page rendering helper for route-handler generation.
 *
 * @remarks
 * The library now has two emission paths:
 * - target-wide generation, which renders many heavy routes at once
 * - lazy dev-proxy emission, which renders exactly one heavy route on demand
 *
 * Both paths must produce byte-for-byte equivalent handler page output for the
 * same planned heavy route. Centralizing the "one planned route in, one
 * rendered page out" logic here avoids subtle drift between those two flows.
 */
import path from 'node:path';

import { hashSync, HashAlgorithm } from '@cacheable/utils';

import {
  appendModuleReferenceSubpath,
  toEmittedImportSpecifier
} from '../../module-reference';
import {
  type PreparedHandlerRenderConfig,
  renderRouteHandlerModules
} from './render-modules';

import type {
  EmitFormat,
  PlannedHeavyRoute,
  ResolvedRouteHandlerModuleReference,
  RouteHandlerPaths
} from '../../core/types';

/**
 * Fully rendered generated handler page ready for filesystem emission.
 */
export type RenderedHandlerPage = {
  /**
   * Path of the generated page relative to the target handlers directory.
   */
  relativePath: string;
  /**
   * Absolute filesystem path of the generated page.
   */
  pageFilePath: string;
  /**
   * Full emitted module source.
   */
  pageSource: string;
  /**
   * Stable output hash of the emitted source.
   */
  outputHash: string;
};

/**
 * Deterministic filesystem location of one emitted handler page.
 *
 * @remarks
 * This location calculation is shared by several protocol participants:
 * - the renderer, which needs to know where the page will be written
 * - lazy stale-output cleanup, which needs to know where the page would have
 *   been written even when there is no current heavy-route payload
 *
 * Keeping the path calculation centralized avoids drift between:
 * - "where would we emit this handler?"
 * - "which file should we remove when that handler is no longer needed?"
 */
export type RenderedHandlerPageLocation = {
  /**
   * Path of the emitted page relative to the target handlers directory.
   */
  relativePath: string;
  /**
   * Absolute filesystem path of the emitted page.
   */
  pageFilePath: string;
};

/**
 * Resolve the deterministic output location for one emitted handler page.
 *
 * @param input - Output-location input.
 * @param input.paths - Target filesystem paths.
 * @param input.emitFormat - Output format for generated files.
 * @param input.handlerRelativePath - Handler-relative path without extension.
 * @returns Output location for the emitted page.
 */
export const resolveRenderedHandlerPageLocation = ({
  paths,
  emitFormat,
  handlerRelativePath
}: {
  paths: Pick<RouteHandlerPaths, 'handlersDir'>;
  emitFormat: EmitFormat;
  handlerRelativePath: string;
}): RenderedHandlerPageLocation => {
  const pageExtension = emitFormat === 'ts' ? 'tsx' : 'js';
  const pageFilePath = path.join(
    paths.handlersDir,
    `${handlerRelativePath}.${pageExtension}`
  );

  return {
    relativePath: path.relative(paths.handlersDir, pageFilePath),
    pageFilePath
  };
};

/**
 * Prepare the final render config for one emitted handler page.
 *
 * @param input - Render-config preparation input.
 * @returns Fully prepared render config consumed by the renderer layer.
 *
 * @remarks
 * This helper translates resolved module references into the exact import
 * specifiers that will be written into the generated file. Both the target-wide
 * and lazy one-file emitters must perform that translation identically.
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
 * Render one planned heavy route into the emitted handler-page artifact that
 * can later be synchronized to disk.
 *
 * @param input - One-page render input.
 * @param input.paths - Target filesystem paths.
 * @param input.heavyRoute - Planned heavy route to render.
 * @param input.emitFormat - Output format for generated files.
 * @param input.runtimeHandlerFactoryImportBase - Resolved runtime factory import base.
 * @param input.baseStaticPropsImport - Resolved base static props import.
 * @param input.routeBasePath - Public route base path for the target.
 * @returns Fully rendered handler page artifact.
 */
export const renderRouteHandlerPage = ({
  paths,
  heavyRoute,
  emitFormat,
  runtimeHandlerFactoryImportBase,
  baseStaticPropsImport,
  routeBasePath
}: {
  paths: RouteHandlerPaths;
  heavyRoute: PlannedHeavyRoute;
  emitFormat: EmitFormat;
  runtimeHandlerFactoryImportBase: ResolvedRouteHandlerModuleReference;
  baseStaticPropsImport: ResolvedRouteHandlerModuleReference;
  routeBasePath: string;
}): RenderedHandlerPage => {
  const { relativePath, pageFilePath } = resolveRenderedHandlerPageLocation({
    paths,
    emitFormat,
    handlerRelativePath: heavyRoute.handlerRelativePath
  });
  const renderConfig = createPreparedHandlerRenderConfig({
    pageFilePath,
    emitFormat,
    routeBasePath,
    baseStaticPropsImport,
    runtimeHandlerFactoryImportBase,
    factoryVariant: heavyRoute.factoryVariant
  });

  const { pageSource } = renderRouteHandlerModules({
    locale: heavyRoute.locale,
    slugArray: heavyRoute.slugArray,
    handlerId: heavyRoute.handlerId,
    usedLoadableComponentKeys: heavyRoute.usedLoadableComponentKeys,
    selectedComponentEntries: heavyRoute.componentEntries,
    renderConfig
  });

  return {
    relativePath,
    pageFilePath,
    pageSource,
    outputHash: hashSync(pageSource, {
      algorithm: HashAlgorithm.DJB2
    })
  };
};
