import {
  isObjectRecord,
  readObjectProperty
} from '../utils/type-guards-custom';
import { isNonEmptyString } from '../utils/type-guards-extended';

import type {
  AbsoluteModuleReference,
  RelativeModuleReference,
  ModuleReference,
  PackageModuleReference
} from './types';

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
 * Determine whether a value is a root-relative module reference.
 */
export const isRelativeModuleReference =
  createModuleReferenceGuard<RelativeModuleReference>('relative-file', 'path');

/**
 * Determine whether a value is an absolute module reference.
 */
export const isAbsoluteModuleReference =
  createModuleReferenceGuard<AbsoluteModuleReference>('absolute-file', 'path');

/**
 * Determine whether a value matches any supported module reference shape.
 *
 * @param value Candidate value.
 * @returns `true` when the value is a supported module reference object.
 */
export const isModuleReference = (value: unknown): value is ModuleReference =>
  isPackageModuleReference(value) ||
  isRelativeModuleReference(value) ||
  isAbsoluteModuleReference(value);
