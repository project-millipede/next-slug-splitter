import { isModuleReference, normalizeModuleReference } from '../../module-reference';
import { createPipelineError } from '../../utils/errors';
import {
  isObjectRecord,
  readObjectProperty
} from '../../utils/type-guards-custom';
import { isNonEmptyString } from '../../utils/type-guards-extended';

import type { ComponentImportSpec, ResolvedComponentImportSpec } from '../types';

/**
 * Shared import-spec parsing and normalization primitives used by both
 * factory-binding and component-entry normalization.
 */

/**
 * Parses one processor-returned import spec.
 *
 * Example accepted value:
 * ```ts
 * {
 *   source: { kind: 'package', specifier: './runtime' },
 *   kind: 'default',
 *   importedName: 'runtime'
 * }
 * ```
 *
 * @param value - Unknown processor-returned import-spec value.
 * @param label - Error label describing the current parse path.
 * @returns Parsed import spec in typed library form.
 */
export const parseImportSpec = (
  value: unknown,
  label: string
): ComponentImportSpec => {
  if (!isObjectRecord(value)) {
    throw createPipelineError(`${label} must be an object.`);
  }

  const source = readObjectProperty(value, 'source');
  const kind = readObjectProperty(value, 'kind');
  const importedName = readObjectProperty(value, 'importedName');

  if (!isModuleReference(source)) {
    throw createPipelineError(`${label}.source must be a module reference.`);
  }

  if (kind !== 'default' && kind !== 'named') {
    throw createPipelineError(
      `${label}.kind must be either "default" or "named".`
    );
  }

  if (!isNonEmptyString(importedName)) {
    throw createPipelineError(
      `${label}.importedName must be a non-empty string.`
    );
  }

  return {
    source,
    kind,
    importedName
  };
};

/**
 * Normalizes one parsed import spec by resolving its nested module reference
 * against `rootDir`.
 *
 * @param rootDir - Application root used for module-reference normalization.
 * @param importSpec - Parsed import spec.
 * @returns Resolved import spec ready for later generation stages.
 */
export const normalizeImportSpec = (
  rootDir: string,
  importSpec: ComponentImportSpec
): ResolvedComponentImportSpec => ({
  source: normalizeModuleReference(rootDir, importSpec.source),
  kind: importSpec.kind,
  importedName: importSpec.importedName
});
