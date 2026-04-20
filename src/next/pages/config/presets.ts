import type {
  CreateCatchAllRouteHandlersPresetOptions,
  RouteHandlersTargetConfig
} from '../types';

import { createConfigError } from '../../../utils/errors';
import { isNonEmptyString } from '../../shared/config/shared';
import { resolveCatchAllRoutePresetIdentity } from '../../shared/config/catch-all-preset';
import { createCatchAllRouteHandlerGeneratedRootDir } from './paths';

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
  contentDir,
  emitFormat,
  handlerBinding,
  routeContract,
  mdxCompileOptions
}: CreateCatchAllRouteHandlersPresetOptions): RouteHandlersTargetConfig => {
  if (!isNonEmptyString(contentDir)) {
    throw createConfigError('contentDir must be a non-empty string path.');
  }

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
    routeContract,
    routeBasePath: resolvedPresetIdentity.routeBasePath,
    contentDir,
    generatedRootDir: createCatchAllRouteHandlerGeneratedRootDir(
      resolvedPresetIdentity.routeSegment
    )
  };
};
