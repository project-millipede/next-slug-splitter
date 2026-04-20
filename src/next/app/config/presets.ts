import type {
  CreateAppCatchAllRouteHandlersPresetOptions,
  RouteHandlersTargetConfig
} from '../types';

import { createConfigError } from '../../../utils/errors';
import { resolveCatchAllRoutePresetIdentity } from '../../shared/config/catch-all-preset';
import { normalizeRouteSegment } from '../../shared/config/options';
import { isNonEmptyString } from '../../shared/config/shared';
import { createCatchAllAppRouteHandlerGeneratedRootDir } from './paths';

/**
 * Create a catch-all App Router target preset for next-slug-splitter.
 *
 * The public route identity still comes from `routeSegment`, while
 * `routeTreeSegment` optionally lets App Router place the emitted handler
 * subtree under a different filesystem branch such as a route group.
 *
 * @param options - Preset options describing one catch-all App target.
 * @returns Target config with normalized route and path values.
 */
export const createAppCatchAllRouteHandlersPreset = ({
  targetId,
  routeSegment,
  routeTreeSegment,
  handlerRouteParam,
  contentLocaleMode,
  contentPagesDir,
  emitFormat,
  handlerBinding,
  mdxCompileOptions,
  routeModuleImport
}: CreateAppCatchAllRouteHandlersPresetOptions): RouteHandlersTargetConfig => {
  if (!isNonEmptyString(contentPagesDir)) {
    throw createConfigError(
      'contentPagesDir must be a non-empty string path.'
    );
  }

  const resolvedPresetIdentity = resolveCatchAllRoutePresetIdentity({
    targetId,
    routeSegment,
    handlerRouteParam
  });
  const normalizedRouteTreeSegment =
    routeTreeSegment == null
      ? resolvedPresetIdentity.routeSegment
      : normalizeRouteSegment(routeTreeSegment);

  return {
    targetId: resolvedPresetIdentity.targetId,
    emitFormat,
    contentLocaleMode,
    handlerRouteParam: resolvedPresetIdentity.handlerRouteParam,
    handlerBinding,
    mdxCompileOptions,
    routeBasePath: resolvedPresetIdentity.routeBasePath,
    routeModuleImport,
    generatedRootDir: createCatchAllAppRouteHandlerGeneratedRootDir(
      normalizedRouteTreeSegment
    ),
    paths: {
      contentPagesDir
    }
  };
};
