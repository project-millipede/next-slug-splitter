import { isModuleReference, normalizeModuleReference } from '../module-reference';
import { createPipelineError } from '../utils/errors';
import {
  isObjectRecord,
  readObjectProperty
} from '../utils/type-guards-custom';
import { isNonEmptyString } from '../utils/type-guards-extended';

import type { ResolvedModuleReference } from '../module-reference';
import type {
  LoadableComponentEntry,
  ResolvedFactoryBindings,
  RouteHandlerGeneratorComponent,
  RouteHandlerGeneratorPlan
} from './types';
import {
  normalizeFactoryBindings,
  parseFactoryBindings
} from './normalization/factory-bindings';
import { normalizeComponentEntry } from './normalization/component-import-entry';

/**
 * Parses and normalizes processor-returned generator plans into the canonical
 * internal planner shape.
 *
 * Structure:
 * - factory binding parsing and normalization
 * - component entry normalization
 * - final plan assembly
 */
// Final plan assembly

/**
 * Normalizes the full processor-returned generator plan into the canonical
 * planner shape consumed by later generation stages.
 *
 * @param rootDir - Application root used for module-reference normalization.
 * @param routeLabel - Human-readable route label used in error messages.
 * @param capturedComponentKeys - Ordered component keys captured from the source page.
 * @param plan - Processor-returned generator plan.
 * @returns Canonical resolved planner output.
 */
export const normalizeGeneratorPlan = ({
  rootDir,
  routeLabel,
  capturedComponentKeys,
  plan
}: {
  rootDir: string;
  routeLabel: string;
  capturedComponentKeys: Array<string>;
  plan: RouteHandlerGeneratorPlan;
}): {
  factoryImport: ResolvedModuleReference;
  factoryBindings?: ResolvedFactoryBindings;
  componentEntries: Array<LoadableComponentEntry>;
} => {
  if (!isObjectRecord(plan)) {
    throw createPipelineError(
      `Processor for ${routeLabel} must return an object.`
    );
  }

  const components = readObjectProperty(plan, 'components');
  if (!Array.isArray(components)) {
    throw createPipelineError(
      `Processor for ${routeLabel} must return a components array.`
    );
  }

  const rawFactoryImport = readObjectProperty(plan, 'factoryImport');
  if (!isModuleReference(rawFactoryImport)) {
    throw createPipelineError(
      `Processor for ${routeLabel} must return a factoryImport module reference.`
    );
  }

  const factoryImport = normalizeModuleReference(rootDir, rawFactoryImport);

  const rawFactoryBindings = readObjectProperty(plan, 'factoryBindings');
  const factoryBindings =
    rawFactoryBindings == null
      ? undefined
      : parseFactoryBindings(rawFactoryBindings, `Processor for ${routeLabel} factoryBindings`);
  const resolvedFactoryBindings =
    factoryBindings == null
      ? undefined
      : normalizeFactoryBindings(rootDir, factoryBindings);

  const returnedComponentsByKey = new Map<
    string,
    RouteHandlerGeneratorComponent
  >();

  for (const component of components) {
    if (!isObjectRecord(component)) {
      throw createPipelineError(
        `Processor for ${routeLabel} returned a component entry without a non-empty key.`
      );
    }

    const key = readObjectProperty(component, 'key');
    if (!isNonEmptyString(key)) {
      throw createPipelineError(
        `Processor for ${routeLabel} returned a component entry without a non-empty key.`
      );
    }

    if (returnedComponentsByKey.has(key)) {
      throw createPipelineError(
        `Processor for ${routeLabel} returned duplicate component key "${key}".`
      );
    }

    returnedComponentsByKey.set(key, component as RouteHandlerGeneratorComponent);
  }

  const capturedKeySet = new Set(capturedComponentKeys);
  for (const componentKey of returnedComponentsByKey.keys()) {
    if (!capturedKeySet.has(componentKey)) {
      throw createPipelineError(
        `Processor for ${routeLabel} returned uncaptured component key "${componentKey}".`
      );
    }
  }

  const componentEntries = capturedComponentKeys.map(key => {
    const component = returnedComponentsByKey.get(key);
    if (component == null) {
      throw createPipelineError(
        `Processor for ${routeLabel} is missing captured component key "${key}".`
      );
    }

    return normalizeComponentEntry({
      rootDir,
      routeLabel,
      component
    });
  });

  return {
    factoryImport,
    factoryBindings: resolvedFactoryBindings,
    componentEntries
  };
};
