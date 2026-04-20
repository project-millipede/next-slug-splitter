import path from 'path';

import { relativeModule } from '../../../module-reference';
import type {
  RelativeModuleReference,
  DynamicRouteParam
} from '../../shared/types';

/**
 * Render the Next.js filesystem segment for one dynamic route param.
 *
 * @param handlerRouteParam Dynamic route parameter descriptor.
 * @returns Filesystem route segment such as `[slug]` or `[...slug]`.
 */
const toDynamicPageSegment = (handlerRouteParam: DynamicRouteParam): string => {
  if (handlerRouteParam.kind === 'single') {
    return `[${handlerRouteParam.name}]`;
  }

  if (handlerRouteParam.kind === 'catch-all') {
    return `[...${handlerRouteParam.name}]`;
  }

  return `[[...${handlerRouteParam.name}]]`;
};

/**
 * Build the import specifier of the source page whose `getStaticProps` should
 * be proxied by generated handler pages.
 *
 * @param routeSegment - Route segment owned by the target.
 * @param handlerRouteParam - Dynamic route parameter descriptor for the source
 * page.
 * @returns Source page module reference relative to the project root.
 */
export const createCatchAllBaseStaticPropsImport = (
  routeSegment: string,
  handlerRouteParam: DynamicRouteParam
): RelativeModuleReference => {
  const routeSegments = routeSegment.split('/');
  const pageSegment = toDynamicPageSegment(handlerRouteParam);

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
 * Build the generated-output root directory implied by a catch-all preset.
 *
 * @param routeSegment - Normalized route segment for the target.
 * @returns Directory that should own the canonical generated-handler leaf.
 */
export const createCatchAllRouteHandlerGeneratedRootDir = (
  routeSegment: string
): string => {
  const routeSegments = routeSegment.split('/');

  return path.join('pages', ...routeSegments);
};
