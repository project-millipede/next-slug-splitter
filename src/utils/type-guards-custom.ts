import { isArrayOf, isObjectOf, isString } from './type-guards';

/**
 * Trivial guard that preserves `unknown` values unchanged.
 *
 * @param _value
 *   Candidate runtime value.
 * @returns
 *   Always `true`.
 */
const isUnknownValue = (_value: unknown): _value is unknown => true;

/**
 * Guard verifying the value is a record-like object with unknown values.
 *
 * A record-like object is a non-null, non-array object with string keys
 * and unknown values. This is the most permissive object shape.
 *
 * @param value
 *   Candidate runtime value to test.
 * @returns
 *   `true` iff {@link value} is a non-null, non-array object.
 */
export const isObjectRecord = isObjectOf(isUnknownValue);

/**
 * Generic object-record guard that narrows to `Partial<T>`.
 *
 * After this guard passes, `readObjectProperty` constrains its key parameter
 * to `keyof T` — a typo in a property name becomes a compile-time error.
 *
 * @param value Candidate runtime value.
 * @returns `true` when the value is a non-null, non-array object.
 */
export const isObjectRecordOf = <T extends object>(
  value: unknown
): value is Partial<T> => isObjectRecord(value);

/**
 * Utility to safely read a property from a record-like object.
 *
 * This function performs two critical operations:
 *
 * 1. Type-Aware Property Retrieval
 * By using 'keyof T', the utility ensures the requested key exists
 * on the object shape while preserving the specific type of that property.
 * Example: Accessing a 'number' property returns 'number | undefined'.
 *
 * 2. Null-Safe Access Protection
 * An explicit check for null or undefined values is performed before
 * property access to prevent common 'Cannot read property' runtime errors.
 * Example: Passing null as the value returns undefined instead of crashing.
 *
 * @template T - The type of the object being accessed.
 * @template K - The specific key type of the object.
 * @param value - The record or object to read from.
 * @param key - The specific property key to retrieve.
 * @returns The value associated with the key, or undefined if the object is nullish.
 */
export const readObjectProperty = <T extends object, K extends keyof T>(
  value: T | null | undefined,
  key: K
): T[K] | undefined => {
  // 2. Null-Safe Access Protection:
  if (value === null || value === undefined) {
    return undefined;
  }

  return value[key];
};

/**
 * Represents a non-null, non-array object record.
 * Used as a safe, indexable base type for dynamic property access without
 * resorting to 'any'.
 */
export type ObjectRecord = Record<string, unknown>;

/**
 * Recursively generates a union of all possible dot-notation paths for a given type.
 *
 * This helper uses 'NonNullable' to ensure that optional properties
 * (e.g., app?: ConfigApp) still resolve their nested paths (e.g., 'app.rootDir').
 */
export type Paths<T> = T extends object
  ? {
      [K in keyof T]-?: K extends string
        ? NonNullable<T[K]> extends object
          ? K | `${K}.${Paths<NonNullable<T[K]>> & string}`
          : K
        : never;
    }[keyof T]
  : never;

/**
 * Utility to safely read a nested property using dot-notation with full type safety.
 *
 * @template T - The type of the object being traversed.
 * @template R - The expected return type of the property.
 *
 * @param obj - The source object to traverse.
 * @param path - A type-safe dot-separated string representing the property path.
 * @returns The nested value if found, otherwise undefined.
 */
export const readDeepProperty = <T extends object, R = unknown>(
  obj: T,
  path: Paths<T>
): R | undefined => {
  // 1. Path-Based Navigation:
  const segments = (path as string).split('.');

  const result = segments.reduce<unknown>((acc, key) => {
    // 2. Short-Circuit Safety:
    if (!isObjectRecord(acc)) {
      return undefined;
    }

    return readObjectProperty<ObjectRecord, string>(acc as ObjectRecord, key);
  }, obj);

  return result as R | undefined;
};

/**
 * Guard verifying the value is an array of strings.
 *
 * Each element is validated to ensure it is a string. Empty arrays pass.
 *
 * @param value
 *   Candidate runtime value to test.
 * @returns
 *   `true` iff {@link value} is an array and every element is a string.
 */
export const isStringArray = isArrayOf(isString);
