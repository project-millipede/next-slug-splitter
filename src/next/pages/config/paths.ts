import path from 'path';

import { relativeModule } from '../../../module-reference';
import { createConfigError } from '../../../utils/errors';
import type {
  RelativeModuleReference,
  DynamicRouteParam,
  RouteHandlerTargetPaths
} from '../../shared/types';

import { isNonEmptyString } from '../../shared/config/shared';

/**
 * Build the import specifier of the source page whose `getStaticProps` should
 * be proxied by generated handler pages.
 *
 * @param input - Static-props import construction input.
 * @returns Source page module reference relative to the project root.
 */
export const createCatchAllBaseStaticPropsImport = ({
  routeSegment,
  handlerRouteParam
}: {
  /**
   * Route segment owned by the target.
   */
  routeSegment: string;
  /**
   * Dynamic route parameter descriptor for the source page.
   */
  handlerRouteParam: DynamicRouteParam;
}): RelativeModuleReference => {
  const routeSegments = routeSegment.split('/');
  const pageSegment =
    handlerRouteParam.kind === 'single'
      ? `[${handlerRouteParam.name}]`
      : handlerRouteParam.kind === 'catch-all'
        ? `[...${handlerRouteParam.name}]`
        : `[[...${handlerRouteParam.name}]]`;

  return relativeModule(['pages', ...routeSegments, pageSegment].join('/'));
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
 * Build the target-local path values implied by a catch-all preset.
 *
 * @param input - Preset path input.
 * @returns Target-local path values that still need app-level root resolution.
 */
export const createCatchAllRouteHandlerNextPaths = ({
  routeSegment,
  contentPagesDir
}: {
  /**
   * Normalized route segment for the target.
   */
  routeSegment: string;
  /**
   * Source content pages directory or import path.
   */
  contentPagesDir: string;
}): Partial<RouteHandlerTargetPaths> => {
  if (!isNonEmptyString(contentPagesDir)) {
    throw createConfigError(
      'contentPagesDir must be a non-empty string path.'
    );
  }

  const routeSegments = routeSegment.split('/');

  return {
    contentPagesDir,
    handlersDir: path.join('pages', ...routeSegments, '_handlers')
  };
};
