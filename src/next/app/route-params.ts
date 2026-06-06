import { isSingleLocaleConfig } from '../../core/locale-config';

import type { LocaleConfig } from '../../core/types';

/**
 * App Router dynamic segment name used by locale-prefixed physical routes.
 *
 * Example:
 * app/[locale]/docs/[...slug]/page.tsx
 * params.locale === 'de'
 */
export const APP_LOCALE_ROUTE_PARAM_NAME = 'locale';

/**
 * Resolve the optional App Router locale route-param name for generated handler
 * pages.
 *
 * 1. Multi-locale App routes physically live under `[locale]`, so generated
 *    handlers need the locale param key: `'locale'`.
 * 2. Single-locale App routes do not have `[locale]`, so no locale param key
 *    exists and `undefined` is returned.
 *
 * @param localeConfig - App locale semantics for the current target.
 * @returns The locale route-param name for multi-locale targets; otherwise
 * undefined when no `[locale]` route segment exists.
 */
export const resolveOptionalAppLocaleRouteParamName = (
  localeConfig: LocaleConfig
): string | undefined => {
  if (isSingleLocaleConfig(localeConfig)) {
    return undefined;
  }

  return APP_LOCALE_ROUTE_PARAM_NAME;
};
