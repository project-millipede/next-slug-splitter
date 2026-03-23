import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  appendModuleReferenceSubpath,
  isModuleReference,
  normalizeModuleReferenceFromRoot,
  resolveModuleReferenceToPath
} from '../module-reference';
import { createPipelineError } from '../utils/errors';
import { isFunction, isString } from '../utils/type-guards';
import {
  isObjectRecord,
  readObjectProperty
} from '../utils/type-guards-custom';
import { isNonEmptyString } from '../utils/type-guards-extended';
import { toRoutePath } from './discovery';

import type { ResolvedModuleReference } from '../module-reference';
import type {
  ComponentImportSpec,
  CreateRouteContextInput,
  LoadableComponentEntry,
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

export type RouteHandlerProcessorCacheInfo = {
  inputImports: Array<ResolvedModuleReference>;
  identity?: string;
};

const toImportSource = (reference: ResolvedModuleReference): string =>
  reference.kind === 'package' ? reference.specifier : reference.path;

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

const createDefaultNamedComponent = (
  componentsImport: ResolvedModuleReference
): ((key: string) => ComponentImportSpec) => {
  const source = toImportSource(componentsImport);

  return (key: string): ComponentImportSpec => ({
    source,
    kind: 'named',
    importedName: key
  });
};

const readComponentImportSpec = (
  value: unknown,
  label: string
): ComponentImportSpec => {
  if (!isObjectRecord(value)) {
    throw createPipelineError(`${label} must be an object.`);
  }

  const source = readObjectProperty(value, 'source');
  const kind = readObjectProperty(value, 'kind');
  const importedName = readObjectProperty(value, 'importedName');

  if (!isNonEmptyString(source)) {
    throw createPipelineError(`${label}.source must be a non-empty string.`);
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

const readRouteHandlerProcessor = (
  value: unknown,
  label: string
): RouteHandlerProcessor => {
  if (!isObjectRecord(value)) {
    throw createPipelineError(`${label} must be an object.`);
  }

  const ingress = readObjectProperty(value, 'ingress');
  if (!isFunction(ingress)) {
    throw createPipelineError(`${label}.ingress must be a function.`);
  }

  const egress = readObjectProperty(value, 'egress');
  if (!isFunction(egress)) {
    throw createPipelineError(`${label}.egress must be a function.`);
  }

  const cache = readObjectProperty(value, 'cache');
  if (cache !== undefined && !isObjectRecord(cache)) {
    throw createPipelineError(
      `${label}.cache must be an object when provided.`
    );
  }

  if (isObjectRecord(cache)) {
    const inputImports = readObjectProperty(cache, 'inputImports');
    if (
      inputImports !== undefined &&
      (!Array.isArray(inputImports) ||
        inputImports.some(item => !isModuleReference(item)))
    ) {
      throw createPipelineError(
        `${label}.cache.inputImports must be an array of module reference objects.`
      );
    }

    const getIdentity = readObjectProperty(cache, 'getIdentity');
    if (getIdentity !== undefined && !isFunction(getIdentity)) {
      throw createPipelineError(
        `${label}.cache.getIdentity must be a function when provided.`
      );
    }
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
  const processorPath = resolveModuleReferenceToPath({
    rootDir,
    reference: processorImport
  });
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

const resolveProcessorCacheInputImports = ({
  rootDir,
  processor,
  label
}: {
  rootDir: string;
  processor: RouteHandlerProcessor;
  label: string;
}): Array<ResolvedModuleReference> => {
  const inputImports = processor.cache?.inputImports;
  if (!Array.isArray(inputImports) || inputImports.length === 0) {
    return [];
  }

  return inputImports.map((reference, index) => {
    if (reference == null) {
      throw createPipelineError(
        `${label}.cache.inputImports[${index}] must be a module reference object.`
      );
    }

    return normalizeModuleReferenceFromRoot({
      rootDir,
      reference
    });
  });
};

const resolveProcessorCacheIdentity = async ({
  processor,
  targetId,
  label
}: {
  processor: RouteHandlerProcessor;
  targetId?: string;
  label: string;
}): Promise<string | undefined> => {
  const getIdentity = processor.cache?.getIdentity;
  if (!getIdentity) {
    return undefined;
  }

  const identity = await getIdentity({ targetId });
  if (!isString(identity)) {
    throw createPipelineError(
      `${label}.cache.getIdentity must resolve to a string.`
    );
  }

  return identity;
};

/** Build a human-readable label for error messages identifying a specific route. */
const createRouteLabel = (route: RouteHandlerRouteContext): string =>
  `target "${route.targetId ?? 'default'}", route "${route.routePath}", handler "${route.handlerId}"`;

const validateFactoryVariant = ({
  rootDir,
  route,
  runtimeHandlerFactoryImportBase,
  factoryVariant
}: {
  rootDir: string;
  route: RouteHandlerRouteContext;
  runtimeHandlerFactoryImportBase: ResolvedModuleReference;
  factoryVariant: string;
}): string => {
  if (!isNonEmptyString(factoryVariant)) {
    throw createPipelineError(
      `Processor for ${createRouteLabel(route)} must return a non-empty factoryVariant.`
    );
  }

  const variantReference = appendModuleReferenceSubpath(
    runtimeHandlerFactoryImportBase,
    factoryVariant
  );

  try {
    resolveModuleReferenceToPath({
      rootDir,
      reference: variantReference
    });
  } catch {
    throw createPipelineError(
      `Processor for ${createRouteLabel(route)} returned factoryVariant "${factoryVariant}", but "${toImportSource(variantReference)}" could not be resolved.`
    );
  }

  return factoryVariant;
};

const normalizeComponentEntry = ({
  route,
  component,
  defaultNamedComponent
}: {
  route: RouteHandlerRouteContext;
  component: RouteHandlerGeneratorComponent;
  defaultNamedComponent: (key: string) => ComponentImportSpec;
}): LoadableComponentEntry => {
  const label = `Component "${component.key}" for ${createRouteLabel(route)}`;
  const componentImport =
    component.componentImport == null
      ? defaultNamedComponent(component.key)
      : readComponentImportSpec(
          component.componentImport,
          `${label}.componentImport`
        );

  if (component.metadata == null) {
    return {
      key: component.key,
      componentImport,
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
    componentImport,
    metadata: component.metadata
  };
};

const normalizeGeneratorPlan = ({
  rootDir,
  route,
  capturedKeys,
  plan,
  componentsImport,
  runtimeHandlerFactoryImportBase
}: {
  rootDir: string;
  route: RouteHandlerRouteContext;
  capturedKeys: Array<string>;
  plan: RouteHandlerGeneratorPlan;
  componentsImport: ResolvedModuleReference;
  runtimeHandlerFactoryImportBase: ResolvedModuleReference;
}): {
  factoryVariant: string;
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

  const factoryVariant = validateFactoryVariant({
    rootDir,
    route,
    runtimeHandlerFactoryImportBase,
    factoryVariant: readObjectProperty(plan, 'factoryVariant') as string
  });

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

  const capturedKeySet = new Set(capturedKeys);
  for (const componentKey of returnedComponentsByKey.keys()) {
    if (!capturedKeySet.has(componentKey)) {
      throw createPipelineError(
        `Processor for ${createRouteLabel(route)} returned uncaptured component key "${componentKey}".`
      );
    }
  }

  const defaultNamedComponent = createDefaultNamedComponent(componentsImport);
  const componentEntries = capturedKeys.map(key => {
    const component = returnedComponentsByKey.get(key);
    if (component == null) {
      throw createPipelineError(
        `Processor for ${createRouteLabel(route)} is missing captured component key "${key}".`
      );
    }

    return normalizeComponentEntry({
      route,
      component,
      defaultNamedComponent
    });
  });

  return {
    factoryVariant,
    componentEntries
  };
};

export const resolveRouteHandlerProcessorCacheInfo = async ({
  rootDir,
  processorConfig,
  targetId
}: {
  rootDir: string;
  processorConfig: ResolvedRouteHandlerProcessorConfig;
  targetId?: string;
}): Promise<RouteHandlerProcessorCacheInfo> => {
  const processor = await loadProcessorModule({
    rootDir,
    processorImport: processorConfig.processorImport
  });
  const label = `processor module "${toImportSource(processorConfig.processorImport)}"`;

  return {
    inputImports: resolveProcessorCacheInputImports({
      rootDir,
      processor,
      label
    }),
    identity: await resolveProcessorCacheIdentity({
      processor,
      targetId,
      label
    })
  };
};

export const createRouteHandlerRoutePlanner = async ({
  rootDir,
  componentsImport,
  processorConfig,
  runtimeHandlerFactoryImportBase
}: {
  rootDir: string;
  componentsImport: ResolvedModuleReference;
  processorConfig: ResolvedRouteHandlerProcessorConfig;
  runtimeHandlerFactoryImportBase: ResolvedModuleReference;
}) => {
  const { processor } = await loadConfiguredProcessor({
    rootDir,
    processorConfig
  });
  const defaults = {
    namedComponent: createDefaultNamedComponent(componentsImport)
  };

  return async ({
    route,
    capturedKeys
  }: {
    route: RouteHandlerRouteContext;
    capturedKeys: Array<string>;
  }): Promise<{
    factoryVariant: string;
    componentEntries: Array<LoadableComponentEntry>;
  }> => {
    let resolved: unknown;
    try {
      resolved = await processor.ingress({
        route,
        capturedKeys
      });
    } catch (error) {
      throw createPipelineError(
        `Processor ingress failed for ${createRouteLabel(route)}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    let plan: RouteHandlerGeneratorPlan;
    try {
      plan = await processor.egress({
        route,
        capturedKeys,
        resolved,
        defaults
      });
    } catch (error) {
      throw createPipelineError(
        `Processor egress failed for ${createRouteLabel(route)}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return normalizeGeneratorPlan({
      rootDir,
      route,
      capturedKeys,
      plan,
      componentsImport,
      runtimeHandlerFactoryImportBase
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

