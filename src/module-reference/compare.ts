import type { ModuleReference, ResolvedModuleReference } from './types';

/**
 * Render one module reference as the human-facing string used in diagnostics.
 *
 * @param reference Module reference to describe.
 * @returns Specifier or path string carried by the reference.
 */
export const getModuleReferenceValue = (
  reference: ModuleReference | ResolvedModuleReference
): string =>
  reference.kind === 'package' ? reference.specifier : reference.path;

/**
 * Compare two module references structurally.
 *
 * @param left Left module reference.
 * @param right Right module reference.
 * @returns `true` when both references describe the same module location.
 */
export const isSameModuleReference = (
  left: ModuleReference | ResolvedModuleReference,
  right: ModuleReference | ResolvedModuleReference
): boolean => {
  if (left.kind !== right.kind) {
    return false;
  }

  return getModuleReferenceValue(left) === getModuleReferenceValue(right);
};
