import type {
  CreateCatchAllRouteHandlersPresetOptions,
  RouteHandlersTargetConfig
} from '../types';

import { normalizeHandlerRouteParam, normalizeRouteSegment } from './options';
import {
  createCatchAllBaseStaticPropsImport,
  createCatchAllRouteBasePath,
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
  handlerBinding
}: CreateCatchAllRouteHandlersPresetOptions): RouteHandlersTargetConfig => {
  const normalizedRouteSegment = normalizeRouteSegment(routeSegment);
  const normalizedHandlerRouteParam =
    normalizeHandlerRouteParam(handlerRouteParam);
  let resolvedTargetId = targetId;
  if (resolvedTargetId == null) {
    resolvedTargetId = normalizedRouteSegment.replace(/\//g, '-');
  }

  return {
    targetId: resolvedTargetId,
    emitFormat,
    contentLocaleMode,
    handlerRouteParam: normalizedHandlerRouteParam,
    handlerBinding,
    baseStaticPropsImport: createCatchAllBaseStaticPropsImport({
      routeSegment: normalizedRouteSegment,
      handlerRouteParam: normalizedHandlerRouteParam
    }),
    routeBasePath: createCatchAllRouteBasePath(normalizedRouteSegment),
    paths: createCatchAllRouteHandlerNextPaths({
      routeSegment: normalizedRouteSegment,
      contentPagesDir
    })
  };
};
