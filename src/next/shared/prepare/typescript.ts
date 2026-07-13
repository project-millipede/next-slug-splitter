/**
 * Shared TypeScript resolution helpers for the preparation subsystem.
 *
 * @remarks
 * This file centralizes one shared piece of preparation execution state:
 * resolving the app-local TypeScript package's declared `tsc` executable used
 * by `routeHandlersConfig.app.prepare`.
 */
import { readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { createRuntimeError } from '../../../utils/errors';

const APP_ROOT_PREPARE_RESOLUTION_ANCHOR = '__app_root_prepare__';

type TypeScriptPackageManifest = {
  bin?: {
    tsc?: string;
  };
};

/**
 * Create a Node module resolver anchored at an application root.
 *
 * Resolution setup:
 * 1. Append a virtual filename to the application root.
 * 2. Normalize the resulting path to an absolute resolution anchor.
 * 3. Create a require function whose package lookup starts from that anchor.
 *
 * @param rootDir - Absolute application root used for package resolution.
 * @returns A require function anchored to the application root.
 */
const createRequireFromRoot = (rootDir: string) =>
  createRequire(path.resolve(rootDir, APP_ROOT_PREPARE_RESOLUTION_ANCHOR));

/**
 * Resolve the compiler launcher declared by a TypeScript package manifest.
 *
 * Resolution steps:
 * 1. Read and parse the resolved TypeScript package manifest.
 * 2. Validate that the manifest declares a non-empty `bin.tsc` path.
 * 3. Resolve the declared path relative to the package directory.
 * 4. Verify that the resolved compiler launcher is a regular file.
 *
 * @param packageJsonPath - Absolute path to TypeScript's package manifest.
 * @returns The absolute path to the declared TypeScript compiler launcher.
 * @throws If the manifest is invalid or its declared compiler is not a file.
 */
const resolveDeclaredTypeScriptCompilerPath = (
  packageJsonPath: string
): string => {
  const packageJson = JSON.parse(
    readFileSync(packageJsonPath, 'utf8')
  ) as TypeScriptPackageManifest;
  const declaredCompilerPath = packageJson.bin?.tsc;

  if (typeof declaredCompilerPath !== 'string' || declaredCompilerPath === '') {
    throw new Error(
      'The app-local TypeScript package does not declare a "tsc" executable.'
    );
  }

  const compilerPath = path.resolve(
    path.dirname(packageJsonPath),
    declaredCompilerPath
  );

  if (!statSync(compilerPath).isFile()) {
    throw new Error(
      `The app-local TypeScript compiler entry is not a file: "${compilerPath}".`
    );
  }

  return compilerPath;
};

/**
 * Resolve the app-local TypeScript compiler executable.
 *
 * Resolution steps:
 * 1. Create a package resolver anchored at the application root.
 * 2. Resolve TypeScript's exported package manifest from that root.
 * 3. Resolve and validate the compiler declared by `bin.tsc`.
 * 4. Wrap resolution failures in a package-specific runtime error.
 *
 * @param rootDir - Application root used as the resolution base.
 * @returns Absolute path to the TypeScript compiler launcher.
 * @throws If TypeScript or its declared compiler cannot be resolved.
 */
export const resolveAppLocalTypeScriptCompilerPath = (
  rootDir: string
): string => {
  const requireFromRoot = createRequireFromRoot(rootDir);

  try {
    const packageJsonPath = requireFromRoot.resolve('typescript/package.json');

    return resolveDeclaredTypeScriptCompilerPath(packageJsonPath);
  } catch (error) {
    throw createRuntimeError(
      'Unable to resolve app-local TypeScript for routeHandlersConfig.app.prepare. Install "typescript" in the app or remove routeHandlersConfig.app.prepare.',
      {
        rootDir,
        cause: error instanceof Error ? error.message : String(error)
      }
    );
  }
};
