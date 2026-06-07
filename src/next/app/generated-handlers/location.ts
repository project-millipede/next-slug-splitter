import path from 'node:path';

import type { RouteHandlerPaths } from '../../../core/types';

const APP_ROUTER_FILESYSTEM_ROOT = 'app';

/**
 * Split one filesystem path into non-empty path segments.
 *
 * 1. The input is a filesystem path, not a URL pathname.
 * 2. Platform-specific path separators are respected.
 * 3. Empty path segments are ignored.
 *
 * @example
 * // POSIX-style path
 * 'app/[locale]/docs/generated-handlers' -> [
 *   'app',
 *   '[locale]',
 *   'docs',
 *   'generated-handlers'
 * ]
 *
 * @param filesystemPath - Filesystem path to split.
 * @returns Ordered non-empty filesystem path segments.
 */
const toFilesystemPathSegments = (filesystemPath: string): Array<string> =>
  filesystemPath.split(path.sep).filter(segment => segment.length > 0);

/**
 * Check whether generated-handler output starts inside the App locale route
 * subtree.
 *
 * 1. The first filesystem path part must be the App Router root directory.
 * 2. The second filesystem path part must be the configured locale route param,
 *    formatted as a Next dynamic segment.
 * 3. Later appearances of the locale segment do not count because they do not
 *    place the generated page below the locale layout subtree.
 *
 * @example
 * // Locale segment is below the App Router root
 * ['app', '[locale]', 'docs', 'generated-handlers'] -> true
 *
 * // Locale segment is below the route subtree, not above it
 * ['app', 'docs', '[locale]', 'generated-handlers'] -> false
 *
 * // Outside the Next App Router filesystem tree
 * ['cache', '[locale]', 'docs', 'generated-handlers'] -> false
 *
 * @param generatedDirSegments - Generated directory path parts relative to
 * `paths.rootDir`.
 * @param localeRouteParamName - Bare App locale route-param name.
 * @returns `true` when generated output is inside `app/[param]/...`.
 */
const isGeneratedDirInAppLocaleSubtree = (
  generatedDirSegments: ReadonlyArray<string>,
  localeRouteParamName: string
): boolean => {
  const [generatedDirRootPathPart, generatedDirLocaleRouteParamPathPart] =
    generatedDirSegments;
  const localeRouteParamPathPart = `[${localeRouteParamName}]`;

  return (
    generatedDirRootPathPart === APP_ROUTER_FILESYSTEM_ROOT &&
    generatedDirLocaleRouteParamPathPart === localeRouteParamPathPart
  );
};

/**
 * Check whether App generated handlers are emitted below the configured locale
 * route segment.
 *
 * 1. The check is derived from `paths.generatedDir`, not from a separate public
 *    option.
 * 2. A generated directory below `app/[<localeRouteParamName>]/...` means each
 *    emitted handler file belongs to the physical locale layout subtree.
 * 3. Rewrites must then include the route locale at the front of the internal
 *    generated-handler destination.
 * 4. Generated handler pages must also enumerate the owning locale with
 *    `generateStaticParams`.
 *
 * @example
 * // Locale-scoped App output
 * rootDir:      '/repo'
 * generatedDir: '/repo/app/[locale]/docs/generated-handlers'
 * -> true
 *
 * // Conventional App output
 * rootDir:      '/repo'
 * generatedDir: '/repo/app/docs/generated-handlers'
 * -> false
 *
 * @param paths - Resolved target paths for one App target.
 * @param localeRouteParamName - Physical App Router dynamic segment name that
 * carries the locale.
 * @returns `true` when generated handlers live under the configured locale
 * segment.
 */
export const hasGeneratedHandlersInAppLocaleSubtree = (
  paths: Pick<RouteHandlerPaths, 'rootDir' | 'generatedDir'>,
  localeRouteParamName?: string
): boolean => {
  if (localeRouteParamName == null) {
    return false;
  }

  const relativeGeneratedDir = path.relative(paths.rootDir, paths.generatedDir);
  const generatedDirSegments = toFilesystemPathSegments(relativeGeneratedDir);

  return isGeneratedDirInAppLocaleSubtree(
    generatedDirSegments,
    localeRouteParamName
  );
};
