import path from 'path';

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
