import { isSingleLocaleConfig } from '../../../core/locale-config';
import type { LocaleConfig } from '../../../core/types';
import { toRoutePathSegments } from '../../../utils/route-path';
import { createAbsoluteRewriteRoutePath } from '../../shared/rewrites/route-path';

/**
 * Check whether one Pages Router rewrite destination already carries a leading
 * locale segment.
 *
 * 1. Only the first route path segment is inspected.
 * 2. Locale-looking segments later in the destination are handler identity, not
 *    Pages Router routing locale.
 * 3. Existing locale-prefixed destinations must not be prefixed again.
 *
 * @example
 * // Locale-prefixed destination
 * '/de/docs/generated-handlers/a/de' -> true
 *
 * // Locale-less destination with locale handler suffix
 * '/docs/generated-handlers/a/de' -> false
 *
 * // Empty/root destination
 * '/' -> false
 *
 * @param rewriteDestination - Internal rewrite destination pathname.
 * @param localeConfig - Locale semantics for the Pages application.
 * @returns `true` when the first path segment is a configured locale.
 */
const hasLeadingLocaleSegment = (
  rewriteDestination: string,
  localeConfig: LocaleConfig
): boolean => {
  const [leadingSegment] = toRoutePathSegments(rewriteDestination);

  if (leadingSegment == null) {
    return false;
  }

  return localeConfig.locales.includes(leadingSegment);
};

/**
 * Preserve Pages Router locale context in one rewrite destination.
 *
 * 1. Stable multi-locale rewrite tables and dev-proxy transport both carry
 *    Pages i18n context through the leading destination locale.
 * 2. Single-locale internal sentinels are never prefixed.
 * 3. Unknown locales do not modify the destination.
 * 4. Already-prefixed destinations are returned unchanged.
 *
 * @example
 * // Non-default locale heavy route
 * '/docs/generated-handlers/a/de' + 'de'
 *   -> '/de/docs/generated-handlers/a/de'
 *
 * // Default locale heavy route
 * '/docs/generated-handlers/a/en' + 'en'
 *   -> '/en/docs/generated-handlers/a/en'
 *
 * // Already locale-prefixed destination
 * '/de/docs/generated-handlers/a/de' + 'de'
 *   -> '/de/docs/generated-handlers/a/de'
 *
 * @param rewriteDestination - Internal generated-handler destination.
 * @param locale - Locale owned by the route being rewritten.
 * @param localeConfig - Locale semantics for the Pages application.
 * @returns Destination path carrying the required Pages locale context.
 */
export const preservePagesRouterLocaleInRewriteDestination = (
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
