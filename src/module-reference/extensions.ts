/**
 * Source-file extensions recognized during import specifier generation.
 *
 * Behavior:
 * - When an absolute path ends with these extensions, they are stripped.
 * - Matches standard ES module resolution (bundlers resolve extensionless files).
 *
 * Technical Details:
 * - Uses a read-only Set for $O(1)$ lookup performance.
 * - Single source of truth for both runtime and type system.
 */
export const MODULE_SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs'
]);

/**
 * The union type derived from the values in the MODULE_SOURCE_EXTENSIONS set.
 * - Inferred automatically via `Set<infer T>`.
 * - Stays in sync with the runtime set without manual updates.
 */
export type ModuleSourceExtension =
  typeof MODULE_SOURCE_EXTENSIONS extends Set<infer T> ? T : never;

/**
 * Type guard to check if a string is a recognized module source extension.
 *
 * @param value - The extension string to check (e.g., from `path.extname`).
 * @returns `true` if the extension is in the recognized set.
 */
export const isModuleSourceExtension = (
  value: string
): value is ModuleSourceExtension => MODULE_SOURCE_EXTENSIONS.has(value);
