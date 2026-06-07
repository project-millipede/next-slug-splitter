import path from 'node:path';

import { toRoutePathSegments } from '../../../utils/route-path';

const APP_ROUTER_FILESYSTEM_ROOT = 'app';

/**
 * Build the App Router filesystem directory that should contain generated
 * handler pages for one catch-all target.
 *
 * 1. `routeBasePath` is the normalized public route base owned by the target.
 * 2. Route base path segments become filesystem path parts below `app/`.
 * 3. The root route base path `/` contributes no extra filesystem path parts.
 * 4. `localeRouteParamName` is a bare param name, for example `locale`, and is
 *    formatted as `[locale]` only when building the filesystem path.
 * 5. The returned value is a filesystem path below `app/`, not a public route
 *    path and not the final `generated-handlers` leaf.
 *
 * @param routeBasePath - Normalized App route base path.
 * @param localeRouteParamName - Optional bare App locale route-param name.
 * @returns App filesystem directory that should own generated handler output.
 */
export const createCatchAllAppRouteHandlerGeneratedRootDir = (
  routeBasePath: string,
  localeRouteParamName?: string
): string => {
  const routeBasePathParts = toRoutePathSegments(routeBasePath);

  if (localeRouteParamName != null) {
    const localeRouteParamPathPart = `[${localeRouteParamName}]`;

    return path.join(
      APP_ROUTER_FILESYSTEM_ROOT,
      localeRouteParamPathPart,
      ...routeBasePathParts
    );
  }

  return path.join(APP_ROUTER_FILESYSTEM_ROOT, ...routeBasePathParts);
};
