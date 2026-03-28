import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  isModuleReference,
  normalizeModuleReference,
  resolveModuleReferenceToPath
} from '../module-reference';
import { createPipelineError } from '../utils/errors';
import { isFunction } from '../utils/type-guards';
import {
  isObjectRecord,
  readObjectProperty
} from '../utils/type-guards-custom';
import { isNonEmptyString } from '../utils/type-guards-extended';
import { toRoutePath } from './discovery';

import type {
  ModuleReference,
  ResolvedModuleReference
} from '../module-reference';
import type {
  CreateRouteContextInput,
  LoadableComponentEntry,
  ResolvedComponentImportSpec,
  ResolvedRouteHandlerProcessorConfig,
  RouteHandlerGeneratorComponent,
  RouteHandlerGeneratorPlan,
  RouteHandlerProcessor,
  RouteHandlerRouteContext
} from './types';
import { isJsonObject } from '../utils/type-guards-json';

type LoadedProcessor = {
  processor: RouteHandlerProcessor;
};

const isNativelyImportableModulePath = (modulePath: string): boolean => {
  const extension = path.extname(modulePath);

  return extension === '.js' || extension === '.mjs' || extension === '.cjs';
};

const loadModuleExports = async (
  modulePath: string
): Promise<Record<string, unknown>> => {
  if (!isNativelyImportableModulePath(modulePath)) {
    throw createPipelineError(
      `Processor module "${modulePath}" must resolve to a native JavaScript module (.js, .mjs, or .cjs).`
    );
  }

  return (await import(pathToFileURL(modulePath).href)) as Record<
    string,
    unknown
  >;
};

const readComponentImportSpec = (
  value: unknown,
  label: string
): {
  source: ModuleReference;
  kind: 'default' | 'named';
  importedName: string;
} => {
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
    source: source as ModuleReference,
    kind,
    importedName
  };
};

const readRouteHandlerProcessor = (
  value: unknown,
  label: string
): RouteHandlerProcessor => {
  if (!isObjectRecord(value)) {
    throw createPipelineError(`${label} must be an object.`);
  }

  const plan = readObjectProperty(value, 'plan');
  if (plan != null) {
    throw createPipelineError(
      `${label} still uses the removed two-phase processor API. Remove plan(...) and have resolve(...) return the final RouteHandlerGeneratorPlan.`
    );
  }

  const resolve = readObjectProperty(value, 'resolve');
  if (!isFunction(resolve)) {
    throw createPipelineError(`${label}.resolve must be a function.`);
  }

  return value as RouteHandlerProcessor;
};

const loadProcessorModule = async ({
  rootDir,
  processorImport
}: {
  rootDir: string;
  processorImport: ResolvedModuleReference;
}): Promise<RouteHandlerProcessor> => {
  const processorPath = resolveModuleReferenceToPath(
    rootDir,
    processorImport
  );
  const processorModule = await loadModuleExports(processorPath);
  let exportedProcessor = readObjectProperty(
    processorModule,
    'routeHandlerProcessor'
  );
  if (exportedProcessor == null) {
    exportedProcessor = readObjectProperty(processorModule, 'default');
  }

  return readRouteHandlerProcessor(
    exportedProcessor,
    `processor module "${processorPath}"`
  );
};

const loadConfiguredProcessor = async ({
  rootDir,
  processorConfig
}: {
  rootDir: string;
  processorConfig: ResolvedRouteHandlerProcessorConfig;
}): Promise<LoadedProcessor> => {
  return {
    processor: await loadProcessorModule({
      rootDir,
      processorImport: processorConfig.processorImport
    })
  };
};

/** Build a human-readable label for error messages identifying a specific route. */
const createRouteLabel = (route: RouteHandlerRouteContext): string =>
  `target "${route.targetId ?? 'default'}", route "${route.routePath}", handler "${route.handlerId}"`;

const normalizeComponentEntry = ({
  rootDir,
  route,
  component
}: {
  rootDir: string;
  route: RouteHandlerRouteContext;
  component: RouteHandlerGeneratorComponent;
}): LoadableComponentEntry => {
  const label = `Component "${component.key}" for ${createRouteLabel(route)}`;
  const componentImport = readComponentImportSpec(
    component.componentImport,
    `${label}.componentImport`
  );

  const resolvedImport: ResolvedComponentImportSpec = {
    source: normalizeModuleReference(rootDir, componentImport.source),
    kind: componentImport.kind,
    importedName: componentImport.importedName
  };

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

const normalizeGeneratorPlan = ({
  rootDir,
  route,
  capturedComponentKeys,
  plan
}: {
  rootDir: string;
  route: RouteHandlerRouteContext;
  capturedComponentKeys: Array<string>;
  plan: RouteHandlerGeneratorPlan;
}): {
  factoryImport: ResolvedModuleReference;
  componentEntries: Array<LoadableComponentEntry>;
} => {
  if (!isObjectRecord(plan)) {
    throw createPipelineError(
      `Processor for ${createRouteLabel(route)} must return an object.`
    );
  }

  const components = readObjectProperty(plan, 'components');
  if (!Array.isArray(components)) {
    throw createPipelineError(
      `Processor for ${createRouteLabel(route)} must return a components array.`
    );
  }

  const rawFactoryImport = readObjectProperty(plan, 'factoryImport');
  if (!isModuleReference(rawFactoryImport)) {
    throw createPipelineError(
      `Processor for ${createRouteLabel(route)} must return a factoryImport module reference.`
    );
  }

  const factoryImport = normalizeModuleReference(rootDir, rawFactoryImport);

  const returnedComponentsByKey = new Map<
    string,
    RouteHandlerGeneratorComponent
  >();
  for (const component of components) {
    if (!isObjectRecord(component)) {
      throw createPipelineError(
        `Processor for ${createRouteLabel(route)} returned a component entry without a non-empty key.`
      );
    }

    const key = readObjectProperty(component, 'key');
    if (!isNonEmptyString(key)) {
      throw createPipelineError(
        `Processor for ${createRouteLabel(route)} returned a component entry without a non-empty key.`
      );
    }

    if (returnedComponentsByKey.has(key)) {
      throw createPipelineError(
        `Processor for ${createRouteLabel(route)} returned duplicate component key "${key}".`
      );
    }

    returnedComponentsByKey.set(
      key,
      component as RouteHandlerGeneratorComponent
    );
  }

  const capturedKeySet = new Set(capturedComponentKeys);
  for (const componentKey of returnedComponentsByKey.keys()) {
    if (!capturedKeySet.has(componentKey)) {
      throw createPipelineError(
        `Processor for ${createRouteLabel(route)} returned uncaptured component key "${componentKey}".`
      );
    }
  }

  const componentEntries = capturedComponentKeys.map(key => {
    const component = returnedComponentsByKey.get(key);
    if (component == null) {
      throw createPipelineError(
        `Processor for ${createRouteLabel(route)} is missing captured component key "${key}".`
      );
    }

    return normalizeComponentEntry({
      rootDir,
      route,
      component
    });
  });

  return {
    factoryImport,
    componentEntries
  };
};

export const createRouteHandlerRoutePlanner = async ({
  rootDir,
  processorConfig
}: {
  rootDir: string;
  processorConfig: ResolvedRouteHandlerProcessorConfig;
}) => {
  const { processor } = await loadConfiguredProcessor({
    rootDir,
    processorConfig
  });

  return async ({
    route,
    capturedComponentKeys
  }: {
    route: RouteHandlerRouteContext;
    capturedComponentKeys: Array<string>;
  }): Promise<{
    factoryImport: ResolvedModuleReference;
    componentEntries: Array<LoadableComponentEntry>;
  }> => {
    let generatorPlan: RouteHandlerGeneratorPlan;
    try {
      generatorPlan = await processor.resolve({
        route,
        capturedComponentKeys
      });
    } catch (error) {
      throw createPipelineError(
        `Processor resolve failed for ${createRouteLabel(route)}: ${error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return normalizeGeneratorPlan({
      rootDir,
      route,
      capturedComponentKeys,
      plan: generatorPlan
    });
  };
};

export const createRouteContext = ({
  filePath,
  handlerId,
  handlerRelativePath,
  locale,
  routeBasePath,
  slugArray,
  targetId
}: CreateRouteContextInput): RouteHandlerRouteContext => ({
  targetId,
  locale,
  slugArray,
  routePath: toRoutePath(routeBasePath, slugArray),
  filePath,
  handlerId,
  handlerRelativePath
});
