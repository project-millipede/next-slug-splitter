import path from 'path';

import { findNextConfigPath } from '../next/config/find-next-config-path';
import { createCliError } from '../utils/errors';
import { isNonEmptyString } from '../utils/type-guards-extended';

/**
 * Resolve an explicit `--config` CLI argument to an absolute Next config path.
 *
 * @param argv Raw CLI arguments after the executable and script path.
 * @param rootDir Working directory used to resolve relative config paths.
 * @returns The absolute Next config path when `--config` is present, otherwise
 * `undefined`.
 * @throws If `--config` is present without a following path value.
 */
export const resolveConfigPathFromArgv = (
  argv: Array<string>,
  rootDir: string
): string | undefined => {
  const configFlagIndex = argv.findIndex(argument => argument === '--config');
  if (configFlagIndex === -1) {
    return undefined;
  }

  const configValue = argv[configFlagIndex + 1];
  if (!isNonEmptyString(configValue)) {
    throw createCliError(
      'Missing value for --config. Pass a path to your Next config file.'
    );
  }

  return path.isAbsolute(configValue)
    ? configValue
    : path.resolve(rootDir, configValue);
};

/**
 * Resolve the Next config path for the CLI by preferring `--config` and
 * falling back to default file discovery.
 *
 * @param argv - Raw CLI arguments after the executable and script path.
 * @param rootDir - Working directory used to resolve relative config paths.
 * @returns Resolved Next config path when one is available, otherwise
 * `undefined`.
 */
export const resolveNextConfigPath = (
  argv: Array<string>,
  rootDir: string
): string | undefined => {
  let nextConfigPath = resolveConfigPathFromArgv(argv, rootDir);
  if (nextConfigPath == null) {
    nextConfigPath = findNextConfigPath(rootDir);
  }

  return nextConfigPath;
};
