import path from 'path';

import { createConfigError } from '../../../utils/errors';

import { isNonEmptyString } from './shared';

/**
 * Input for resolving a configured path option.
 */
export type ResolveConfiguredPathOptionInput = {
  /**
   * Application root directory.
   */
  rootDir: string;
  /**
   * Raw configured path value.
   */
  value: unknown;
  /**
   * Human-readable config label for error messages.
   */
  label: string;
};

/**
 * Resolve an optional config path value relative to the application root.
 *
 * @param input - Path resolution input.
 * @returns The resolved absolute path, or `undefined` when the option is not
 * provided.
 */
export const resolveConfiguredPathOption = ({
  rootDir,
  value,
  label
}: ResolveConfiguredPathOptionInput): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (!isNonEmptyString(value)) {
    throw createConfigError(`${label} must be a non-empty string path.`);
  }

  return path.isAbsolute(value) ? value : path.resolve(rootDir, value);
};
