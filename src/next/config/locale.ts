import type { LocaleConfig } from '../../core/types';
import { createConfigError } from '../../utils/errors';
import type { NextConfigLike } from './load-next-config';

import { isNonEmptyString, isStringArray } from './shared';

/**
 * Input shape for resolving locale configuration.
 */
type NextConfigI18nInput = Pick<NextConfigLike, 'i18n'>;

/**
 * Resolve locale configuration from the loaded Next config.
 *
 * @param config - Loaded Next config subset containing `i18n`.
 * @returns Validated locale config used by route discovery and rewrite
 * generation.
 * @throws If required `i18n` fields are missing or inconsistent.
 */
export const resolveLocaleConfig = (
  config: NextConfigI18nInput
): LocaleConfig => {
  const i18nConfig = config.i18n;
  if (!i18nConfig || !isStringArray(i18nConfig.locales)) {
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

  return {
    locales: [...i18nConfig.locales],
    defaultLocale
  };
};
