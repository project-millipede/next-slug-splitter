import type { LocaleConfig } from './types';

const INTERNAL_SINGLE_LOCALE = '__next_slug_splitter_single_locale__';

/**
 * Create the private single-locale configuration used by internal planning
 * code when no public multi-locale config exists.
 *
 * @returns The normalized single-locale config.
 */
export const createSingleLocaleConfig = (): LocaleConfig => ({
  locales: [INTERNAL_SINGLE_LOCALE],
  defaultLocale: INTERNAL_SINGLE_LOCALE
});

/**
 * Clone one locale-config object defensively.
 *
 * @param localeConfig Locale config to copy.
 * @returns A shallow copy with a copied locales array.
 */
export const cloneLocaleConfig = (localeConfig: LocaleConfig): LocaleConfig => ({
  locales: [...localeConfig.locales],
  defaultLocale: localeConfig.defaultLocale
});

/**
 * Determine whether a locale config represents the library's internal
 * single-locale normalization.
 *
 * @param localeConfig Locale config to inspect.
 * @returns `true` when the config represents exactly one locale.
 */
export const isSingleLocaleConfig = (localeConfig: LocaleConfig): boolean =>
  localeConfig.locales.length === 1 &&
  localeConfig.locales[0] === localeConfig.defaultLocale;

/**
 * Determine whether a locale config has more than one configured locale.
 *
 * This is the precise `L > 1` test that gates the Pages fan-out fix: at
 * `L > 1` a fixed handler page is prerendered once per configured locale, so
 * the handler moves under an optional catch-all leaf and pins its locale via
 * `getStaticPaths`. At `L = 1` there is no fan-out and the concrete page stays.
 *
 * @param localeConfig Locale config to inspect.
 * @returns `true` when more than one locale is configured.
 */
export const isMultiLocaleConfig = (localeConfig: LocaleConfig): boolean =>
  localeConfig.locales.length > 1;

/**
 * Compare two locale-config objects for exact structural equality.
 *
 * @param left Expected locale semantics.
 * @param right Candidate locale semantics.
 * @returns `true` when both configs have the same default locale and locale order.
 */
export const doLocaleConfigsMatch = (
  left: LocaleConfig,
  right: LocaleConfig
): boolean =>
  left.defaultLocale === right.defaultLocale &&
  left.locales.length === right.locales.length &&
  left.locales.every((locale, index) => locale === right.locales[index]);
