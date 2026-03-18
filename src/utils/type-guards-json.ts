import {
  Guard,
  isArray,
  isBoolean,
  isNull,
  isNumber,
  isObject,
  isObjectOf,
  isString
} from './type-guards';

/**
 * A generic recursive structure for JSON-compatible data trees.
 *
 * @example
 * type StringTree = RecursiveData<string>;
 * const tree: StringTree = ["a", { key: "b" }];
 *
 * @template T The allowed leaf (primitive) types for the tree.
 */
export type RecursiveData<T> =
  | T
  | RecursiveDataArray<T>
  | RecursiveDataRecord<T>;

/**
 * Array-based branch of a recursive data structure.
 *
 * @example
 * const list: RecursiveDataArray<number> = [1, [2, 3]];
 */
export type RecursiveDataArray<T> = Array<RecursiveData<T>> & {};

/**
 * Record-based branch of a recursive data structure.
 *
 * @example
 * const map: RecursiveDataRecord<boolean> = { a: true, b: { c: false } };
 */
export type RecursiveDataRecord<T> = { [key: string]: RecursiveData<T> };

/**
 * Standard primitive types supported by the JSON specification.
 *
 * Note:
 * - 'null' is included as a valid JSON literal;
 * - 'undefined' is strictly excluded as it cannot be represented in standard JSON.
 *
 * @example
 * const valid: JsonPrimitive = "text";
 * const invalid: JsonPrimitive = undefined; // Type error
 */
export type JsonPrimitive = string | number | boolean | null;

/**
 * A universal type representing any value that can be safely serialized to JSON.
 *
 * @example
 * const data: JsonValue = { id: 1, tags: ["meta", "data"] };
 */
export type JsonValue = RecursiveData<JsonPrimitive>;

/**
 * A JSON-compatible object record.
 *
 * @example
 * const config: JsonObject = { enabled: true, count: 10 };
 */
export type JsonObject = RecursiveDataRecord<JsonPrimitive>;

/**
 * Creates a recursive guard for validating complex nested structures.
 *
 * @template T  The type of the leaf nodes (primitives).
 * @param isPrimitive  A guard that identifies valid leaf nodes.
 * @returns  A guard that recursively validates arrays and records of T.
 */
function createRecursiveGuard<T>(
  isPrimitive: Guard<T>
): Guard<RecursiveData<T>> {
  const guard: Guard<RecursiveData<T>> = (
    value: unknown
  ): value is RecursiveData<T> => {
    // 1. Check if the value is a valid leaf node.
    if (isPrimitive(value)) {
      return true;
    }

    // 2. Recursively check array elements.
    if (isArray(value)) {
      return value.every(guard);
    }

    // 3. Recursively check object values.
    //    Note:
    //    Use 'isObject' directly to validate the base shape and iterate over
    //    values in a single pass, avoiding the overhead of 'isObjectRecord'.
    if (isObject(value)) {
      return Object.values(value).every(guard);
    }

    return false;
  };
  return guard;
}

/**
 * Guard verifying a value is a valid JSON primitive.
 *
 * @param value  Candidate runtime value to test.
 * @returns  True if the value is a string, number, boolean, or null.
 * @note  This strictly rejects 'undefined' because it is not valid in JSON.
 */
export const isJsonPrimitive: Guard<JsonPrimitive> = (
  value: unknown
): value is JsonPrimitive =>
  isNull(value) || isString(value) || isNumber(value) || isBoolean(value);

/**
 * Determine whether one value can be safely emitted as a JSON-compatible value.
 *
 * @param value  Candidate runtime value to test.
 * @returns  True if the value is a serializable primitive, array, or record.
 */
export const isJsonValue = createRecursiveGuard(isJsonPrimitive);

/**
 * Determine whether one value is a serializable JSON object.
 *
 * @param value  Candidate runtime value to test.
 * @returns  True if the value is a non-null, non-array object with JSON-compatible values.
 */
export function isJsonObject(value: unknown): value is JsonObject {
  return isObjectOf(isJsonValue)(value);
}
