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

import { toEmittedImportSpecifier } from '../../../module-reference';
import { HANDLER_CATCHALL_PARAM } from '../../../next/pages/handler-static-props';
import {
  renderRouteHandlerModules,
  type PreparedHandlerRenderConfig
} from './render-modules';

import type {
  DynamicRouteParam,
  EmitFormat,
  PlannedHeavyRoute,
  ResolvedRouteHandlerModuleReference,
  RouteHandlerPaths
} from '../../../core/types';

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
 * @param paths - Target filesystem paths.
 * @param emitFormat - Output format for generated files.
 * @param handlerRelativePath - Handler-relative path without extension.
 * @returns Output location for the emitted page.
 */
export const resolveRenderedHandlerPageLocation = (
  paths: Pick<RouteHandlerPaths, 'generatedDir'>,
  emitFormat: EmitFormat,
  handlerRelativePath: string,
  useDynamicLeaf: boolean
): RenderedHandlerPageLocation => {
  const pageExtension = emitFormat === 'ts' ? 'tsx' : 'js';
  // At L > 1 the handler moves under an optional catch-all leaf so it can
  // export `getStaticPaths` and pin its locale. `handlerRelativePath` itself
  // stays the route-resolving directory (e.g. `interactive/en`), so rewrites
  // are unaffected; the leaf resolves that same base via its empty match. At
  // L = 1 the concrete single-locale page is kept.
  const leafRelativePath = useDynamicLeaf
    ? `${handlerRelativePath}/[[...${HANDLER_CATCHALL_PARAM}]]`
    : handlerRelativePath;
  const pageFilePath = path.join(
    paths.generatedDir,
    `${leafRelativePath}.${pageExtension}`
  );

  return {
    relativePath: path.relative(paths.generatedDir, pageFilePath),
    pageFilePath
  };
};

/**
 * Fields shared by every Pages handler-emission entry point: where the page is
 * written, how it is formatted, and the route identity it serves.
 */
export type RouteHandlerEmitBase = {
  /** Target filesystem paths. */
  paths: RouteHandlerPaths;
  /** Output format for generated files. */
  emitFormat: EmitFormat;
  /** Resolved Pages route contract import (the catch-all the handler delegates to). */
  routeContract: ResolvedRouteHandlerModuleReference;
  /** Dynamic route-param descriptor for the handler page. */
  handlerRouteParam: DynamicRouteParam;
  /** Public route base path for the target. */
  routeBasePath: string;
};

/** Input for {@link renderRouteHandlerPage}. */
type RenderRouteHandlerPageInput = RouteHandlerEmitBase & {
  /** Planned heavy route to render. */
  heavyRoute: PlannedHeavyRoute;
  /**
   * When `true`, emit under the optional catch-all leaf (`[[...rest]]`) and pin
   * the route's locale via `getStaticPaths`; when `false`, emit the concrete
   * single-locale page.
   */
  useDynamicLeaf: boolean;
};

/** Input for {@link renderMergedRouteHandlerPage}. */
type RenderMergedRouteHandlerPageInput = RouteHandlerEmitBase & {
  /**
   * Representative planned heavy route for the group; its component payload is
   * shared by every owned locale.
   */
  route: PlannedHeavyRoute;
  /** Every locale the merged handler owns. */
  locales: Array<string>;
  /** Locale-less handler-relative path (the merged emit/rewrite destination). */
  handlerRelativePath: string;
};

/** Input for {@link createPreparedHandlerRenderConfig}. */
type PrepareHandlerRenderConfigInput = {
  /** Absolute path the page is written to; import specifiers are relative to it. */
  pageFilePath: string;
  /** Output format for the generated file. */
  emitFormat: EmitFormat;
  /** Public route base path for the target. */
  routeBasePath: string;
  /** Resolved source route contract module reference. */
  routeContract: ResolvedRouteHandlerModuleReference;
  /** Resolved runtime handler-factory module reference. */
  factoryImport: ResolvedRouteHandlerModuleReference;
  /** Dynamic route-param descriptor for the handler page. */
  handlerRouteParam: DynamicRouteParam;
  /** Locales to enumerate in `getStaticPaths` (empty → a concrete page). */
  getStaticPathsLocales: Array<string>;
};

/**
 * Prepare the final render config for one emitted handler page.
 *
 * @remarks
 * Translates resolved module references into the exact import specifiers
 * written into the generated file, so the target-wide and lazy one-file
 * emitters produce identical imports.
 *
 * @param input - Render-config preparation input.
 * @returns Fully prepared render config consumed by the renderer layer.
 */
const createPreparedHandlerRenderConfig = ({
  pageFilePath,
  emitFormat,
  routeBasePath,
  routeContract,
  factoryImport,
  handlerRouteParam,
  getStaticPathsLocales
}: PrepareHandlerRenderConfigInput): PreparedHandlerRenderConfig => {
  return {
    pageFilePath,
    runtimeHandlerFactoryImport: toEmittedImportSpecifier(
      pageFilePath,
      factoryImport
    ),
    routeContract: toEmittedImportSpecifier(pageFilePath, routeContract),
    handlerRouteParam,
    routeBasePath,
    emitFormat,
    getStaticPathsLocales
  };
};

/**
 * Render one planned heavy route into the emitted handler-page artifact that
 * can later be synchronized to disk. Shared by the eager target emitter (for
 * `single` units) and the lazy dev/proxy single-file emitter.
 *
 * @param input - One-page render input.
 * @returns Fully rendered handler page artifact.
 */
export const renderRouteHandlerPage = ({
  paths,
  heavyRoute,
  emitFormat,
  routeContract,
  handlerRouteParam,
  routeBasePath,
  useDynamicLeaf
}: RenderRouteHandlerPageInput): RenderedHandlerPage => {
  const { relativePath, pageFilePath } = resolveRenderedHandlerPageLocation(
    paths,
    emitFormat,
    heavyRoute.handlerRelativePath,
    useDynamicLeaf
  );
  const renderConfig = createPreparedHandlerRenderConfig({
    pageFilePath,
    emitFormat,
    routeBasePath,
    routeContract,
    factoryImport: heavyRoute.factoryImport,
    handlerRouteParam,
    getStaticPathsLocales: useDynamicLeaf ? [heavyRoute.locale] : []
  });

  const pageSource = renderRouteHandlerModules({
    locale: heavyRoute.locale,
    slugArray: heavyRoute.slugArray,
    handlerId: heavyRoute.handlerId,
    usedLoadableComponentKeys: heavyRoute.usedLoadableComponentKeys,
    factoryBindings: heavyRoute.factoryBindings,
    selectedComponentEntries: heavyRoute.componentEntries,
    renderConfig
  });

  return {
    relativePath,
    pageFilePath,
    pageSource
  };
};

/**
 * Render a merged handler that owns several locales of one slug (a `K = 1`
 * group).
 *
 * The merged handler:
 * 1. is emitted at the locale-less optional catch-all leaf
 *    (`<slug>/[[...rest]].tsx`),
 * 2. exports `getStaticPaths` enumerating every owned locale, and
 * 3. bundles the shared component payload once, taken from the representative
 *    `route` (valid because all members resolve to one component set).
 *
 * @param input - Merged-page render input.
 * @returns Fully rendered merged handler page artifact.
 */
export const renderMergedRouteHandlerPage = ({
  paths,
  route,
  locales,
  handlerRelativePath,
  emitFormat,
  routeContract,
  handlerRouteParam,
  routeBasePath
}: RenderMergedRouteHandlerPageInput): RenderedHandlerPage => {
  // Merged handlers are always dynamic: the locale-less leaf must export
  // getStaticPaths to enumerate (and pin) every owned locale.
  const { relativePath, pageFilePath } = resolveRenderedHandlerPageLocation(
    paths,
    emitFormat,
    handlerRelativePath,
    true
  );
  const renderConfig = createPreparedHandlerRenderConfig({
    pageFilePath,
    emitFormat,
    routeBasePath,
    routeContract,
    factoryImport: route.factoryImport,
    handlerRouteParam,
    getStaticPathsLocales: locales
  });

  const pageSource = renderRouteHandlerModules({
    locale: route.locale,
    slugArray: route.slugArray,
    handlerId: route.handlerId,
    usedLoadableComponentKeys: route.usedLoadableComponentKeys,
    factoryBindings: route.factoryBindings,
    selectedComponentEntries: route.componentEntries,
    renderConfig
  });

  return {
    relativePath,
    pageFilePath,
    pageSource
  };
};
