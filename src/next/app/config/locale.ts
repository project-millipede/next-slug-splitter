import { createSingleLocaleConfig } from '../../../core/locale-config';
import type { LocaleConfig } from '../../../core/types';
import { createConfigError } from '../../../utils/errors';
import { isUndefined } from '../../../utils/type-guards';
import {
  isNonEmptyString,
  isObjectRecord,
  isStringArray,
  readObjectProperty
} from '../../shared/config/shared';

import type {
  AppRouteHandlersLocaleConfig,
  RouteHandlersConfig
} from '../types';

const readConfiguredAppLocaleConfig = (
  routeHandlersConfig?: RouteHandlersConfig
): AppRouteHandlersLocaleConfig | undefined => {
  if (routeHandlersConfig == null) {
    return undefined;
  }

  const configuredApp = readObjectProperty(routeHandlersConfig, 'app');
  if (isUndefined(configuredApp)) {
    return undefined;
  }

  if (!isObjectRecord(configuredApp)) {
    throw createConfigError('routeHandlersConfig.app must be an object.');
  }

  const configuredLocaleConfig = readObjectProperty(
    configuredApp,
    'localeConfig'
  );

  if (isUndefined(configuredLocaleConfig)) {
    return undefined;
  }

  if (!isObjectRecord(configuredLocaleConfig)) {
    throw createConfigError(
      'routeHandlersConfig.app.localeConfig must be an object when provided.'
    );
  }

  const locales = readObjectProperty(configuredLocaleConfig, 'locales');
  const defaultLocale = readObjectProperty(
    configuredLocaleConfig,
    'defaultLocale'
  );

  if (!isStringArray(locales) || locales.length === 0) {
    throw createConfigError(
      'routeHandlersConfig.app.localeConfig.locales must be a non-empty string array.'
    );
  }

  if (!isNonEmptyString(defaultLocale)) {
    throw createConfigError(
      'routeHandlersConfig.app.localeConfig.defaultLocale must be a non-empty string.'
    );
  }

  if (!locales.includes(defaultLocale)) {
    throw createConfigError(
      `routeHandlersConfig.app.localeConfig.defaultLocale "${defaultLocale}" must be included in routeHandlersConfig.app.localeConfig.locales.`
    );
  }

  if (locales.length === 1) {
    throw createConfigError(
      'Single-locale App Router setups must omit routeHandlersConfig.app.localeConfig. Remove localeConfig instead of configuring one locale.'
    );
  }

  return {
    locales: [...locales],
    defaultLocale
  };
};

/**
 * Resolve structural locale semantics for the App Router boundary.
 *
 * @param routeHandlersConfig - App-owned route-handlers config.
 * @returns Normalized locale semantics for downstream shared code.
 */
export const resolveAppLocaleConfig = (
  routeHandlersConfig?: RouteHandlersConfig
): LocaleConfig => {
  const configuredLocaleConfig =
    readConfiguredAppLocaleConfig(routeHandlersConfig);

  return configuredLocaleConfig ?? createSingleLocaleConfig();
};
