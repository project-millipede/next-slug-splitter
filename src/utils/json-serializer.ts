import {
  isArray,
  isBigInt,
  isFunction,
  isObject,
  isSymbol
} from './type-guards';
import {
  isJsonPrimitive,
  JsonPrimitive,
  RecursiveData,
  RecursiveDataRecord
} from './type-guards-json';

/**
 * Structure used to represent non-JSON types (like Functions or BigInts)
 * in a stable, serializable format for identity tracking.
 *
 * @example
 * const marker: TypeMarker = { type: "function", name: "myPlugin" };
 */
type TypeMarker = { type: string } & RecursiveDataRecord<JsonPrimitive>;

/**
 * A JSON-safe representation of arbitrary data, including markers for
 * non-serializable types to ensure cache identity stability.
 */
export type StableIdentityValue = RecursiveData<JsonPrimitive | TypeMarker>;

/**
 * Generates a stable, serializable marker object for non-JSON types.
 *
 * This ensures that types which are normally lost during JSON serialization
 * (like Functions or BigInts) maintain a unique identity.
 *
 * @param value - The non-standard primitive or function to describe.
 * @returns A stable object representing the type and its inherent properties.
 */
const toTypeMarker = (value: unknown): TypeMarker => {
  if (isFunction(value)) {
    // Capture function name and parameter count to distinguish between plugins.
    return {
      type: 'function',
      name: value.name || '(anonymous)',
      length: value.length
    };
  }

  if (isSymbol(value)) {
    // Convert symbols to their string representation to ensure a stable key.
    return { type: 'symbol', value: String(value) };
  }

  if (isBigInt(value)) {
    // BigInts are converted to strings as they are not natively JSON-serializable.
    return { type: 'bigint', value: value.toString() };
  }

  // Fallback for types like 'undefined' to prevent them from being silently omitted.
  return { type: typeof value };
};

/**
 * Internal processor for canonical JSON conversion.
 * This function performs two critical normalization steps:
 *
 * 1. Circular Reference Protection
 *    If a specific object instance has already been visited in the current
 *    recursion stack, a marker is returned to prevent an infinite loop and
 *    eventual stack overflow.
 *    Example: A circular object { a: self } becomes { a: { type: "circular" }}.
 *
 * 2. Deterministic Key Sorting
 *    JavaScript object keys do not guarantee a fixed order. Sorting the keys
 *    ensures that two objects with the same properties in different orders
 *    produce an identical JSON string.
 *    Example: { b: 2, a: 1 } is normalized to { a: 1, b: 2 }.
 *
 * @param value - The value to normalize.
 * @param seen - A collection of already visited object identities.
 * @returns A stable, serializable representation of the input.
 */
const processCanonicalValue = (
  value: unknown,
  seen: WeakSet<object>
): StableIdentityValue => {
  if (isJsonPrimitive(value)) return value;

  if (isArray(value)) {
    return value.map(entry => processCanonicalValue(entry, seen));
  }

  if (isObject(value)) {
    // 1. Circular Reference Protection:
    if (seen.has(value)) {
      return { type: 'circular' };
    }
    seen.add(value);

    const stableObject: Record<string, StableIdentityValue> = {};

    // 2. Deterministic Key Sorting:
    const keys = Object.keys(value).sort();

    for (const key of keys) {
      stableObject[key] = processCanonicalValue(value[key], seen);
    }

    return stableObject;
  }

  // Handle Special Types (Functions, BigInts, Undefined):
  return toTypeMarker(value);
};

/**
 * Converts an arbitrary value into a canonical, JSON-safe representation.
 *
 * This utility ensures deterministic output by sorting object keys and
 * transforming non-serializable types into stable markers.
 *
 * @param value - The value to normalize.
 * @returns A deterministic, serializable representation.
 *
 * @example
 * const stable = toCanonicalJson({ b: 2, a: 1 });
 * // returns { a: 1, b: 2 }
 */
export const toCanonicalJson = (value: unknown): StableIdentityValue => {
  return processCanonicalValue(value, new WeakSet());
};
