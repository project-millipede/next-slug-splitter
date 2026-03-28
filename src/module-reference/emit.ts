import path from 'node:path';

import { absoluteModule } from './create';
import { isModuleSourceExtension } from './extensions';
import type { ResolvedModuleReference } from './types';

/**
 * Removes recognized source-file extensions from a path.
 * Purpose:
 * - Ensures emitted imports use extensionless specifiers.
 * - Maintains compatibility with standard ESM resolution.
 *
 * @param filePath - The filesystem path or relative specifier to process.
 * @returns The path without its source extension, if a match was found.
 */
const stripModuleSourceExtension = (filePath: string): string => {
  const extension = path.extname(filePath);

  return isModuleSourceExtension(extension)
    ? filePath.slice(0, -extension.length)
    : filePath;
};

/**
 * Convert an import source string into the specifier written into a
 * generated handler page.
 *
 * This is the primary entry point for processor-provided import paths.
 *
 * Processing Logic:
 * 1. Package/Relative Paths:
 *    Passed through unchanged, as they are already in a format compatible
 *    with `import` statements.
 * 2. Absolute Paths:
 *    Relativized against the generated page location using
 *    `toEmittedImportSpecifier`.
 *
 * @param pageFilePath - Absolute path of the handler page being generated.
 * @param source - Import source string returned by the processor.
 * @returns A valid ES module import specifier.
 */
export const toEmittedImportSource = (
  pageFilePath: string,
  source: string
): string => {
  // 1. Non-absolute sources (package names or relative paths) are used verbatim.
  if (!path.isAbsolute(source)) {
    return source;
  }

  // 2. Absolute paths are converted to relative specifiers.
  return toEmittedImportSpecifier(pageFilePath, absoluteModule(source));
};

/**
 * Ensure a path is treated as a relative ES module specifier.
 *
 * Reasoning:
 * - Prevents bundlers from treating sibling files as bare package names.
 * - Adds a leading `./` if the path does not already start with a dot.
 *
 * Examples:
 * - `factory` → `./factory`
 * - `lib/utils` → `./lib/utils`
 * - `../factory` → `../factory` (unchanged)
 * - `./factory` → `./factory` (unchanged)
 *
 * @param value - Normalized path string.
 * @returns Dot-relative specifier (e.g., `./utils` or `../lib/utils`).
 */
export const ensureRelativeSpecifier = (value: string): string =>
  value.startsWith('.') ? value : `./${value}`;

/**
 * Convert a filesystem path to POSIX separators.
 * Uses a global regex to ensure that even on POSIX systems,
 * Windows-style backslashes are normalized to forward slashes.
 *
 * Example:
 * - `C:\\app\\pages\\docs` -> `C:/app/pages/docs`
 * - `/Users/project/pages/docs` -> `/Users/project/pages/docs`
 *
 * @param value - Filesystem path value.
 * @returns POSIX-normalized path string.
 */
export const toPosix = (value: string): string => value.replace(/\\/g, '/');

/**
 * Convert a resolved module reference into the import specifier written
 * into a generated handler page.
 *
 * Used by the pipeline to emit import specifiers from
 * {@link ResolvedModuleReference} objects originating from:
 * 1. Processor-provided {@link ModuleReference} values (after normalization).
 * 2. Internal pipeline references (e.g. factory imports).
 *
 * Conversion Rules:
 * 1. Package References:
 *    The specifier is returned unchanged.
 * 2. Absolute File References:
 *    - The path is relativized to the generated page's directory.
 *    - Known source extensions are stripped.
 *    - Result is normalized to POSIX separators.
 *    - Result is ensured to be a dot-relative specifier.
 *
 * @param pageFilePath - Absolute path of the handler page being generated.
 * @param reference - Resolved module reference to convert.
 * @returns Import specifier suitable for the generated `import` statement.
 */
export const toEmittedImportSpecifier = (
  pageFilePath: string,
  reference: ResolvedModuleReference
): string => {
  // 1. Package specifiers are used verbatim.
  if (reference.kind === 'package') {
    return reference.specifier;
  }

  // 2. Compute the relative path from the generated page's directory.
  const fromDir = path.dirname(pageFilePath);
  const relativePath = path.relative(fromDir, reference.path);

  // 3. Strip known source extensions for standard ES module resolution.
  const extensionlessPath = stripModuleSourceExtension(relativePath);

  // 4. Normalize OS-specific separators to POSIX forward slashes.
  const normalizedPath = toPosix(extensionlessPath);

  // 5. Ensure a leading relative prefix (./ or ../).
  return ensureRelativeSpecifier(normalizedPath);
};
