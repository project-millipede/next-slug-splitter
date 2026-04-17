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

/**
 * Check whether a processor module path can be loaded directly by Node without
 * an extra transpilation step.
 *
 * @param modulePath Absolute module path chosen for the processor import.
 * @returns `true` when the path has a native JavaScript extension.
 */
const isNativelyImportableModulePath = (modulePath: string): boolean => {
  const extension = path.extname(modulePath);

  return extension === '.js' || extension === '.mjs' || extension === '.cjs';
};

/**
 * Import one processor module namespace without assuming its export shape.
 *
 * @param modulePath Absolute processor module path.
 * @returns Imported module namespace value, left as `unknown` until the
 * caller validates the expected exports.
 */
const loadModuleExports = async (modulePath: string): Promise<unknown> => {
  if (!isNativelyImportableModulePath(modulePath)) {
    throw createPipelineError(
      `Processor module "${modulePath}" must resolve to a native JavaScript module (.js, .mjs, or .cjs).`
    );
  }

  // Convert the absolute filesystem path into a correctly escaped file URL
  // before handing it to Node's module loader.
  const moduleUrl = pathToFileURL(modulePath);

  // Dynamic import consumes a module specifier string, so pass the serialized
  // file URL instead of the URL object itself.
  return await import(moduleUrl.href);
};

/**
 * Check whether one unknown runtime value matches the supported processor
 * contract.
 *
 * @param value Unknown value to validate.
 * @returns `true` when the value exposes `resolve(...)` and does not still use
 * the removed `plan(...)` API.
 */
const isRouteHandlerProcessor = (
  value: unknown
): value is RouteHandlerProcessor => {
  if (!isObjectRecord(value)) {
    return false;
  }

  const plan = readObjectProperty(value, 'plan');
  if (plan != null) {
    return false;
  }

  const resolve = readObjectProperty(value, 'resolve');
  return isFunction(resolve);
};

/**
 * Require one unknown runtime value to satisfy the supported processor
 * contract.
 *
 * @param value Unknown value to validate.
 * @param label Human-readable label used in validation errors.
 * @returns Validated route-handler processor.
 */
const requireRouteHandlerProcessor = (
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

  if (!isRouteHandlerProcessor(value)) {
    throw createPipelineError(`${label}.resolve must be a function.`);
  }

  return value;
};

/**
 * Resolve, import, and validate one configured processor module.
 *
 * @param rootDir Application root directory used to resolve module imports.
 * @param processorImport Resolved processor module reference.
 * @returns Validated route-handler processor export.
 */
const loadProcessorModule = async ({
  rootDir,
  processorImport
}: {
  rootDir: string;
  processorImport: ResolvedModuleReference;
}): Promise<RouteHandlerProcessor> => {
  const processorPath = resolveModuleReferenceToPath(rootDir, processorImport);
  const processorModule = await loadModuleExports(processorPath);

  if (!isObjectRecord(processorModule)) {
    throw createPipelineError(
      `processor module "${processorPath}" must be an object.`
    );
  }

  const exportedProcessor = readObjectProperty(
    processorModule,
    'routeHandlerProcessor'
  );

  if (exportedProcessor == null) {
    throw createPipelineError(
      `processor module "${processorPath}" must export routeHandlerProcessor.`
    );
  }

  return requireRouteHandlerProcessor(
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
