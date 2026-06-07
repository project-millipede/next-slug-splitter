import type { AppRouteParams, AppRouteStaticParamValue } from './types';
import type { LocaleConfig } from '../../core/types';

export type { AppRouteStaticParamValue } from './types';
export type AppRouteStaticParams = AppRouteParams;

export type AppRouteGenerateStaticParams<
  TArgs extends Array<unknown> = [],
  TParams extends AppRouteStaticParams = AppRouteStaticParams
> = (...args: TArgs) => Promise<Array<TParams>> | Array<TParams>;

export type FilterStaticParamsAgainstHeavyRoutesOptions = {
  /**
   * Dynamic route param name in the generated static params objects.
   *
   * This is a pure helper option for callers whose param objects do not use
   * the conventional `slug` key. App target config no longer exposes a
   * separate slug-param override; generated App handlers always use
   * `handlerRouteParam.name`.
   */
  handlerRouteParamName?: string;
  /**
   * Declarative locale config used to derive locale structurally from params.
   */
  localeConfig?: LocaleConfig;
  /**
   * Physical App Router dynamic segment name that carries the locale.
   */
  localeRouteParamName?: string;
};

/**
 * Normalize one App route param value into slug segments.
 *
 * 1. Single dynamic params such as `[slug]` arrive as a string.
 * 2. Catch-all params such as `[...slug]` arrive as an array.
 * 3. Missing params return `undefined` so the caller can keep entries that
 *    cannot be matched structurally against heavy routes.
 *
 * @example
 * // Single dynamic segment
 * 'a' -> ['a']
 *
 * // Catch-all segments
 * ['a', 'b'] -> ['a', 'b']
 *
 * // Missing param
 * undefined -> undefined
 *
 * @param slug - App static-param value read from the configured slug key.
 * @returns Slug segments, or `undefined` when the param is missing.
 */
const normalizeSlugArray = (
  slug: AppRouteStaticParamValue
): Array<string> | undefined => {
  if (slug == null) {
    return undefined;
  }

  return Array.isArray(slug) ? slug : [slug];
};

/**
 * Resolve the locale carried by one App Router static-params entry.
 *
 * Source of the value:
 * 1. App Router static params mirror dynamic route segment names.
 * 2. For a physical locale segment such as `[locale]` or `[lang]`, the locale
 *    is carried under the configured `localeRouteParamName`.
 * 3. Slug or catch-all params are independent and are not used to infer locale.
 *
 * Resolution rules:
 * 1. Without locale config, static params are treated as locale-independent.
 * 2. A string value at `params[localeRouteParamName]` wins.
 * 3. Missing or non-string locale values fall back to the configured default
 *    locale, allowing default-locale params to omit the explicit locale field.
 *
 * @example
 * // Physical App route:
 * // app/[locale]/docs/[...slug]/page.tsx
 * // Static params:
 * params: { locale: 'de', slug: ['a'] } -> 'de'
 *
 * // Default-locale fallback:
 * // app/[locale]/docs/[...slug]/page.tsx
 * // Static params:
 * params: { slug: ['a'] } -> 'en'
 *
 * // No locale config:
 * // app/docs/[...slug]/page.tsx
 * // Static params:
 * params: { slug: ['a'] } -> undefined
 *
 * @param params - One static-params entry returned by `generateStaticParams`.
 * @param localeConfig - Optional locale semantics for the App target.
 * @param localeRouteParamName - Optional physical App Router locale param name.
 * @returns Resolved locale, or `undefined` when locale filtering is disabled.
 */
const deriveLocaleFromStaticParams = (
  params: AppRouteStaticParams,
  localeConfig?: LocaleConfig,
  localeRouteParamName?: string
): string | undefined => {
  if (localeConfig == null) {
    return undefined;
  }

  if (localeRouteParamName != null) {
    const explicitLocale = params[localeRouteParamName];

    if (typeof explicitLocale === 'string') {
      return explicitLocale;
    }
  }

  return localeConfig.defaultLocale;
};

/**
 * Filter `generateStaticParams` entries against heavy-route ownership.
 *
 * @param allParams - Full static-params list before heavy-route filtering.
 * @param isHeavyRoute - Semantic heavy-route membership check for one target.
 * @param options - Dynamic-param/locale parameter options.
 * @returns The filtered static-params list.
 */
export const filterStaticParamsAgainstHeavyRoutes = <
  TParams extends AppRouteStaticParams
>(
  allParams: Array<TParams>,
  isHeavyRoute: (locale: string, slugArray: Array<string>) => boolean,
  {
    handlerRouteParamName = 'slug',
    localeConfig,
    localeRouteParamName
  }: FilterStaticParamsAgainstHeavyRoutesOptions = {}
): Promise<Array<TParams>> =>
  (async () => {
    const filteredParams: Array<TParams> = [];

    for (const params of allParams) {
      const slugArray = normalizeSlugArray(params[handlerRouteParamName]);
      const locale = deriveLocaleFromStaticParams(
        params,
        localeConfig,
        localeRouteParamName
      );

      if (slugArray == null || locale == null) {
        filteredParams.push(params);
        continue;
      }

      if (!isHeavyRoute(locale, slugArray)) {
        filteredParams.push(params);
      }
    }

    return filteredParams;
  })();
