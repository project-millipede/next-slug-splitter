import { resolveLocalizedContentRoute } from '../../../core/discovery';
import { resolveNormalizedRouteHandlersTargetsFromAppConfig } from '../../config/resolve-configs';

import type { LocaleConfig } from '../../../core/types';
import type {
  ResolvedRouteHandlersAppConfig,
  RouteHandlersConfig
} from '../../types';
import type {
  RouteHandlerLazyRequestIdentity,
  RouteHandlerLazyResolvedTarget,
  RouteHandlerLazyRequestResolution
} from './types';
import { isNonEmptyString } from '../../../utils/type-guards-extended';

/**
 * Target-local lazy request resolution for the dev proxy path.
 *
 * @remarks
 * This module owns one very specific concern:
 * - given a public pathname, determine whether it maps to one exact localized
 *   content source file
 *
 * It intentionally stops there. It does not:
 * - analyze the file
 * - classify heavy vs light
 * - emit a handler
 *
 * That boundary is important because it gives the future fully lazy pipeline a
 * clean seam:
 * request routing first, single-file path resolution second, single-file
 * analysis third, single-file emission last.
 *
 * The important performance property is that this module now performs only
 * path-local lookup for the requested route identity. It no longer scans the
 * full target content tree just to answer one request.
 */

/**
 * Splits a path into clean, validated segments.
 *
 * @param path - The raw pathname or base path.
 * @returns Ordered non-empty segments that satisfy {@link isNonEmptyString}.
 *
 * @example
 * toSegments('/de/docs/'); // ['de', 'docs']
 * toSegments('/');         // []
 */
const toSegments = (path: string): string[] =>
  path.split('/').filter(isNonEmptyString);

/**
 * Derives a locale-aware request identity for a specific target configuration.
 *
 * @remarks
 * Locale Routing Behavior & Priority:
 *
 * Single vs. Multi-Locale:
 *   Locale-prefixed paths are only accepted when multiple locales are configured.
 *   Locale-less paths automatically resolve to the default locale.
 *
 * Reserved Namespace:
 *   In multi-locale applications, locale codes function as reserved leading
 *   path segments.
 *   Example:
 *     If configured locales are `['en', 'de']`, the leading segment `/de` strictly
 *     designates the German locale namespace.
 *
 * Matching Precedence:
 *   A path starting with a locale code is always interpreted as that locale,
 *   never as a literal route base path.
 *   Example:
 *     A request to `/de/shop` for a root target resolves to the `de` locale with
 *     the slug `shop`, not as a default-locale slug starting with `de`.
 *
 * Configuration Enforcement:
 *   To prevent silently unreachable routes, configuration validation must
 *   explicitly reject route base paths that begin with an active locale code.
 *   Example:
 *     Initializing a config with `routeBasePath: '/de/docs'` must throw a
 *     validation error at startup if `de` is an active locale.
 *
 * @param pathname - Public pathname to interpret.
 * @param config - Candidate target config that may own the pathname.
 * @returns Locale/slug identity when the target owns the pathname, otherwise `null`.
 */
const resolveRequestIdentityForConfig = (
  pathname: string,
  config: RouteHandlerLazyResolvedTarget
): RouteHandlerLazyRequestIdentity | null => {
  const { locales, defaultLocale } = config.localeConfig;

  // Normalize the pathname and the configured base path into segment arrays.
  const allSegments = toSegments(pathname);
  const baseSegments = toSegments(config.routeBasePath);

  // 1. Determine if the path starts with a valid locale prefix.
  //    Using destructuring allows us to peek at the first segment without
  //    mutating the array.
  const [first, ...afterFirst] = allSegments;
  const isLocale = locales.length > 1 && locales.includes(first);

  // 2. Select the active segments and the resolved locale.
  //    If a locale prefix is present, matching starts after the locale segment.
  const activeSegments = isLocale ? afterFirst : allSegments;
  const locale = isLocale ? (first as string) : defaultLocale;

  // 3. Verify that the active segments match the required base path prefix.
  const isMatch = baseSegments.every(
    (segment, index) => activeSegments[index] === segment
  );

  // 4. Validate ownership of the pathname.
  //    If the base path prefix does not match,
  //    the configuration does not own this pathname.
  if (!isMatch) {
    return null;
  }

  // 5. Extract the slug segments.
  // The slug consists of all segments remaining after the matched base path.
  const slugArray = activeSegments.slice(baseSegments.length);

  return {
    pathname,
    locale,
    slugArray
  };
};

/**
 * Pick the most specific configured target that owns the pathname.
 *
 * @param pathname - Public pathname to resolve.
 * @param resolvedConfigs - Fully resolved target configs.
 * @returns Matching target plus resolved request identity, otherwise `null`.
 *
 * @remarks
 * Configs are checked by descending `routeBasePath` length so nested targets
 * such as `/docs/api` win over broader targets such as `/docs`.
 */
const resolveMatchedTargetRequest = (
  pathname: string,
  resolvedConfigs: Array<RouteHandlerLazyResolvedTarget>
): {
  config: RouteHandlerLazyResolvedTarget;
  identity: RouteHandlerLazyRequestIdentity;
} | null => {
  const sortedConfigs = [...resolvedConfigs].sort(
    (left, right) => right.routeBasePath.length - left.routeBasePath.length
  );

  for (const config of sortedConfigs) {
    const identity = resolveRequestIdentityForConfig(pathname, config);

    if (identity != null) {
      return {
        config,
        identity
      };
    }
  }

  return null;
};

/**
 * Resolve the lightweight target shape needed by lazy request resolution.
 *
 * @param appConfig - Already-resolved app config.
 * @param localeConfig - Shared locale config captured at adapter time.
 * @param routeHandlersConfig - App-owned splitter config.
 * @returns Lightweight resolved target configs.
 */
export const resolveRouteHandlerLazyResolvedTargetsFromAppConfig = (
  appConfig: ResolvedRouteHandlersAppConfig,
  localeConfig: LocaleConfig,
  routeHandlersConfig: RouteHandlersConfig
): Array<RouteHandlerLazyResolvedTarget> =>
  resolveNormalizedRouteHandlersTargetsFromAppConfig(
    appConfig,
    routeHandlersConfig
  ).map(({ options }) => ({
    // This is intentionally the smallest resolved shape that can support
    // request-to-file matching plus deterministic stale-output cleanup. No
    // processor imports, runtime factory imports, or other planner-only data
    // are pulled into this seam.
    targetId: options.targetId,
    routeBasePath: options.routeBasePath,
    contentLocaleMode: options.contentLocaleMode,
    localeConfig,
    emitFormat: options.emitFormat,
    paths: {
      contentPagesDir: options.paths.contentPagesDir,
      handlersDir: options.paths.handlersDir
    }
  }));

/**
 * Resolve one proxy pathname into one concrete target-local content file when
 * possible.
 *
 * @param pathname - Public pathname to resolve.
 * @param resolvedTargets - Bootstrapped lightweight target configs.
 * @returns Target/file resolution result for the pathname.
 */
export const resolveRouteHandlerLazyRequest = async (
  pathname: string,
  resolvedTargets: Array<RouteHandlerLazyResolvedTarget>
): Promise<RouteHandlerLazyRequestResolution> => {
  const matchedTargetRequest = resolveMatchedTargetRequest(
    pathname,
    resolvedTargets
  );

  if (matchedTargetRequest == null) {
    // Requests outside every configured splitter target are not candidates for
    // future lazy route analysis. They should continue through normal app
    // routing untouched.
    return {
      kind: 'no-target',
      pathname
    };
  }

  const { config, identity } = matchedTargetRequest;
  const matchedRoutePath = await resolveLocalizedContentRoute({
    contentPagesDir: config.paths.contentPagesDir,
    localeConfig: config.localeConfig,
    contentLocaleMode: config.contentLocaleMode,
    identity
  });

  if (matchedRoutePath == null) {
    // This branch is the key separation for future lazy work: the pathname
    // belongs to a configured target shape, but there is no backing content
    // file. That should remain a pass-through result, not a generation error.
    return {
      kind: 'missing-route-file',
      pathname,
      config,
      identity
    };
  }

  return {
    kind: 'matched-route-file',
    pathname,
    config,
    identity,
    routePath: matchedRoutePath
  };
};
