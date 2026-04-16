import { createSingleLocaleConfig } from '../../../core/locale-config';
import type { LocaleConfig } from '../../../core/types';
import { createConfigError } from '../../../utils/errors';
import type { NextConfigLike } from '../../shared/config/load-next-config';

import { isNonEmptyString, isStringArray } from '../../shared/config/shared';

type NextConfigI18nInput = Pick<NextConfigLike, 'i18n'>;

/**
 * Resolve structural locale semantics from the Next Pages Router config.
 *
 * @param config - Loaded Next config subset containing `i18n`.
 * @returns Normalized locale semantics for downstream shared code.
 */
export const resolvePagesLocaleConfig = (
  config: NextConfigI18nInput
): LocaleConfig => {
  const i18nConfig = config.i18n;
  if (!i18nConfig) {
    return createSingleLocaleConfig();
  }

  if (!isStringArray(i18nConfig.locales) || i18nConfig.locales.length === 0) {
    throw createConfigError(
      'Configured Next config file must define i18n.locales.'
    );
  }

  const defaultLocale = i18nConfig.defaultLocale;
  if (!isNonEmptyString(defaultLocale)) {
    throw createConfigError(
      'Configured Next config file must define i18n.defaultLocale.'
    );
  }

  if (!i18nConfig.locales.includes(defaultLocale)) {
    throw createConfigError(
      `i18n.defaultLocale "${defaultLocale}" is not in i18n.locales.`
    );
  }

  if (i18nConfig.locales.length === 1) {
    throw createConfigError(
      'Single-locale Pages Router setups must omit Next i18n config. Remove i18n instead of configuring one locale.'
    );
  }

  return {
    locales: [...i18nConfig.locales],
    defaultLocale
  };
};
