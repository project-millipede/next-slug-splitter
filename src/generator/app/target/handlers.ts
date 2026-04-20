import {
  clearRouteHandlerOutputDirectory,
  synchronizeRenderedRouteHandlerPage
} from '../../shared/protocol/output-lifecycle';
import { renderAppRouteHandlerPage } from '../protocol/rendered-page';

import type {
  EmitFormat,
  PlannedHeavyRoute,
  ResolvedRouteHandlerModuleReference,
  RouteHandlerPaths
} from '../../../core/types';
import type { ResolvedAppRouteModuleContract } from '../../../next/app/types';
import type { DynamicRouteParam } from '../../../next/shared/types';

export const emitAppRouteHandlerPages = async ({
  paths,
  heavyRoutes,
  emitFormat,
  routeContract,
  handlerRouteParam,
  routeBasePath,
  routeModuleContract
}: {
  paths: RouteHandlerPaths;
  heavyRoutes: Array<PlannedHeavyRoute>;
  emitFormat: EmitFormat;
  routeContract: ResolvedRouteHandlerModuleReference;
  handlerRouteParam: DynamicRouteParam;
  routeBasePath: string;
  routeModuleContract: ResolvedAppRouteModuleContract;
}): Promise<void> => {
  await clearRouteHandlerOutputDirectory(paths.generatedDir);

  const renderedPages = heavyRoutes.map(entry =>
    renderAppRouteHandlerPage({
      paths,
      heavyRoute: entry,
      emitFormat,
      routeContract,
      handlerRouteParam,
      routeBasePath,
      routeModuleContract
    })
  );

  for (const page of renderedPages) {
    await synchronizeRenderedRouteHandlerPage(page);
  }
};
