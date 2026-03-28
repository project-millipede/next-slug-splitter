import {
  resolveLocalizedContentRoute
} from '../../../core/discovery';
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
 * Split a public pathname into normalized path segments.
 *
 * @param pathname - Public pathname without query string.
 * @returns Ordered non-empty path segments.
 */
const toPathSegments = (pathname: string): Array<string> =>
  pathname.split('/').filter(segment => segment.length > 0);

/**
 * Split a configured route base path into normalized path segments.
 *
 * @param routeBasePath - Normalized target route base path.
 * @returns Ordered base-path segments.
 */
const toRouteBasePathSegments = (routeBasePath: string): Array<string> =>
  routeBasePath === '/'
    ? []
    : routeBasePath.split('/').filter(segment => segment.length > 0);

/**
 * Check whether one ordered segment array starts with another.
 *
 * @param segments - Candidate full segment list.
 * @param prefixSegments - Required prefix.
 * @returns `true` when `segments` starts with `prefixSegments`.
 */
const hasSegmentPrefix = (
  segments: Array<string>,
  prefixSegments: Array<string>
): boolean =>
  prefixSegments.every((segment, index) => segments[index] === segment);

/**
 * Try to derive one locale-aware request identity for a specific target config.
 *
 * @param pathname - Public pathname to interpret.
 * @param config - Candidate target config that may own the pathname.
 * @returns Locale/slug identity when the target owns the pathname, otherwise
 * `null`.
 *
 * @remarks
 * Matching rules intentionally mirror the existing rewrite behavior:
 * - locale-prefixed paths are accepted for any configured locale
 * - locale-less paths resolve to the default locale
 * - locale-prefixed matching is checked first so `/de/...` for a root target is
 *   interpreted as locale `de`, not as a default-locale slug starting with
 *   `"de"`
 */
const resolveRequestIdentityForConfig = (
  pathname: string,
  config: RouteHandlerLazyResolvedTarget
): RouteHandlerLazyRequestIdentity | null => {
  const pathnameSegments = toPathSegments(pathname);
  const routeBasePathSegments = toRouteBasePathSegments(config.routeBasePath);
  const [firstSegment] = pathnameSegments;

  if (
    typeof firstSegment === 'string' &&
    config.localeConfig.locales.includes(firstSegment)
  ) {
    const remainingSegments = pathnameSegments.slice(1);

    if (
      hasSegmentPrefix(remainingSegments, routeBasePathSegments)
    ) {
      // Locale-prefixed public paths are resolved directly to the explicit
      // locale carried in the URL. The slug is whatever remains after the route
      // base path.
      return {
        pathname,
        locale: firstSegment,
        slugArray: remainingSegments.slice(routeBasePathSegments.length)
      };
    }
  }

  if (
    !hasSegmentPrefix(pathnameSegments, routeBasePathSegments)
  ) {
    return null;
  }

  // Locale-less public paths are treated as default-locale requests. This
  // mirrors the existing rewrite behavior for default-locale heavy routes.
  return {
    pathname,
    locale: config.localeConfig.defaultLocale,
    slugArray: pathnameSegments.slice(routeBasePathSegments.length)
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
