/**
 * Shared TypeScript resolution helpers for the preparation subsystem.
 *
 * @remarks
 * This file belongs to the preparation-cache group, but it intentionally does
 * not make cache decisions itself. Its job is to centralize one piece of
 * preparation identity and execution state that multiple callers care about:
 * resolving the app-local `typescript/lib/tsc.js` entry.
 *
 * Both the preparation execution layer and the preparation cache layer depend
 * on this resolution:
 * - execution needs the compiler path to actually run `tsc-project` tasks
 * - caching includes the compiler path in the tracked input set so changing
 *   the effective TypeScript installation invalidates cached preparations
 */
import { createRequire } from 'node:module';
import path from 'node:path';

import { createRuntimeError } from '../../utils/errors';

const APP_ROOT_PREPARE_RESOLUTION_ANCHOR = '__app_root_prepare__';

const createRequireFromRoot = (rootDir: string) =>
  createRequire(path.resolve(rootDir, APP_ROOT_PREPARE_RESOLUTION_ANCHOR));

/**
 * Resolve the app-local TypeScript compiler entry path (`tsc.js`).
 *
 * @param rootDir - Application root used as the resolution base.
 * @returns Absolute path to the TypeScript compiler entry.
 * @throws If `typescript` is not installed in the application.
 */
export const resolveAppLocalTypeScriptCompilerPath = ({
  rootDir
}: {
  rootDir: string;
}): string => {
  const requireFromRoot = createRequireFromRoot(rootDir);

  try {
    return requireFromRoot.resolve('typescript/lib/tsc.js');
  } catch {
    throw createRuntimeError(
      'Unable to resolve app-local TypeScript for routeHandlersConfig.app.prepare. Install "typescript" in the app or remove the "tsc-project" preparation task.',
      { rootDir }
    );
  }
};

/**
 * Try to resolve the app-local TypeScript compiler path without throwing.
 *
 * @param rootDir - Application root used as the resolution base.
 * @returns Absolute path when available, otherwise `undefined`.
 */
export const tryResolveAppLocalTypeScriptCompilerPath = ({
  rootDir
}: {
  rootDir: string;
}): string | undefined => {
  try {
    return resolveAppLocalTypeScriptCompilerPath({ rootDir });
  } catch {
    return undefined;
  }
};
