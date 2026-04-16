import type {
  AppRouteParams,
  AppRouteStaticParamValue
} from './types';
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
};

const normalizeSlugArray = (
  slug: AppRouteStaticParamValue
): Array<string> | undefined => {
  if (slug == null) {
    return undefined;
  }

  return Array.isArray(slug) ? slug : [slug];
};

const deriveLocaleFromStaticParams = (
  _params: AppRouteStaticParams,
  localeConfig?: LocaleConfig
): string | undefined => {
  if (localeConfig == null) {
    return undefined;
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
