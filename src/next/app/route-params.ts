import { isSingleLocaleConfig } from '../../core/locale-config';

import type { LocaleConfig } from '../../core/types';

/**
 * Resolve the optional App Router locale route-param name for generated handler
 * pages.
 *
 * 1. Multi-locale App routes physically live under the configured locale route
 *    param, so generated handlers need that param key.
 * 2. Single-locale App routes do not have `[locale]`, so no locale param key
 *    exists and `undefined` is returned.
 *
 * @param localeConfig - App locale semantics for the current target.
 * @param localeRouteParamName - Physical App Router dynamic segment name that
 * carries the locale.
 * @returns The locale route-param name for multi-locale targets; otherwise
 * undefined when no locale route segment exists.
 */
export const resolveOptionalAppLocaleRouteParamName = (
  localeConfig: LocaleConfig,
  localeRouteParamName?: string
): string | undefined => {
  if (isSingleLocaleConfig(localeConfig)) {
    return undefined;
  }

  return localeRouteParamName;
};
