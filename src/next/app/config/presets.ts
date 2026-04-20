import type {
  CreateAppCatchAllRouteHandlersPresetOptions,
  RouteHandlersTargetConfig
} from '../types';

import { createConfigError } from '../../../utils/errors';
import { resolveCatchAllRoutePresetIdentity } from '../../shared/config/catch-all-preset';
import { isNonEmptyString } from '../../shared/config/shared';
import { createCatchAllAppRouteHandlerGeneratedRootDir } from './paths';

/**
 * Create a catch-all App Router target preset for next-slug-splitter.
 *
 * The public route identity still comes from `routeSegment`, and the preset
 * derives the conventional `app/<routeSegment>` generated-output root.
 *
 * @param options - Preset options describing one catch-all App target.
 * @returns Target config with normalized route and path values.
 */
export const createAppCatchAllRouteHandlersPreset = ({
  targetId,
  routeSegment,
  handlerRouteParam,
  contentLocaleMode,
  contentDir,
  emitFormat,
  handlerBinding,
  mdxCompileOptions,
  routeContract
}: CreateAppCatchAllRouteHandlersPresetOptions): RouteHandlersTargetConfig => {
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
    routeBasePath: resolvedPresetIdentity.routeBasePath,
    routeContract,
    contentDir,
    generatedRootDir: createCatchAllAppRouteHandlerGeneratedRootDir(
      resolvedPresetIdentity.routeSegment
    )
  };
};
