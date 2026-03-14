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
 * Utility to read one property from a record-like object.
 *
 * @param value
 *   Object record to read from.
 * @param key
 *   Property key to read.
 * @returns
 *   Raw property value.
 */
export const readObjectProperty = (
  value: Record<string, unknown>,
  key: string
): unknown => value[key];

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
