import path from 'node:path';

import { toEmittedImportSpecifier } from '../../../module-reference';
import { resolveRouteParamValue } from '../../../next/shared/types';
import { renderAppRouteHandlerModules } from './render-modules';

import type {
  DynamicRouteParam,
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
 * Build the params object passed to an emitted App Router handler page.
 *
 * App generated-handler pages may need two independent param groups:
 * 1. Locale params:
 *    Multi-locale App routes live under `[locale]`, so the generated handler
 *    must receive the physical App route locale, for example `{ locale: 'de' }`.
 *    Single-locale App routes do not have a locale route param, so this part is
 *    omitted.
 *
 * 2. Slug params:
 *    Dynamic source routes still need their original route param shape. For a
 *    catch-all route such as `[...slug]`, the generated handler receives
 *    `{ slug: ['a', 'b'] }`. For an optional catch-all route with no segments,
 *    the slug value is `undefined` and is omitted.
 *
 * Examples:
 * - Multi-locale catch-all:
 *   `{ locale: 'de', slug: ['a', 'b'] }`
 *
 * - Multi-locale optional catch-all at index:
 *   `{ locale: 'en' }`
 *
 * - Single-locale catch-all:
 *   `{ slug: ['a', 'b'] }`
 *
 * - Single-locale optional catch-all at index:
 *   `{}`
 *
 * @param appLocaleParamName - Name of the App locale param, when the source App
 * route is locale-prefixed.
 * @param appRouteLocale - Locale owned by the heavy route being rendered.
 * @param slugRouteParam - Dynamic route param used by the source App route.
 * @param fixedSlugParamValue - Concrete slug value resolved for the heavy route,
 * or undefined when an optional catch-all has no segments.
 * @returns JSON-serializable params for the generated handler page.
 */
const createAppHandlerRouteParams = (
  appLocaleParamName: string | undefined,
  appRouteLocale: string,
  slugRouteParam: DynamicRouteParam,
  fixedSlugParamValue: string | string[] | undefined
): JsonObject => {
  const handlerRouteParams: JsonObject = {};

  if (appLocaleParamName !== undefined) {
    handlerRouteParams[appLocaleParamName] = appRouteLocale;
  }

  if (fixedSlugParamValue !== undefined) {
    handlerRouteParams[slugRouteParam.name] = fixedSlugParamValue;
  }

  return handlerRouteParams;
};

export const renderAppRouteHandlerPage = ({
  paths,
  heavyRoute,
  emitFormat,
  routeContract,
  handlerRouteParam,
  localeParamName,
  routeBasePath,
  routeModuleContract
}: {
  paths: RouteHandlerPaths;
  heavyRoute: PlannedHeavyRoute;
  emitFormat: EmitFormat;
  routeContract: ResolvedRouteHandlerModuleReference;
  handlerRouteParam: DynamicRouteParam;
  localeParamName?: string;
  routeBasePath: string;
  routeModuleContract: ResolvedAppRouteModuleContract;
}): RenderedAppHandlerPage => {
  const { relativePath, pageFilePath } = resolveRenderedAppHandlerPageLocation(
    paths,
    emitFormat,
    heavyRoute.handlerRelativePath
  );
  const fixedRouteParamValue = resolveRouteParamValue(
    handlerRouteParam,
    heavyRoute.slugArray
  );

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
      handlerParams: createAppHandlerRouteParams(
        localeParamName,
        heavyRoute.locale,
        handlerRouteParam,
        fixedRouteParamValue
      ),
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
