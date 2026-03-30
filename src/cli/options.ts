import path from 'path';

import type { LocaleConfig } from '../core/types';
import { createCliError } from '../utils/errors';
import { isNonEmptyString } from '../utils/type-guards-extended';

const resolveFlagValueFromArgv = (
  argv: Array<string>,
  flag: string
): string | undefined => {
  const flagIndex = argv.findIndex(argument => argument === flag);
  if (flagIndex === -1) {
    return undefined;
  }

  const value = argv[flagIndex + 1];
  return isNonEmptyString(value) ? value : '';
};

/**
 * Resolve an explicit route-handlers config CLI argument to an absolute module
 * path.
 *
 * @param argv - Raw CLI arguments after the executable and script path.
 * @param rootDir - Working directory used to resolve relative config paths.
 * @returns Absolute config path.
 * @throws If the flag is missing or has no value.
 */
export const resolveRouteHandlersConfigPathFromArgv = (
  argv: Array<string>,
  rootDir: string
): string => {
  const configPath = resolveFlagValueFromArgv(
    argv,
    '--route-handlers-config-path'
  );

  if (configPath == null) {
    throw createCliError(
      'Missing --route-handlers-config-path. Pass a path to your route-handlers config file.'
    );
  }

  if (!isNonEmptyString(configPath)) {
    throw createCliError(
      'Missing value for --route-handlers-config-path. Pass a path to your route-handlers config file.'
    );
  }

  return path.isAbsolute(configPath)
    ? configPath
    : path.resolve(rootDir, configPath);
};

/**
 * Resolve explicit locale semantics from CLI arguments.
 *
 * @param argv - Raw CLI arguments after the executable and script path.
 * @returns Validated locale configuration.
 * @throws If locale flags are missing or invalid.
 */
export const resolveLocaleConfigFromArgv = (
  argv: Array<string>
): LocaleConfig => {
  const localesValue = resolveFlagValueFromArgv(argv, '--locales');
  if (localesValue == null) {
    throw createCliError(
      'Missing --locales. Pass a comma-separated locale list.'
    );
  }

  if (!isNonEmptyString(localesValue)) {
    throw createCliError(
      'Missing value for --locales. Pass a comma-separated locale list.'
    );
  }

  const defaultLocale = resolveFlagValueFromArgv(argv, '--default-locale');
  if (defaultLocale == null) {
    throw createCliError(
      'Missing --default-locale. Pass the default locale from --locales.'
    );
  }

  if (!isNonEmptyString(defaultLocale)) {
    throw createCliError(
      'Missing value for --default-locale. Pass the default locale from --locales.'
    );
  }

  const locales = localesValue.split(',').map(locale => locale.trim());
  if (locales.some(locale => locale.length === 0)) {
    throw createCliError('--locales must not contain empty locale entries.');
  }

  if (new Set(locales).size !== locales.length) {
    throw createCliError('--locales must not contain duplicate locales.');
  }

  if (!locales.includes(defaultLocale)) {
    throw createCliError(
      `--default-locale "${defaultLocale}" must be included in --locales.`
    );
  }

  return {
    locales,
    defaultLocale
  };
};
