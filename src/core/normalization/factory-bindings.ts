import { createPipelineError } from '../../utils/errors';
import { isObjectRecord } from '../../utils/type-guards-custom';

import type {
  FactoryBindings,
  FactoryBindingValue,
  ResolvedFactoryBindings,
  ResolvedFactoryBindingValue
} from '../types';
import { normalizeImportSpec, parseImportSpec } from './import-spec';

/**
 * Factory-binding parsing and normalization.
 *
 * This module preserves:
 * - outer object shape
 * - binding keys
 * - single-vs-array cardinality for each binding value
 */

/**
 * Parses one processor-returned factory binding value.
 *
 * A binding value is the right-hand side of one `factoryBindings` property. It
 * may be either:
 * - one import spec
 * - or an ordered array of import specs
 *
 * Example accepted values:
 * ```ts
 * { source: { kind: 'package', specifier: './runtime' }, kind: 'default', importedName: 'runtime' }
 * ```
 *
 * ```ts
 * [
 *   { source: { kind: 'package', specifier: './wrapper' }, kind: 'named', importedName: 'wrapperEnhancer' },
 *   { source: { kind: 'package', specifier: './selection' }, kind: 'named', importedName: 'selectionEnhancer' }
 * ]
 * ```
 *
 * The helper preserves that single-vs-array shape and returns the same value in
 * typed library form.
 *
 * @param value - Unknown processor-returned binding value.
 * @param label - Error label describing the current parse path.
 * @returns The parsed binding value with the same cardinality.
 */
export const parseFactoryBindingValue = (
  value: unknown,
  label: string
): FactoryBindingValue => {
  if (Array.isArray(value)) {
    return value.map((importSpec, index) =>
      parseImportSpec(importSpec, `${label}[${index}]`)
    );
  }

  return parseImportSpec(value, label);
};

/**
 * Parses the outer `factoryBindings` object returned by a processor.
 *
 * Each property key is preserved unchanged. Only the property values are parsed
 * through `parseFactoryBindingValue(...)`.
 *
 * Example accepted input:
 * ```ts
 * {
 *   runtimeEnhancers: [
 *     { source: { kind: 'package', specifier: './wrapper' }, kind: 'named', importedName: 'wrapperEnhancer' }
 *   ],
 *   loadableRuntime: {
 *     source: { kind: 'package', specifier: './runtime' },
 *     kind: 'default',
 *     importedName: 'runtime'
 *   }
 * }
 * ```
 *
 * Later generator stages keep those same keys when emitting code such as:
 * ```ts
 * runtimeEnhancers: [wrapperEnhancer]
 * loadableRuntime: runtime
 * ```
 *
 * @param value - Unknown processor-returned `factoryBindings` object.
 * @param label - Error label describing the current parse path.
 * @returns Parsed factory bindings with the same keys and value cardinality.
 */
export const parseFactoryBindings = (
  value: unknown,
  label: string
): FactoryBindings => {
  if (!isObjectRecord(value)) {
    throw createPipelineError(`${label} must be an object.`);
  }

  const bindings: Record<string, FactoryBindingValue> = {};

  for (const [bindingKey, bindingValue] of Object.entries(value)) {
    bindings[bindingKey] = parseFactoryBindingValue(
      bindingValue,
      `${label}.${bindingKey}`
    );
  }

  return bindings;
};

/**
 * Normalizes one parsed factory binding value into the resolved planner shape.
 *
 * This helper preserves whether the binding is single-valued or array-valued.
 * It only normalizes the nested `source` module reference on each import spec.
 *
 * Example input:
 * ```ts
 * { source: { kind: 'package', specifier: './runtime' }, kind: 'default', importedName: 'runtime' }
 * ```
 *
 * Example normalized output:
 * ```ts
 * {
 *   source: normalizeModuleReference(rootDir, { kind: 'package', specifier: './runtime' }),
 *   kind: 'default',
 *   importedName: 'runtime'
 * }
 * ```
 *
 * @param rootDir - Application root used for module-reference normalization.
 * @param value - Parsed factory binding value.
 * @returns Resolved binding value with the same single-vs-array shape.
 */
export const normalizeFactoryBindingValue = (
  rootDir: string,
  value: FactoryBindingValue
): ResolvedFactoryBindingValue => {
  if ('source' in value) {
    return normalizeImportSpec(rootDir, value);
  }

  return value.map(importSpec => normalizeImportSpec(rootDir, importSpec));
};

/**
 * Normalizes the full `factoryBindings` object into the resolved planner shape.
 *
 * This preserves:
 * - the outer object shape
 * - each binding key
 * - single-vs-array cardinality for each binding value
 *
 * It only changes nested import-spec sources by normalizing them against
 * `rootDir`.
 *
 * Example input:
 * ```ts
 * {
 *   runtimeEnhancers: [
 *     { source: { kind: 'package', specifier: './wrapper' }, kind: 'named', importedName: 'wrapperEnhancer' }
 *   ],
 *   loadableRuntime: {
 *     source: { kind: 'package', specifier: './runtime' },
 *     kind: 'default',
 *     importedName: 'runtime'
 *   }
 * }
 * ```
 *
 * Example normalized output:
 * ```ts
 * {
 *   runtimeEnhancers: [
 *     {
 *       source: normalizeModuleReference(rootDir, { kind: 'package', specifier: './wrapper' }),
 *       kind: 'named',
 *       importedName: 'wrapperEnhancer'
 *     }
 *   ],
 *   loadableRuntime: {
 *     source: normalizeModuleReference(rootDir, { kind: 'package', specifier: './runtime' }),
 *     kind: 'default',
 *     importedName: 'runtime'
 *   }
 * }
 * ```
 *
 * @param rootDir - Application root used for module-reference normalization.
 * @param bindings - Parsed factory-bindings object.
 * @returns Resolved factory bindings ready for later generator stages.
 */
export const normalizeFactoryBindings = (
  rootDir: string,
  bindings: FactoryBindings
): ResolvedFactoryBindings => {
  const resolvedBindings: Record<string, ResolvedFactoryBindingValue> = {};

  for (const [bindingKey, bindingValue] of Object.entries(bindings)) {
    resolvedBindings[bindingKey] = normalizeFactoryBindingValue(
      rootDir,
      bindingValue
    );
  }

  return resolvedBindings;
};
