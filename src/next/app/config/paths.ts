import path from 'node:path';

import type { RouteHandlerTargetPaths } from '../../shared/types';

import { isNonEmptyString } from '../../shared/config/shared';
import { createConfigError } from '../../../utils/errors';

/**
 * Build the target-local App Router path values implied by a catch-all preset.
 *
 * @param input - Preset path input.
 * @returns Target-local path values that still need app-level root resolution.
 */
export const createCatchAllAppRouteHandlerNextPaths = ({
  routeTreeSegment,
  contentPagesDir
}: {
  /**
   * Normalized App Router subtree segment for the catch-all route and
   * generated handlers. This may include route groups.
   */
  routeTreeSegment: string;
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

  const routeTreeSegments = routeTreeSegment.split('/');

  return {
    contentPagesDir,
    handlersDir: path.join('app', ...routeTreeSegments, '_handlers')
  };
};
