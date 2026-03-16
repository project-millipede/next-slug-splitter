import type { RouteHandlerMdxCompileOptions } from '../core/types';
import {
  isArray,
  isBigInt,
  isBoolean,
  isFunction,
  isNull,
  isNumber,
  isObject,
  isString,
  isSymbol
} from '../utils/type-guards';

type StableIdentityValue =
  | null
  | boolean
  | number
  | string
  | Array<StableIdentityValue>
  | { [key: string]: StableIdentityValue };

/**
 * Convert one arbitrary value into a stable JSON-safe identity value.
 *
 * @param value - Arbitrary compile-option value.
 * @param seen - Object identities already visited during recursion.
 * @returns Stable JSON-safe representation of the input value.
 */
const toStableIdentityValue = (
  value: unknown,
  seen: WeakSet<object> = new WeakSet<object>()
): StableIdentityValue => {
  if (isNull(value) || isBoolean(value) || isNumber(value) || isString(value)) {
    return value;
  }

  if (isFunction(value)) {
    return {
      type: 'function',
      name: value.name || '(anonymous)',
      length: value.length
    };
  }

  if (isSymbol(value)) {
    return {
      type: 'symbol',
      value: String(value)
    };
  }

  if (isBigInt(value)) {
    return {
      type: 'bigint',
      value: value.toString()
    };
  }

  if (isArray(value)) {
    return value.map(entry => toStableIdentityValue(entry, seen));
  }

  if (isObject(value)) {
    if (seen.has(value)) {
      return {
        type: 'circular'
      };
    }

    seen.add(value);

    const stableObject: Record<string, StableIdentityValue> = {};
    for (const key of Object.keys(value).sort()) {
      stableObject[key] = toStableIdentityValue(value[key], seen);
    }

    return stableObject;
  }

  return {
    type: typeof value
  };
};

/**
 * Create a stable cache identity for target-local MDX compile options.
 *
 * @param options - MDX compile options participating in route analysis.
 * @returns Deterministic identity string for cache invalidation.
 */
export const createMdxCompileOptionsIdentity = (
  options: RouteHandlerMdxCompileOptions
): string => {
  return JSON.stringify(
    toStableIdentityValue({
      remarkPlugins: options.remarkPlugins ?? [],
      recmaPlugins: options.recmaPlugins ?? []
    })
  );
};
