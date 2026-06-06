export const DEFAULT_LOCALE = 'en';
export const SUPPORTED_LOCALES = ['en', 'de'] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Type guard for the supported App demo locales.
 *
 * 1. `SUPPORTED_LOCALES` is the source of truth.
 * 2. A `true` result narrows the input string to `SupportedLocale`.
 *
 * @example
 * // Supported locale
 * 'de' -> true
 *
 * // Unsupported locale
 * 'fr' -> false
 *
 * @param value - String value to check.
 * @returns `true` when the value is a supported locale.
 */
export const isSupportedLocale = (value: string): value is SupportedLocale =>
  SUPPORTED_LOCALES.includes(value as SupportedLocale);

/**
 * Return a supported locale, falling back to the default locale when needed.
 *
 * 1. Supported locale values are returned unchanged.
 * 2. Missing values fall back to the default locale.
 * 3. Unsupported values also fall back to the default locale.
 *
 * @example
 * // Supported locale
 * 'de' -> 'de'
 *
 * // Missing locale
 * undefined -> 'en'
 *
 * // Unsupported locale
 * 'fr' -> 'en'
 *
 * @param value - Locale string to resolve.
 * @returns Supported locale value.
 */
export const resolveSupportedLocale = (
  value: string | undefined
): SupportedLocale => {
  if (value != null && isSupportedLocale(value)) {
    return value;
  }

  return DEFAULT_LOCALE;
};

/**
 * Create the navigation href for one App demo locale from a locale-free
 * pathname.
 *
 * 1. The default locale keeps the pathname unchanged.
 * 2. Non-default locales add their locale segment at the front.
 * 3. The root pathname is handled without adding a trailing slash.
 *
 * @example
 * // Default locale
 * createHrefForLocale('en', '/docs/a') -> '/docs/a'
 *
 * // Non-default locale
 * createHrefForLocale('de', '/docs/a') -> '/de/docs/a'
 *
 * // Root pathname
 * createHrefForLocale('de', '/') -> '/de'
 *
 * @param locale - App demo locale to create the href for.
 * @param activePathname - Active page pathname used for language links.
 * @returns Browser href for the requested locale.
 */
export const createHrefForLocale = (
  locale: SupportedLocale,
  activePathname: string
): string => {
  if (locale === DEFAULT_LOCALE) {
    return activePathname;
  }

  if (activePathname === '/') {
    return `/${locale}`;
  }

  return `/${locale}${activePathname}`;
};
