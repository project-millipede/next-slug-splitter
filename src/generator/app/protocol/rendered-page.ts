import path from 'node:path';

import { toEmittedImportSpecifier } from '../../../module-reference';
import {
  resolveRouteParamValue,
  type DynamicRouteParam
} from '../../../next/shared/types';
import { APP_LOCALE_PARAM_NAME } from '../../../next/app/filter-static-params';
import { renderAppRouteHandlerModules } from './render-modules';

import type {
  EmitFormat,
  PlannedHeavyRoute,
  ResolvedRouteHandlerModuleReference,
  RouteHandlerPaths
} from '../../../core/types';
import type { ResolvedAppRouteModuleContract } from '../../../next/app/types';
import type { JsonObject } from '../../../utils/type-guards-json';

const GENERATED_APP_ROUTE_HANDLER_PAGE_BASENAME = 'page';

export type RenderedAppHandlerPage = {
  relativePath: string;
  pageFilePath: string;
  pageSource: string;
};

export type RenderedAppHandlerPageLocation = {
  relativePath: string;
  pageFilePath: string;
};

export const resolveRenderedAppHandlerPageLocation = (
  paths: Pick<RouteHandlerPaths, 'generatedDir'>,
  emitFormat: EmitFormat,
  handlerRelativePath: string
): RenderedAppHandlerPageLocation => {
  const pageExtension = emitFormat === 'ts' ? 'tsx' : 'js';
  const pageFilePath = path.join(
    paths.generatedDir,
    handlerRelativePath,
    `${GENERATED_APP_ROUTE_HANDLER_PAGE_BASENAME}.${pageExtension}`
  );

  return {
    relativePath: path.relative(paths.generatedDir, pageFilePath),
    pageFilePath
  };
};

/**
 * Fields shared by every App handler-emission entry point: where the page is
 * written, how it is formatted, and the route contract it delegates to.
 */
export type AppRouteHandlerEmitBase = {
  /** Target filesystem paths. */
  paths: RouteHandlerPaths;
  /** Output format for generated files. */
  emitFormat: EmitFormat;
  /** Resolved App route contract import (provides loadPageProps/getStaticParams). */
  routeContract: ResolvedRouteHandlerModuleReference;
  /** Dynamic route-param descriptor for the handler page. */
  handlerRouteParam: DynamicRouteParam;
  /** Public route base path for the target. */
  routeBasePath: string;
  /** Build-time inspection of the route contract (metadata + revalidate surface). */
  routeModuleContract: ResolvedAppRouteModuleContract;
};

/** Input for {@link renderAppRouteHandlerPage}. */
type RenderAppRouteHandlerPageInput = AppRouteHandlerEmitBase & {
  /** Planned heavy route to render. */
  heavyRoute: PlannedHeavyRoute;
  /**
   * When `true`, bake the route's locale into `handlerParams` (under
   * `APP_LOCALE_PARAM_NAME`) so the route contract's `loadPageProps` and
   * `generatePageMetadata` resolve the correct per-locale data. Set for
   * multi-locale targets; single-locale targets keep the slug-only bag.
   */
  includeLocaleParam: boolean;
};

/**
 * Render one planned heavy route into an emitted App handler-page artifact.
 *
 * @remarks
 * The generated page is concrete (`dynamicParams = false`), so its baked
 * `handlerParams` constant is the only channel carrying route identity into the
 * shared route contract. That bag holds:
 * 1. the fixed slug value under the handler's route-param name, and
 * 2. for multi-locale targets, the route's locale under `APP_LOCALE_PARAM_NAME`
 *    — which is what lets one route contract load the right per-locale data.
 *
 * @param input - One-page render input.
 * @returns Fully rendered App handler page artifact.
 */
export const renderAppRouteHandlerPage = ({
  paths,
  heavyRoute,
  emitFormat,
  routeContract,
  handlerRouteParam,
  routeBasePath,
  routeModuleContract,
  includeLocaleParam
}: RenderAppRouteHandlerPageInput): RenderedAppHandlerPage => {
  const { relativePath, pageFilePath } = resolveRenderedAppHandlerPageLocation(
    paths,
    emitFormat,
    heavyRoute.handlerRelativePath
  );
  const fixedRouteParamValue = resolveRouteParamValue(
    handlerRouteParam,
    heavyRoute.slugArray
  );

  // handlerParams is the route contract's only input channel: the slug, plus
  // the locale for multi-locale targets (single-locale stays slug-only).
  const handlerParams: JsonObject = {};
  if (fixedRouteParamValue !== undefined) {
    handlerParams[handlerRouteParam.name] = fixedRouteParamValue;
  }
  if (includeLocaleParam) {
    handlerParams[APP_LOCALE_PARAM_NAME] = heavyRoute.locale;
  }

  const pageSource = renderAppRouteHandlerModules({
    locale: heavyRoute.locale,
    slugArray: heavyRoute.slugArray,
    handlerId: heavyRoute.handlerId,
    usedLoadableComponentKeys: heavyRoute.usedLoadableComponentKeys,
    factoryBindings: heavyRoute.factoryBindings,
    selectedComponentEntries: heavyRoute.componentEntries,
    renderConfig: {
      pageFilePath,
      emitFormat,
      routeBasePath,
      runtimeHandlerFactoryImport: toEmittedImportSpecifier(
        pageFilePath,
        heavyRoute.factoryImport
      ),
      routeContract: toEmittedImportSpecifier(pageFilePath, routeContract),
      handlerParams,
      hasGeneratePageMetadata: routeModuleContract.hasGeneratePageMetadata,
      revalidate: routeModuleContract.revalidate
    }
  });

  return {
    relativePath,
    pageFilePath,
    pageSource
  };
};
