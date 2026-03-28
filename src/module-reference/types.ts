/**
 * Module reference resolved through standard package exports.
 *
 * The specifier is resolved by searching `node_modules` directories.
 * The package must be installed in a reachable `node_modules` directory.
 *
 * @transform
 * Passed through unchanged during configuration normalization.
 *
 * @remarks
 * Workspace packages must be hoisted via root `package.json`:
 *
 * ```json
 * {
 *   "dependencies": {
 *     "@company/shared-ui": "workspace:*"
 *   }
 * }
 * ```
 *
 * Packages outside `node_modules` must use {@link AbsoluteModuleReference}.
 */
export type PackageModuleReference = {
  /**
   * Discriminator identifying this as a package-based module reference.
   */
  kind: 'package';

  /**
   * Package name with optional subpath export.
   *
   * Examples:
   * - `"@company/shared-ui"` - Hoisted workspace package
   * - `"site-route-handlers"` - Regular dependency
   * - `"site-route-handlers/docs/factory"` - Package subpath export
   */
  specifier: string;
};

/**
 * Module reference relative to the project root.
 *
 * @transform
 * Normalized to {@link AbsoluteModuleReference} during configuration resolution.
 */
export type RelativeModuleReference = {
  /**
   * Discriminator identifying this as a root-relative module reference.
   */
  kind: 'relative-file';

  /**
   * Module path relative to the project root.
   *
   * Examples:
   * - `"src/content/handlers"` - Content handlers directory
   * - `"lib/runtime/factory"` - Runtime factory module
   */
  path: string;
};

/**
 * Absolute filesystem module reference.
 *
 * @transform
 * Passed through unchanged during configuration normalization.
 */
export type AbsoluteModuleReference = {
  /**
   * Discriminator identifying this as an absolute filesystem module reference.
   */
  kind: 'absolute-file';

  /**
   * Absolute module path on disk.
   *
   * May include or omit the file extension depending on pipeline stage.
   *
   * Examples:
   * - `"/home/user/project/packages/shared-ui"` - Workspace package source
   * - `"/home/user/project/lib/runtime/factory.ts"` - Source file
   */
  path: string;
};

/**
 * User-facing module reference union for route handler configuration.
 *
 * Accepts package specifiers, project-relative paths, or absolute paths.
 * Normalized to {@link ResolvedModuleReference} during configuration resolution.
 */
export type ModuleReference =
  | PackageModuleReference
  | RelativeModuleReference
  | AbsoluteModuleReference;

/**
 * Module reference union after configuration normalization.
 *
 * Contains the normalized forms of module references:
 * - {@link PackageModuleReference} is passed through unchanged
 * - {@link RelativeModuleReference} is resolved to {@link AbsoluteModuleReference}
 *
 * At this stage the pipeline no longer carries relative local module paths.
 */
export type ResolvedModuleReference =
  | PackageModuleReference
  | AbsoluteModuleReference;
