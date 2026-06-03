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
  /**
   * Planned heavy route supplying the emitted component payload — its locale,
   * slug, handler id, loadable keys, factory import/bindings, and component
   * entries. For a merged group this is the representative route (all members
   * share one component set).
   */
  route: PlannedHeavyRoute;
  /**
   * Handler-relative emit destination: locale-bearing for a per-locale handler
   * (`<slug>/<locale>`), locale-less for a merged one (`<slug>`).
   */
  handlerRelativePath: string;
  /**
   * Locales to enumerate in `getStaticPaths`, which also selects the file shape:
   * 1. empty → a concrete page, no `getStaticPaths` (`L = 1`);
   * 2. one → a per-locale optional-catch-all leaf pinning that locale;
   * 3. several → one merged optional-catch-all leaf owning a `K = 1` group.
   */
  getStaticPathsLocales: Array<string>;
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
 * Render one heavy route into the emitted handler-page artifact that can later
 * be synchronized to disk.
 *
 * @remarks
 * This is the single, locale-count-agnostic emit path shared by every caller —
 * the eager target emitter (`single` and `merged` units alike) and the lazy
 * dev/proxy emitter. It does not know whether its input represents a concrete
 * page, a per-locale handler, or a merged group; the caller expresses that
 * purely through `handlerRelativePath` and `getStaticPathsLocales`, the latter
 * driving two things at once:
 * 1. the file shape — a non-empty list emits under the optional catch-all leaf
 *    (`[[...rest]]`), an empty list stays a concrete page; and
 * 2. the `getStaticPaths` export — one enumerated `(rest: [], locale)` entry per
 *    listed locale, omitted entirely when the list is empty.
 *
 * @param input - One-page render input.
 * @returns Fully rendered handler page artifact.
 */
export const renderRouteHandlerPage = ({
  paths,
  route,
  handlerRelativePath,
  getStaticPathsLocales,
  emitFormat,
  routeContract,
  handlerRouteParam,
  routeBasePath
}: RenderRouteHandlerPageInput): RenderedHandlerPage => {
  // A non-empty locale list is the single trigger for the optional catch-all
  // leaf: a concrete page (empty list) needs no dynamic segment, while both a
  // per-locale handler and a merged group export getStaticPaths and so require
  // one. This keeps the leaf decision and the getStaticPaths export in lockstep.
  const { relativePath, pageFilePath } = resolveRenderedHandlerPageLocation(
    paths,
    emitFormat,
    handlerRelativePath,
    getStaticPathsLocales.length > 0
  );
  const renderConfig = createPreparedHandlerRenderConfig({
    pageFilePath,
    emitFormat,
    routeBasePath,
    routeContract,
    factoryImport: route.factoryImport,
    handlerRouteParam,
    getStaticPathsLocales
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
