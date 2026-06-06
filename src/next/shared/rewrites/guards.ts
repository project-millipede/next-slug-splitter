import {
  removeLocalePrefix,
  toSourcePathSegments
} from '../public-pathname';
import type { LocaleConfig } from '../../../core/types';
import type { RouteHandlerRewrite } from '../types';
import { createAbsoluteRewriteRoutePath } from './route-path';

export const ROUTE_HANDLER_PUBLIC_GUARD_DESTINATION = '/404';

/**
 * Config-derived target shape used by route-handler public guards.
 */
export type RouteHandlerGuardTarget = {
  /**
   * Public route base path owned by the target.
   */
  routeBasePath: string;
  /**
   * Internal generated-handler route segment.
   */
  handlerRouteSegment?: string;
};

/**
 * Escape one configured locale for use inside a Next route matcher pattern.
 *
 * 1. Locale names are configuration values, not pattern syntax.
 * 2. Characters with regular-expression meaning must be treated literally.
 * 3. The escaped locale is used inside `:locale(...)` route constraints.
 *
 * @param value - Configured locale name.
 * @returns Locale value safe for a route matcher pattern.
 */
const escapeRouteMatcherPatternSegment = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Build the locale route matcher segment used by generated-handler guards.
 *
 * 1. The segment matches one configured locale at the front of a public URL.
 * 2. The locale values are escaped before being joined into the matcher pattern.
 * 3. The returned value is a route fragment, not a full route path.
 *
 * @param localeConfig - Locale semantics for the current app.
 * @returns Dynamic locale route matcher fragment.
 */
const createLocaleMatcherRouteFragment = (
  localeConfig: LocaleConfig
): string => {
  const localeMatcherPattern = localeConfig.locales
    .map(locale => escapeRouteMatcherPatternSegment(locale))
    .join('|');

  return `:locale(${localeMatcherPattern})`;
};

/**
 * Create one public generated-handler guard rewrite.
 *
 * 1. The source points at a public URL shape that must not be user-addressable.
 * 2. The destination is the stable 404 route.
 * 3. `locale: false` keeps Next from adding its own locale variants.
 *
 * @param source - Public generated-handler URL pattern to block.
 * @returns Guard rewrite for the supplied source pattern.
 */
const createRouteHandlerGuardRewrite = (
  source: string
): RouteHandlerRewrite => ({
  source,
  destination: ROUTE_HANDLER_PUBLIC_GUARD_DESTINATION,
  locale: false
});

/**
 * Decide whether source path segments begin with one generated-handler guard
 * prefix.
 *
 * Input arrays:
 * 1. `sourcePathSegments` is derived from the browser-visible source URL.
 *    Example:
 *    `/a/generated-handlers/x` -> ['a', 'generated-handlers', 'x']
 *
 * 2. `guardPrefixSegments` is derived from target config.
 *    Example:
 *    `{ routeBasePath: '/a', handlerRouteSegment: 'generated-handlers' }`
 *    -> ['a', 'generated-handlers']
 *
 * Output:
 * `true` means the source URL should be blocked.
 * `false` means the source URL should stay public.
 *
 * @param sourcePathSegments - Segments from the browser-visible source URL.
 * @param guardPrefixSegments - Segments from target config that form the
 * generated-handler guard prefix.
 * @returns Whether the source URL starts with the guard prefix.
 */
const matchesGuardPrefix = (
  sourcePathSegments: ReadonlyArray<string>,
  guardPrefixSegments: ReadonlyArray<string>
): boolean => {
  if (sourcePathSegments.length < guardPrefixSegments.length) {
    return false;
  }

  return guardPrefixSegments.every(
    (guardPrefixSegment, segmentIndex) =>
      sourcePathSegments[segmentIndex] === guardPrefixSegment
  );
};

/**
 * Check whether one browser-visible rewrite source pathname targets a generated
 * handler path.
 *
 * 1. This helper checks rewrite sources, not rewrite destinations.
 * 2. Source paths may be unprefixed.
 *    Example:
 *    `/a/generated-handlers/x`
 *
 * 3. Source paths may also be locale-prefixed.
 *    Example:
 *    `/de/a/generated-handlers/x/de`
 *
 * 4. For each target, the guarded source prefix is derived from config:
 *    `routeBasePath` segments + `handlerRouteSegment`.
 *    Example:
 *    `{ routeBasePath: '/a', handlerRouteSegment: 'generated-handlers' }`
 *    -> ['a', 'generated-handlers']
 *
 * 5. Matching is segment-based, so similar names do not match accidentally.
 *    Example:
 *    `/a/generated-handlers-extra/x` -> false
 *
 * @param sourcePathname - Browser-visible rewrite source pathname.
 * @param localeConfig - Locale semantics for the current app.
 * @param guardTargets - Config-derived generated-handler guard targets.
 * @returns `true` when the source pathname targets a generated handler path.
 */
export const isGeneratedHandlerSourcePath = (
  sourcePathname: string,
  localeConfig: LocaleConfig,
  guardTargets: ReadonlyArray<RouteHandlerGuardTarget>
): boolean => {
  const sourcePathSegments = toSourcePathSegments(sourcePathname);
  const localeLessSourcePathSegments = removeLocalePrefix(
    sourcePathSegments,
    localeConfig
  );

  return guardTargets.some(({ routeBasePath, handlerRouteSegment }) => {
    const guardPrefixSegments = [
      ...toSourcePathSegments(routeBasePath),
      handlerRouteSegment ?? 'generated-handlers'
    ];

    return (
      matchesGuardPrefix(sourcePathSegments, guardPrefixSegments) ||
      matchesGuardPrefix(localeLessSourcePathSegments, guardPrefixSegments)
    );
  });
};

/**
 * Build generated-handler public access guards for one resolved target.
 *
 * 1. The unprefixed guard blocks the actual generated-handler public shape.
 * 2. The locale-prefixed guard blocks the same reserved segment under every
 *    configured locale prefix.
 * 3. Route paths are built from target-local config; no route name, locale, or
 *    handler segment is hardcoded.
 * 4. Root targets are slash-normalized by `createAbsoluteRewriteRoutePath`.
 *
 * @param input - Guard construction input.
 * @param input.localeConfig - Locale semantics for the current app.
 * @param input.routeBasePath - Public route base path owned by the target.
 * @param input.handlerRouteSegment - Internal generated-handler route segment.
 * @returns Guard rewrites for direct generated-handler public access.
 */
export const buildRouteHandlerGuards = ({
  localeConfig,
  routeBasePath,
  handlerRouteSegment = 'generated-handlers'
}: {
  localeConfig: LocaleConfig;
  routeBasePath: string;
  handlerRouteSegment?: string;
}): Array<RouteHandlerRewrite> => {
  const unprefixedGuardSource = createAbsoluteRewriteRoutePath(
    routeBasePath,
    handlerRouteSegment,
    ':path*'
  );
  const localePrefixedGuardSource = createAbsoluteRewriteRoutePath(
    '/',
    createLocaleMatcherRouteFragment(localeConfig),
    routeBasePath,
    handlerRouteSegment,
    ':path*'
  );

  return [
    createRouteHandlerGuardRewrite(unprefixedGuardSource),
    createRouteHandlerGuardRewrite(localePrefixedGuardSource)
  ];
};
