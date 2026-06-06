import { isSingleLocaleConfig } from '../../../core/locale-config';
import type { LocaleConfig } from '../../../core/types';
import { createAbsoluteRewriteRoutePath } from '../../shared/rewrites/route-path';

/**
 * Check whether one internal rewrite destination already starts with a locale.
 *
 * @param rewriteDestination - Internal rewrite destination pathname.
 * @param localeConfig - Locale semantics captured by the generated proxy.
 * @returns `true` when the first path segment is a configured locale.
 */
const hasLeadingLocaleSegment = (
  rewriteDestination: string,
  localeConfig: LocaleConfig
): boolean => {
  const [leadingSegment] = rewriteDestination
    .split('/')
    .filter(segment => segment.length > 0);

  if (leadingSegment == null) {
    return false;
  }

  return localeConfig.locales.includes(leadingSegment);
};

/**
 * Preserve Pages Router locale context for one dev-proxy rewrite destination.
 *
 * 1. Shared rewrite entries stay locale-less.
 * 2. This helper runs only at the dev-proxy transport boundary.
 * 3. Pages Router i18n context is carried by the leading destination locale
 *    when `NextResponse.rewrite(...)` is materialized.
 * 4. Single-locale internal sentinels are never prefixed.
 * 5. Already-prefixed destinations are returned unchanged.
 * 6. This is the dev-proxy companion to
 *    https://github.com/project-millipede/next-slug-splitter/commit/2dc3dd716104cfda1324586eb55edc1f05da2a94,
 *    which made generated handler rewrite destinations locale-less in shared
 *    rewrite generation.
 *
 * @example
 * // Non-default locale heavy route
 * '/docs/generated-handlers/a/de' + 'de'
 *   -> '/de/docs/generated-handlers/a/de'
 *
 * // Already locale-prefixed destination
 * '/de/docs/generated-handlers/a/de' + 'de'
 *   -> '/de/docs/generated-handlers/a/de'
 *
 * @param rewriteDestination - Internal generated-handler destination.
 * @param locale - Locale resolved from the public request.
 * @param localeConfig - Locale semantics captured by the generated proxy.
 * @returns Destination path safe for Pages Router `NextResponse.rewrite`.
 */
export const preservePagesRouterLocaleInProxyRewriteDestination = (
  rewriteDestination: string,
  locale: string,
  localeConfig: LocaleConfig
): string => {
  if (isSingleLocaleConfig(localeConfig)) {
    return rewriteDestination;
  }

  if (!localeConfig.locales.includes(locale)) {
    return rewriteDestination;
  }

  if (hasLeadingLocaleSegment(rewriteDestination, localeConfig)) {
    return rewriteDestination;
  }

  return createAbsoluteRewriteRoutePath('/', locale, rewriteDestination);
};
