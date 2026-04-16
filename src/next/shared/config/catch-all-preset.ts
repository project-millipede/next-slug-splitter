import type { DynamicRouteParam } from '../types';

import {
  deriveTargetIdFromRouteBasePath,
  normalizeHandlerRouteParam,
  normalizeRouteSegment
} from './options';

/**
 * Shared normalized identity derived from one catch-all preset declaration.
 */
export type CatchAllRoutePresetIdentity = {
  /**
   * Stable target id used for cache separation and lookup scoping.
   */
  targetId: string;
  /**
   * Normalized public route segment string.
   */
  routeSegment: string;
  /**
   * Normalized public route base path.
   */
  routeBasePath: string;
  /**
   * Normalized dynamic route parameter descriptor.
   */
  handlerRouteParam: DynamicRouteParam;
};

/**
 * Build the public route base path for one catch-all target.
 *
 * @param routeSegment - Normalized route segment.
 * @returns Public route base path for the target.
 */
export const createCatchAllRouteBasePath = (routeSegment: string): string =>
  `/${routeSegment}`;

/**
 * Resolve the shared public identity implied by one catch-all preset.
 *
 * Both Pages Router and App Router presets need the same first step:
 * normalize the public route segment, normalize the dynamic param, derive the
 * public route base path, and choose a stable target id.
 *
 * @param input - Shared catch-all preset identity input.
 * @returns Normalized public route identity reused by router-specific presets.
 */
export const resolveCatchAllRoutePresetIdentity = ({
  targetId,
  routeSegment,
  handlerRouteParam
}: {
  targetId?: string;
  routeSegment: string;
  handlerRouteParam: DynamicRouteParam;
}): CatchAllRoutePresetIdentity => {
  const normalizedRouteSegment = normalizeRouteSegment(routeSegment);
  const normalizedHandlerRouteParam =
    normalizeHandlerRouteParam(handlerRouteParam);
  const routeBasePath = createCatchAllRouteBasePath(normalizedRouteSegment);

  return {
    targetId: targetId ?? deriveTargetIdFromRouteBasePath(routeBasePath),
    routeSegment: normalizedRouteSegment,
    routeBasePath,
    handlerRouteParam: normalizedHandlerRouteParam
  };
};
