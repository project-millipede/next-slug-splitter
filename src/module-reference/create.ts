import type {
  AbsoluteModuleReference,
  RelativeModuleReference,
  PackageModuleReference
} from './types';

/**
 * Create a package module reference.
 *
 * @param specifier Package export specifier.
 * @returns Package module reference object.
 */
export const packageModule = (specifier: string): PackageModuleReference => ({
  kind: 'package',
  specifier
});

/**
 * Create a root-relative module reference.
 *
 * @param modulePath Module path relative to the project root.
 * @returns Root-relative module reference object.
 */
export const relativeModule = (
  modulePath: string
): RelativeModuleReference => ({
  kind: 'relative-file',
  path: modulePath
});

/**
 * Create an absolute filesystem module reference.
 *
 * @param absolutePath Absolute module path.
 * @returns Absolute module reference object.
 */
export const absoluteModule = (
  absolutePath: string
): AbsoluteModuleReference => ({
  kind: 'absolute-file',
  path: absolutePath
});
