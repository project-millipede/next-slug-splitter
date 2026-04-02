import { createPipelineError } from '../../utils/errors';
import { isJsonObject } from '../../utils/type-guards-json';

import type {
  LoadableComponentEntry,
  RouteHandlerGeneratorComponent
} from '../types';
import { normalizeImportSpec, parseImportSpec } from './import-spec';

/**
 * Component-entry normalization.
 */

/**
 * Normalizes one processor-returned component entry.
 *
 * This parses the component import, resolves its module reference against the
 * app root, and normalizes missing metadata to an empty object.
 *
 * Example input:
 * ```ts
 * {
 *   key: 'PlaylistSteps',
 *   componentImport: {
 *     source: { kind: 'package', specifier: './playlist-steps' },
 *     kind: 'named',
 *     importedName: 'PlaylistSteps'
 *   },
 *   metadata: {
 *     runtimeTraits: ['selection']
 *   }
 * }
 * ```
 *
 * @param rootDir - Application root used for module-reference normalization.
 * @param routeLabel - Human-readable route label used in error messages.
 * @param component - Processor-returned component entry.
 * @returns Normalized component entry ready for generation.
 */
export const normalizeComponentEntry = ({
  rootDir,
  routeLabel,
  component
}: {
  rootDir: string;
  routeLabel: string;
  component: RouteHandlerGeneratorComponent;
}): LoadableComponentEntry => {
  const label = `Component "${component.key}" for ${routeLabel}`;
  const componentImport = parseImportSpec(
    component.componentImport,
    `${label}.componentImport`
  );

  const resolvedImport = normalizeImportSpec(rootDir, componentImport);

  if (component.metadata == null) {
    return {
      key: component.key,
      componentImport: resolvedImport,
      metadata: {}
    };
  }

  if (!isJsonObject(component.metadata)) {
    throw createPipelineError(
      `${label}.metadata must be a JSON-serializable object when provided.`
    );
  }

  return {
    key: component.key,
    componentImport: resolvedImport,
    metadata: component.metadata
  };
};
