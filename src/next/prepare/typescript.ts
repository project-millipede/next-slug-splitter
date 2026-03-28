/**
 * Shared TypeScript resolution helpers for the preparation subsystem.
 *
 * @remarks
 * This file centralizes one shared piece of preparation execution state:
 * resolving the app-local `typescript/lib/tsc.js` entry used by
 * `routeHandlersConfig.app.prepare`.
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
export const resolveAppLocalTypeScriptCompilerPath = (
  rootDir: string
): string => {
  const requireFromRoot = createRequireFromRoot(rootDir);

  try {
    return requireFromRoot.resolve('typescript/lib/tsc.js');
  } catch {
    throw createRuntimeError(
      'Unable to resolve app-local TypeScript for routeHandlersConfig.app.prepare. Install "typescript" in the app or remove routeHandlersConfig.app.prepare.',
      { rootDir }
    );
  }
};
