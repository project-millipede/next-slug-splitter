import type {
  CreateCatchAllRouteHandlersPresetOptions,
  RouteHandlersTargetConfig
} from '../types';

import { resolveCatchAllRoutePresetIdentity } from '../../shared/config/catch-all-preset';
import {
  createCatchAllBaseStaticPropsImport,
  createCatchAllRouteHandlerNextPaths
} from './paths';

/**
 * Create a catch-all target preset for next-slug-splitter.
 *
 * @param options Preset options describing one catch-all target.
 * @returns Target config with normalized route and path values.
 */
export const createCatchAllRouteHandlersPreset = ({
  targetId,
  routeSegment,
  handlerRouteParam,
  contentLocaleMode,
  contentPagesDir,
  emitFormat,
  handlerBinding,
  mdxCompileOptions
}: CreateCatchAllRouteHandlersPresetOptions): RouteHandlersTargetConfig => {
  const resolvedPresetIdentity = resolveCatchAllRoutePresetIdentity({
    targetId,
    routeSegment,
    handlerRouteParam
  });

  return {
    targetId: resolvedPresetIdentity.targetId,
    emitFormat,
    contentLocaleMode,
    handlerRouteParam: resolvedPresetIdentity.handlerRouteParam,
    handlerBinding,
    mdxCompileOptions,
    baseStaticPropsImport: createCatchAllBaseStaticPropsImport({
      routeSegment: resolvedPresetIdentity.routeSegment,
      handlerRouteParam: resolvedPresetIdentity.handlerRouteParam
    }),
    routeBasePath: resolvedPresetIdentity.routeBasePath,
    paths: createCatchAllRouteHandlerNextPaths({
      routeSegment: resolvedPresetIdentity.routeSegment,
      contentPagesDir
    })
  };
};
