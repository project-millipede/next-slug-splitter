import path from 'node:path';

import { absoluteModule } from './create';
import type { ModuleReference, ResolvedModuleReference } from './types';

/**
 * Normalize a configured module reference relative to the app root.
 *
 * Resolution steps:
 * 1. Package references pass through unchanged.
 * 2. Absolute-file references are canonicalized via `path.resolve`.
 * 3. Relative-file references are joined to `rootDir` and resolved to absolute form.
 *
 * @param rootDir - Application root directory used to anchor relative paths.
 * @param reference - The module reference to normalize.
 * @returns Module reference with local paths converted to absolute form.
 */
export const normalizeModuleReference = (
  rootDir: string,
  reference: ModuleReference
): ResolvedModuleReference => {
  if (reference.kind === 'package') {
    return reference;
  }

  if (reference.kind === 'absolute-file') {
    return absoluteModule(path.resolve(reference.path));
  }

  return absoluteModule(path.resolve(rootDir, reference.path));
};
