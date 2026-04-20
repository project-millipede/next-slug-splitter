import path from 'node:path';

/**
 * Build the generated-output root directory implied by one App catch-all preset.
 *
 * @param routeTreeSegment - Normalized App Router subtree segment whose parent
 * directory should own the generated handlers. This may include route groups.
 * @returns Directory that should own the canonical generated-handler leaf.
 */
export const createCatchAllAppRouteHandlerGeneratedRootDir = (
  routeTreeSegment: string
): string => {
  const routeTreeSegments = routeTreeSegment.split('/');

  return path.join('app', ...routeTreeSegments);
};
