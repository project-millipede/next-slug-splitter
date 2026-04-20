import path from 'node:path';

/**
 * Build the generated-output root directory implied by one App catch-all preset.
 *
 * @param routeSegment - Normalized App Router route segment whose conventional
 * `app/<segment>` branch should own the generated handlers.
 * @returns Directory that should own the canonical generated-handler leaf.
 */
export const createCatchAllAppRouteHandlerGeneratedRootDir = (
  routeSegment: string
): string => {
  const routeSegments = routeSegment.split('/');

  return path.join('app', ...routeSegments);
};
