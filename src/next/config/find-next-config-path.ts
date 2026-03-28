import { existsSync } from 'node:fs';
import path from 'node:path';

/**
 * Supported default Next config filenames for CLI auto-discovery.
 *
 * @remarks
 * This list is only used when the CLI needs to locate a Next config file
 * without an explicit `--config` argument. Deeper route-handler code consumes
 * already-derived Next config values instead of threading config-file paths.
 */
export const DEFAULT_NEXT_CONFIG_FILENAMES = [
  'next.config.ts',
  'next.config.js',
  'next.config.mjs',
  'next.config.cjs'
] as const;

/**
 * Resolve the first supported Next config file that exists inside `rootDir`.
 *
 * @param rootDir - App root directory to search.
 * @returns The absolute Next config path when one of the supported default
 * filenames exists, otherwise `undefined`.
 */
export const findNextConfigPath = (rootDir: string): string | undefined => {
  for (const fileName of DEFAULT_NEXT_CONFIG_FILENAMES) {
    const nextConfigPath = path.resolve(rootDir, fileName);
    if (existsSync(nextConfigPath)) {
      return nextConfigPath;
    }
  }

  return undefined;
};
