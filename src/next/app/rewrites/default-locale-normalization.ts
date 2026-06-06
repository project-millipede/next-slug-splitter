import { toRoutePath } from '../../../core/discovery';
import { isSingleLocaleConfig } from '../../../core/locale-config';
import type { LocaleConfig } from '../../../core/types';
import { createAbsoluteRewriteRoutePath } from '../../shared/rewrites/route-path';
import { hasNonRootRouteBasePath } from '../../shared/route-base-path';

import type { RouteHandlerRewrite } from '../../shared/types';

/**
 * Build the physical App Router path that owns a default-locale
 * request.
 *
 * @param localeConfig - App-owned multi-locale semantics.
 * @param routeBasePath - Target route base path.
 * @param slugArray - Requested slug segments.
 * @returns Physical locale-prefixed App route path.
 */
export const buildPhysicalAppDefaultLocaleRoutePath = (
  localeConfig: LocaleConfig,
  routeBasePath: string,
  slugArray: Array<string>
): string =>
  createAbsoluteRewriteRoutePath(
    '/',
    localeConfig.defaultLocale,
    toRoutePath(routeBasePath, slugArray)
  );

/**
 * Build config-derived App default-locale normalization rewrites.
 *
 * Normalization rules:
 * 1. Multi-locale App targets use a physical `[locale]` route segment.
 *    Example:
 *    `/docs/a` -> `/en/docs/a`
 *
 * 2. The rewrite is config-derived only.
 *    It uses `localeConfig.defaultLocale` and `routeBasePath`; it does not use
 *    heavy-route analysis or generated-handler output.
 *
 * Route-base context:
 * `routeBasePath` is the normalized public base path owned by one target.
 * Example:
 * `/docs` owns `/docs` and `/docs/:path*`.
 *
 * Warning:
 * Root targets intentionally return no normalization rewrites.
 *
 * This situation happens when a target is configured with `routeBasePath: '/'`.
 * In that setup, the target has no public URL namespace like `/docs`.
 *
 * A root catch-all normalization would therefore look like:
 * `/:path* -> /en/:path*`
 *
 * That rewrite is too broad because it would also match framework, API, and
 * public asset URLs unless the library maintained a fragile blacklist.
 *
 * @param localeConfig - Locale semantics for App route normalization.
 * @param routeBasePath - Public route base path owned by one App target.
 * @returns Deterministically ordered normalization rewrites.
 */
export const buildAppDefaultLocaleNormalizationRewrites = (
  localeConfig: LocaleConfig,
  routeBasePath: string
): Array<RouteHandlerRewrite> => {
  if (isSingleLocaleConfig(localeConfig)) {
    return [];
  }

  if (!hasNonRootRouteBasePath(routeBasePath)) {
    return [];
  }

  return [
    {
      source: routeBasePath,
      destination: buildPhysicalAppDefaultLocaleRoutePath(
        localeConfig,
        routeBasePath,
        []
      ),
      locale: false
    },
    {
      source: `${routeBasePath}/:path*`,
      destination: `/${localeConfig.defaultLocale}${routeBasePath}/:path*`,
      locale: false
    }
  ];
};
