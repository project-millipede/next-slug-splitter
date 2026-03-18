import { isArray, isObject, isString } from './type-guards';

/**
 * Guard verifying the value is a non-empty string.
 *
 * A string is considered non-empty if it has at least one character.
 * This is a common check when validating identifiers, paths, or content.
 *
 * @param value
 *   Candidate runtime value to test.
 * @returns
 *   `true` iff {@link value} is a string and has length greater than 0.
 *
 * Example:
 * ```ts
 * isNonEmptyString('hello')  // true
 * isNonEmptyString('')       // false
 * isNonEmptyString(123)      // false
 * ```
 */
export function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.length > 0;
}

/**
 * Guard verifying the value is defined (neither `null` nor `undefined`).
 *
 * This is a strict nullish check that excludes both `null` and `undefined`
 * while allowing all other values (including `0`, `false`, `''`, `NaN`).
 *
 * @param value
 *   Candidate runtime value to test.
 * @returns
 *   `true` iff {@link value} is neither `null` nor `undefined`.
 *
 * Example:
 * ```ts
 * isDefined('hello')     // true
 * isDefined(0)           // true
 * isDefined(false)       // true
 * isDefined('')          // true
 * isDefined(null)        // false
 * isDefined(undefined)   // false
 * ```
 */
export function isDefined<T>(value: T | null | undefined): value is T {
  return value != null;
}

/**
 * Guard verifying the value is a non-empty array.
 *
 * An array is considered non-empty if it has at least one element.
 * This is useful when an operation requires at least one item to process.
 *
 * @param value
 *   Candidate runtime value to test.
 * @returns
 *   `true` iff {@link value} is an array with length greater than 0.
 *
 * Example:
 * ```ts
 * isNonEmptyArray([1, 2, 3])  // true
 * isNonEmptyArray([])         // false
 * isNonEmptyArray('notarray') // false
 * ```
 */
export function isNonEmptyArray<T>(value: unknown): value is T[] {
  return isArray(value) && value.length > 0;
}

/**
 * Guard verifying the value is a non-null object with at least one own property.
 *
 * An object is considered non-empty if it has at least one enumerable own property.
 * This excludes arrays, null, and empty objects `{}`.
 *
 * @param value
 *   Candidate runtime value to test.
 * @returns
 *   `true` iff {@link value} is a non-null, non-array object with at least one key.
 *
 * Example:
 * ```ts
 * isNonEmptyObject({ a: 1 })  // true
 * isNonEmptyObject({})        // false
 * isNonEmptyObject([])        // false
 * isNonEmptyObject(null)      // false
 * ```
 */
export function isNonEmptyObject(
  value: unknown
): value is Record<string, unknown> {
  return isObject(value) && Object.keys(value).length > 0;
}
