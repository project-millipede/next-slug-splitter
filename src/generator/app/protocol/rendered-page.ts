import path from 'node:path';

import { toEmittedImportSpecifier } from '../../../module-reference';
import { resolveRouteParamValue } from '../../../next/shared/types';
import { renderAppRouteHandlerModules } from './render-modules';

import type {
  EmitFormat,
  PlannedHeavyRoute,
  ResolvedRouteHandlerModuleReference,
  RouteHandlerPaths
} from '../../../core/types';
import type { ResolvedAppRouteModuleContract } from '../../../next/app/types';

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
  paths: Pick<RouteHandlerPaths, 'handlersDir'>,
  emitFormat: EmitFormat,
  handlerRelativePath: string
): RenderedAppHandlerPageLocation => {
  const pageExtension = emitFormat === 'ts' ? 'tsx' : 'js';
  const pageFilePath = path.join(
    paths.handlersDir,
    handlerRelativePath,
    `${GENERATED_APP_ROUTE_HANDLER_PAGE_BASENAME}.${pageExtension}`
  );

  return {
    relativePath: path.relative(paths.handlersDir, pageFilePath),
    pageFilePath
  };
};

export const renderAppRouteHandlerPage = ({
  paths,
  heavyRoute,
  emitFormat,
  routeModuleImport,
  handlerRouteParam,
  routeBasePath,
  routeModuleContract
}: {
  paths: RouteHandlerPaths;
  heavyRoute: PlannedHeavyRoute;
  emitFormat: EmitFormat;
  routeModuleImport: ResolvedRouteHandlerModuleReference;
  handlerRouteParam: {
    name: string;
    kind: 'single' | 'catch-all' | 'optional-catch-all';
  };
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
      routeModuleImport: toEmittedImportSpecifier(pageFilePath, routeModuleImport),
      handlerParams:
        fixedRouteParamValue === undefined
          ? {}
          : { [handlerRouteParam.name]: fixedRouteParamValue },
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
