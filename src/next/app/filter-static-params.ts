import type {
  AppRouteParams,
  AppRouteStaticParamValue
} from './types';
import type { LocaleConfig } from '../../core/types';

export type { AppRouteStaticParamValue } from './types';
export type AppRouteStaticParams = AppRouteParams;

/**
 * Params-bag key under which locale travels on the App Router surface.
 *
 * Single source of truth shared by both sides of the multi-locale contract:
 * 1. the generator bakes `{ [APP_LOCALE_PARAM_NAME]: locale }` into a
 *    multi-locale handler's `handlerParams`, and
 * 2. {@link filterStaticParamsAgainstHeavyRoutes} reads it back to subtract
 *    heavy routes per their own locale.
 *
 * Keeping both sides on one constant stops the baked key and the read key from
 * silently drifting apart.
 */
export const APP_LOCALE_PARAM_NAME = 'locale';

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
   * Resolved locale config enabling locale-aware heavy-route subtraction.
   *
   * When present, each entry's locale is read from its
   * {@link APP_LOCALE_PARAM_NAME} param (multi-locale targets) and otherwise
   * falls back to `defaultLocale` (single-locale / default-locale mode). When
   * absent, locale filtering is disabled.
   */
  localeConfig?: LocaleConfig;
};

const normalizeSlugArray = (
  slug: AppRouteStaticParamValue
): Array<string> | undefined => {
  if (slug == null) {
    return undefined;
  }

  return Array.isArray(slug) ? slug : [slug];
};

/**
 * Derive the locale that owns one static-params entry.
 *
 * @remarks
 * Locale ownership resolves in priority order:
 * 1. **Per-entry locale param** — a multi-locale target carries its locale in
 *    the params bag under {@link APP_LOCALE_PARAM_NAME}; that value wins, so a
 *    slug heavy in one locale but light in another is subtracted precisely.
 * 2. **App-owned default** — single-locale targets (and default-locale content
 *    mode) omit the locale param, so `defaultLocale` is used. This is also the
 *    fallback when the param is missing or not a string.
 *
 * @param params - One static-params entry produced by the wrapped enumerator.
 * @param localeConfig - Resolved locale config; `undefined` disables locale
 *   filtering for the call.
 * @returns The owning locale, or `undefined` when locale filtering is disabled.
 */
const deriveLocaleFromStaticParams = (
  params: AppRouteStaticParams,
  localeConfig?: LocaleConfig
): string | undefined => {
  if (localeConfig == null) {
    return undefined;
  }

  const localeParamValue = params[APP_LOCALE_PARAM_NAME];
  return typeof localeParamValue === 'string' && localeParamValue.length > 0
    ? localeParamValue
    : localeConfig.defaultLocale;
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
    localeConfig
  }: FilterStaticParamsAgainstHeavyRoutesOptions = {}
): Promise<Array<TParams>> =>
  (async () => {
    const filteredParams: Array<TParams> = [];

    for (const params of allParams) {
      const slugArray = normalizeSlugArray(params[handlerRouteParamName]);
      const locale = deriveLocaleFromStaticParams(params, localeConfig);

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
