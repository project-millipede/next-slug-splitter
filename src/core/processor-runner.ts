import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveModuleReferenceToPath } from '../module-reference';
import { createPipelineError } from '../utils/errors';
import { isFunction } from '../utils/type-guards';
import {
  isObjectRecord,
  readObjectProperty
} from '../utils/type-guards-custom';
import { toRoutePath } from './discovery';
import { normalizeGeneratorPlan } from './normalize-generator-plan';

import type { ResolvedModuleReference } from '../module-reference';
import type {
  CreateRouteContextInput,
  LoadableComponentEntry,
  ResolvedFactoryBindings,
  ResolvedRouteHandlerProcessorConfig,
  RouteHandlerGeneratorPlan,
  RouteHandlerProcessor,
  RouteHandlerRouteContext
} from './types';

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
  const processorPath = resolveModuleReferenceToPath(rootDir, processorImport);
  const processorModule = await loadModuleExports(processorPath);
  const exportedProcessor = readObjectProperty(
    processorModule,
    'routeHandlerProcessor'
  );

  if (exportedProcessor == null) {
    throw createPipelineError(
      `processor module "${processorPath}" must export routeHandlerProcessor.`
    );
  }

  return readRouteHandlerProcessor(
    exportedProcessor,
    `processor module "${processorPath}"`
  );
};

/** Build a human-readable label for error messages identifying a specific route. */
const createRouteLabel = (route: RouteHandlerRouteContext): string =>
  `target "${route.targetId ?? 'default'}", route "${route.routePath}", handler "${route.handlerId}"`;

export const createRouteHandlerRoutePlanner = async ({
  rootDir,
  processorConfig
}: {
  rootDir: string;
  processorConfig: ResolvedRouteHandlerProcessorConfig;
}) => {
  const processor = await loadProcessorModule({
    rootDir,
    processorImport: processorConfig.processorImport
  });

  return async ({
    route,
    capturedComponentKeys
  }: {
    route: RouteHandlerRouteContext;
    capturedComponentKeys: Array<string>;
  }): Promise<{
    factoryImport: ResolvedModuleReference;
    factoryBindings?: ResolvedFactoryBindings;
    componentEntries: Array<LoadableComponentEntry>;
  }> => {
    const routeLabel = createRouteLabel(route);
    let generatorPlan: RouteHandlerGeneratorPlan;
    try {
      generatorPlan = await processor.resolve({
        route,
        capturedComponentKeys
      });
    } catch (error) {
      throw createPipelineError(
        `Processor resolve failed for ${routeLabel}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return normalizeGeneratorPlan({
      rootDir,
      routeLabel,
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
