import { createConfigError } from '../../../utils/errors';
import { isUndefined } from '../../../utils/type-guards';
import { isNonEmptyString } from '../../shared/config/shared';

export const DEFAULT_APP_LOCALE_ROUTE_PARAM_NAME = 'locale';

/**
 * Describes whether App Router locale routing requires a physical filesystem
 * route param.
 *
 * 1. `none` means the App target has no locale config and generated routes
 *    stay outside a locale segment, for example `app/docs/...`.
 * 2. `param` means generated routes must be emitted below a locale param
 *    segment, for example `app/[locale]/docs/...`.
 * 3. `name` is the bare route-param name without brackets. Next filesystem
 *    syntax adds the brackets when constructing paths.
 */
export type AppLocaleRouteParamPolicy =
  | {
      /**
       * Policy discriminator for single-locale App targets.
       */
      kind: 'none';
    }
  | {
      /**
       * Policy discriminator for locale-scoped App targets.
       */
      kind: 'param';
      /**
       * Bare App route-param name, for example `locale` for `[locale]` or
       * `lang` for `[lang]`.
       */
      name: string;
    };

/**
 * Resolve the App Router filesystem param policy used for locale routing.
 *
 * 1. Without App locale config, no physical locale route segment exists.
 * 2. With App locale config, the physical route segment defaults to `[locale]`.
 * 3. A custom value names the route param only; brackets are filesystem syntax
 *    and must not be included.
 * 4. Invalid partial locale setup throws instead of creating a half-enabled
 *    locale layer.
 *
 * @param hasLocaleConfig - Whether App locale semantics were configured.
 * @param configuredLocaleRouteParamName - Raw configured locale route param.
 * @returns Explicit App locale route-param policy.
 */
export const resolveAppLocaleRouteParamPolicy = (
  hasLocaleConfig: boolean,
  configuredLocaleRouteParamName: unknown
): AppLocaleRouteParamPolicy => {
  if (!hasLocaleConfig) {
    if (!isUndefined(configuredLocaleRouteParamName)) {
      throw createConfigError(
        'routeHandlersConfig.app.localeRouteParamName requires routeHandlersConfig.app.localeConfig.'
      );
    }

    return {
      kind: 'none'
    };
  }

  if (isUndefined(configuredLocaleRouteParamName)) {
    return {
      kind: 'param',
      name: DEFAULT_APP_LOCALE_ROUTE_PARAM_NAME
    };
  }

  if (!isNonEmptyString(configuredLocaleRouteParamName)) {
    throw createConfigError(
      'routeHandlersConfig.app.localeRouteParamName must be a non-empty string when provided.'
    );
  }

  if (
    configuredLocaleRouteParamName.includes('/') ||
    configuredLocaleRouteParamName.startsWith('[') ||
    configuredLocaleRouteParamName.endsWith(']')
  ) {
    throw createConfigError(
      'routeHandlersConfig.app.localeRouteParamName must be the bare route param name, for example "locale" instead of "[locale]".'
    );
  }

  return {
    kind: 'param',
    name: configuredLocaleRouteParamName
  };
};

/**
 * Convert an explicit App locale route-param policy into the existing optional
 * config field used by the current integration pipeline.
 *
 * @param policy - Resolved App locale route-param policy.
 * @returns Param name for locale-scoped App routes, otherwise `undefined`.
 */
export const getAppLocaleRouteParamName = (
  policy: AppLocaleRouteParamPolicy
): string | undefined => {
  if (policy.kind === 'none') {
    return undefined;
  }

  return policy.name;
};
