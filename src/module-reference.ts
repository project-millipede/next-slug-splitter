import { statSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import {
  isObjectRecord,
  readObjectProperty
} from './utils/type-guards-custom';
import { isNonEmptyString } from './utils/type-guards-extended';

/**
 * Package-owned module reference resolved through Node package exports.
 */
export type PackageModuleReference = {
  /**
   * Discriminator for package module references.
   */
  kind: 'package';

  /**
   * Package export specifier resolved from the app root.
   *
   * Examples:
   * - `"site-route-handlers/docs/components"`
   * - `"site-route-handlers/docs/factory"`
   */
  specifier: string;
};

/**
 * App-root-relative module reference.
 */
export type AppRelativeModuleReference = {
  /**
   * Discriminator for app-root-relative module references.
   */
  kind: 'app-relative';

  /**
   * Module path relative to the owning application root.
   *
   * Examples:
   * - `"pages/content/[...entry]"`
   * - `"src/runtime/factory"`
   */
  path: string;
};

/**
 * Absolute module reference on the local filesystem.
 */
export type AbsoluteFileModuleReference = {
  /**
   * Discriminator for absolute filesystem module references.
   */
  kind: 'absolute-file';

  /**
   * Absolute module path on disk.
   *
   * This may be an extensionless module base path or a concrete source file
   * path depending on the stage of the pipeline.
   */
  path: string;
};

/**
 * Explicit module reference contract used throughout route-handler config.
 *
 * The `kind` discriminator removes the need to guess whether a string should
 * be interpreted as a package specifier or a local filesystem path.
 */
export type ModuleReference =
  | PackageModuleReference
  | AppRelativeModuleReference
  | AbsoluteFileModuleReference;

/**
 * Module reference after app-root-relative paths have been normalized.
 *
 * At this stage the pipeline no longer carries relative local module paths.
 */
export type ResolvedModuleReference =
  | PackageModuleReference
  | AbsoluteFileModuleReference;

const MODULE_SOURCE_EXTENSIONS = [
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs'
] as const;

const isModuleSourceExtension = (
  value: string
): value is (typeof MODULE_SOURCE_EXTENSIONS)[number] =>
  MODULE_SOURCE_EXTENSIONS.some(extension => extension === value);

/**
 * Virtual file path used only to anchor Node package resolution at the app
 * root.
 *
 * Key aspects:
 * 1. `createRequire(...)` expects an absolute file path.
 * 2. The anchor path does not need to exist on disk.
 * 3. A synthetic file under `rootDir` makes package resolution start from the
 *    application root.
 * 4. This avoids requiring the application to provide `package.json` as the
 *    resolution anchor.
 */
const APP_ROOT_PACKAGE_RESOLUTION_ANCHOR = '__app_root_resolver__';

/**
 * Determine whether a local module path already ends with a known source-file
 * extension.
 *
 * Key aspects:
 * 1. `path.extname(...)` is not used here.
 * 2. Next.js dynamic route filenames such as `[...slug]` and `[[...slug]]`
 *    contain dots as part of the route syntax.
 * 3. `path.extname('[...slug]')` incorrectly reports `.slug]`.
 * 4. That result makes catch-all route modules look like already-extended
 *    files and skips `.[tj]sx` candidate probing.
 */
const hasKnownSourceExtension = (modulePath: string): boolean =>
  MODULE_SOURCE_EXTENSIONS.some(extension => modulePath.endsWith(extension));

/**
 * Create a package module reference.
 *
 * @param specifier Package export specifier.
 * @returns Package module reference object.
 */
export const packageModule = (
  specifier: string
): PackageModuleReference => ({
  kind: 'package',
  specifier
});

/**
 * Create an app-root-relative module reference.
 *
 * @param modulePath App-root-relative module path.
 * @returns App-relative module reference object.
 */
export const appRelativeModule = (
  modulePath: string
): AppRelativeModuleReference => ({
  kind: 'app-relative',
  path: modulePath
});

/**
 * Create an absolute filesystem module reference.
 *
 * @param absolutePath Absolute module path.
 * @returns Absolute-file module reference object.
 */
export const absoluteFileModule = (
  absolutePath: string
): AbsoluteFileModuleReference => ({
  kind: 'absolute-file',
  path: absolutePath
});

/**
 * Create a type guard for a module reference kind.
 *
 * Each module reference variant shares the same validation shape: an object
 * record with a `kind` discriminator and one required string property. This
 * factory eliminates the three near-identical guard implementations.
 *
 * @param kind Expected `kind` discriminator value.
 * @param property Name of the required non-empty string property.
 * @returns Type guard for the corresponding module reference type.
 */
const createModuleReferenceGuard = <T extends ModuleReference>(
  kind: T['kind'],
  property: string
) =>
  (value: unknown): value is T =>
    isObjectRecord(value) &&
    readObjectProperty(value, 'kind') === kind &&
    isNonEmptyString(readObjectProperty(value, property));

/**
 * Determine whether a value is a package module reference.
 */
export const isPackageModuleReference =
  createModuleReferenceGuard<PackageModuleReference>('package', 'specifier');

/**
 * Determine whether a value is an app-root-relative module reference.
 */
export const isAppRelativeModuleReference =
  createModuleReferenceGuard<AppRelativeModuleReference>('app-relative', 'path');

/**
 * Determine whether a value is an absolute-file module reference.
 */
export const isAbsoluteFileModuleReference =
  createModuleReferenceGuard<AbsoluteFileModuleReference>('absolute-file', 'path');

/**
 * Determine whether a value matches any supported module reference shape.
 *
 * @param value Candidate value.
 * @returns `true` when the value is a supported module reference object.
 */
export const isModuleReference = (value: unknown): value is ModuleReference =>
  isPackageModuleReference(value) ||
  isAppRelativeModuleReference(value) ||
  isAbsoluteFileModuleReference(value);

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

/**
 * Normalize a configured module reference relative to the app root.
 *
 * @param input Normalization input.
 * @returns Module reference with local paths converted to absolute form.
 */
export const normalizeModuleReferenceFromRoot = ({
  rootDir,
  reference
}: {
  rootDir: string;
  reference: ModuleReference;
}): ResolvedModuleReference => {
  if (reference.kind === 'package') {
    return reference;
  }

  if (reference.kind === 'absolute-file') {
    return absoluteFileModule(path.resolve(reference.path));
  }

  return absoluteFileModule(path.resolve(rootDir, reference.path));
};

const isExistingFile = (filePath: string): boolean => {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
};

/**
 * Assert that an absolute file path exists on disk and return it.
 *
 * @param absolutePath - Absolute path to verify.
 * @returns The same absolute path when the file exists.
 * @throws When the file does not exist.
 */
const resolveExactExistingFilePath = (absolutePath: string): string => {
  if (isExistingFile(absolutePath)) {
    return absolutePath;
  }

  throw new Error(`Could not resolve local file path "${absolutePath}".`);
};

const resolveExistingLocalModulePath = (absolutePath: string): string => {
  const candidates =
    hasKnownSourceExtension(absolutePath)
      ? [absolutePath]
      : [
          absolutePath,
          ...MODULE_SOURCE_EXTENSIONS.map(extension => `${absolutePath}${extension}`),
          ...MODULE_SOURCE_EXTENSIONS.map(extension =>
            path.join(absolutePath, `index${extension}`)
          )
        ];

  for (const candidate of candidates) {
    if (isExistingFile(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Could not resolve local module path "${absolutePath}".`);
};

/**
 * Resolve one module reference to an existing absolute module path.
 *
 * @param input Resolution input.
 * @returns Absolute module file path.
 * @throws When the reference cannot be resolved to an existing module.
 */
export const resolveModuleReferenceToPath = ({
  rootDir,
  reference
}: {
  rootDir: string;
  reference: ModuleReference | ResolvedModuleReference;
}): string => {
  if (reference.kind === 'package') {
    // Package resolution is anchored at the application root by using a
    // synthetic file path instead of depending on `package.json`.
    const requireFromRoot = createRequire(
      path.resolve(rootDir, APP_ROOT_PACKAGE_RESOLUTION_ANCHOR)
    );
    return requireFromRoot.resolve(reference.specifier);
  }

  const absolutePath =
    reference.kind === 'absolute-file'
      ? path.resolve(reference.path)
      : path.resolve(rootDir, reference.path);

  return resolveExistingLocalModulePath(absolutePath);
};

/**
 * Resolve one module reference to an existing absolute file path without
 * probing source-file extensions.
 *
 * @param input Resolution input.
 * @returns Absolute existing file path.
 * @throws When the reference does not resolve to an existing file.
 */
export const resolveModuleReferenceToFilePath = ({
  rootDir,
  reference
}: {
  rootDir: string;
  reference: ModuleReference | ResolvedModuleReference;
}): string => {
  if (reference.kind === 'package') {
    const requireFromRoot = createRequire(
      path.resolve(rootDir, APP_ROOT_PACKAGE_RESOLUTION_ANCHOR)
    );
    return requireFromRoot.resolve(reference.specifier);
  }

  const absolutePath =
    reference.kind === 'absolute-file'
      ? path.resolve(reference.path)
      : path.resolve(rootDir, reference.path);

  return resolveExactExistingFilePath(absolutePath);
};

/**
 * Append one subpath segment to a module reference while preserving its kind.
 *
 * @param reference Base module reference.
 * @param subpath Subpath segment to append.
 * @returns Module reference addressing the nested module path.
 */
export const appendModuleReferenceSubpath = <
  TReference extends ModuleReference | ResolvedModuleReference
>(
  reference: TReference,
  subpath: string
): TReference => {
  if (reference.kind === 'package') {
    return packageModule(
      reference.specifier.endsWith('/')
        ? `${reference.specifier}${subpath}`
        : `${reference.specifier}/${subpath}`
    ) as TReference;
  }

  return absoluteFileModule(path.join(reference.path, subpath)) as TReference;
};

/**
 * Convert one resolved module reference into the import specifier that should
 * be written into an emitted handler file.
 *
 * @param input Emitted-import construction input.
 * @returns Final import specifier suitable for generated source code.
 */
export const toEmittedImportSpecifier = ({
  pageFilePath,
  reference
}: {
  pageFilePath: string;
  reference: ResolvedModuleReference;
}): string => {
  if (reference.kind === 'package') {
    return reference.specifier;
  }

  let relativePath = path.relative(path.dirname(pageFilePath), reference.path);
  const extension = path.extname(reference.path);
  if (extension.length > 0 && isModuleSourceExtension(extension)) {
    relativePath = relativePath.slice(0, -extension.length);
  }

  const normalizedPath = relativePath.split(path.sep).join('/');
  return normalizedPath.startsWith('.')
    ? normalizedPath
    : `./${normalizedPath}`;
};
