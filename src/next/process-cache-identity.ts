import { compareStringArrays } from '../core/discovery';
import { resolveRouteHandlerProcessorCacheInfo } from '../core/processor-runner';
import {
  isSameModuleReference,
  type ResolvedModuleReference
} from '../module-reference';
import { createMdxCompileOptionsIdentity } from './mdx-compile-options-identity';

import type { LocaleConfig } from '../core/types';
import type {
  DynamicRouteParam,
  ResolvedRouteHandlersAppConfig,
  ResolvedRouteHandlersConfig,
  RouteHandlerNextPaths
} from './types';

type RouteHandlerProcessProcessorIdentity = {
  processorImport: ResolvedModuleReference;
  inputImports: Array<ResolvedModuleReference>;
  cacheIdentity?: string;
};

type RouteHandlerProcessConfigIdentity = Omit<
  ResolvedRouteHandlersConfig,
  'mdxCompileOptions' | 'processorConfig'
> & {
  /**
   * Serializable processor identity for cache comparison.
   */
  processor: RouteHandlerProcessProcessorIdentity;
  /**
   * Stable identity for target-local MDX compile options.
   */
  mdxCompileOptionsIdentity: string;
};

/**
 * Pure-data identity for one adapter rewrite-generation run.
 */
export type RouteHandlerProcessCacheIdentity = {
  /**
   * Current Next.js phase (e.g., 'phase-production-build').
   */
  phase: string;
  /**
   * Target config identities participating in this run.
   */
  configs: Array<RouteHandlerProcessConfigIdentity>;
};

/**
 * Convert a resolved target config into the adapter's pure-data cache identity.
 *
 * @param config - Resolved target config.
 * @returns Structured identity for one target.
 */
const createRouteHandlerProcessConfigIdentity = async (
  config: ResolvedRouteHandlersConfig
): Promise<RouteHandlerProcessConfigIdentity> => {
  const cacheInfo = await resolveRouteHandlerProcessorCacheInfo({
    rootDir: config.app.rootDir,
    processorConfig: config.processorConfig,
    targetId: config.targetId
  });

  return {
    app: {
      ...config.app
    },
    targetId: config.targetId,
    localeConfig: {
      locales: [...config.localeConfig.locales],
      defaultLocale: config.localeConfig.defaultLocale
    },
    emitFormat: config.emitFormat,
    contentLocaleMode: config.contentLocaleMode,
    handlerRouteParam: {
      ...config.handlerRouteParam
    },
    processor: {
      processorImport: { ...config.processorConfig.processorImport },
      inputImports: cacheInfo.inputImports.map(reference => ({ ...reference })),
      cacheIdentity: cacheInfo.identity
    },
    runtimeHandlerFactoryImportBase: {
      ...config.runtimeHandlerFactoryImportBase
    },
    baseStaticPropsImport: {
      ...config.baseStaticPropsImport
    },
    componentsImport: {
      ...config.componentsImport
    },
    mdxCompileOptionsIdentity: createMdxCompileOptionsIdentity(
      config.mdxCompileOptions
    ),
    routeBasePath: config.routeBasePath,
    paths: { ...config.paths }
  };
};

/**
 * Create the structured identity used by the adapter's in-process cache.
 *
 * @param input - Process cache identity input.
 * @returns Structured process cache identity.
 */
export const createRouteHandlerProcessCacheIdentity = async ({
  phase,
  configs
}: {
  phase: string;
  configs: Array<ResolvedRouteHandlersConfig>;
}): Promise<RouteHandlerProcessCacheIdentity> => ({
  phase,
  configs: await Promise.all(configs.map(createRouteHandlerProcessConfigIdentity))
});

const isSameResolvedRouteHandlersAppConfig = (
  left: ResolvedRouteHandlersAppConfig,
  right: ResolvedRouteHandlersAppConfig
): boolean =>
  left.rootDir === right.rootDir &&
  left.nextConfigPath === right.nextConfigPath &&
  left.routing.development === right.routing.development;

const isSameLocaleConfig = (left: LocaleConfig, right: LocaleConfig): boolean =>
  left.defaultLocale === right.defaultLocale &&
  compareStringArrays(left.locales, right.locales) === 0;

const isSameDynamicRouteParam = (
  left: DynamicRouteParam,
  right: DynamicRouteParam
): boolean => left.name === right.name && left.kind === right.kind;

const isSameRouteHandlerNextPaths = (
  left: RouteHandlerNextPaths,
  right: RouteHandlerNextPaths
): boolean =>
  left.rootDir === right.rootDir &&
  left.contentPagesDir === right.contentPagesDir &&
  left.handlersDir === right.handlersDir;

/**
 * Compare two processor identities structurally.
 *
 * @param left - Left processor identity.
 * @param right - Right processor identity.
 * @returns `true` when both processor identities are equal.
 */
const isSameProcessorIdentity = (
  left: RouteHandlerProcessProcessorIdentity,
  right: RouteHandlerProcessProcessorIdentity
): boolean => {
  if (!isSameModuleReference(left.processorImport, right.processorImport)) {
    return false;
  }

  if (left.cacheIdentity !== right.cacheIdentity) {
    return false;
  }

  if (left.inputImports.length !== right.inputImports.length) {
    return false;
  }

  return left.inputImports.every((reference, index) =>
    isSameModuleReference(reference, right.inputImports[index])
  );
};

/**
 * Compare two process-config identities structurally.
 *
 * @param left - Left target identity.
 * @param right - Right target identity.
 * @returns `true` when both target identities are equal.
 */
const isSameRouteHandlerProcessConfigIdentity = (
  left: RouteHandlerProcessConfigIdentity,
  right: RouteHandlerProcessConfigIdentity
): boolean => {
  if (!isSameResolvedRouteHandlersAppConfig(left.app, right.app)) {
    return false;
  }

  if (left.targetId !== right.targetId) {
    return false;
  }

  if (!isSameLocaleConfig(left.localeConfig, right.localeConfig)) {
    return false;
  }

  if (!isSameDynamicRouteParam(left.handlerRouteParam, right.handlerRouteParam)) {
    return false;
  }

  if (left.emitFormat !== right.emitFormat) {
    return false;
  }

  if (left.contentLocaleMode !== right.contentLocaleMode) {
    return false;
  }

  if (!isSameProcessorIdentity(left.processor, right.processor)) {
    return false;
  }

  if (
    !isSameModuleReference(
      left.runtimeHandlerFactoryImportBase,
      right.runtimeHandlerFactoryImportBase
    )
  ) {
    return false;
  }

  if (!isSameModuleReference(left.baseStaticPropsImport, right.baseStaticPropsImport)) {
    return false;
  }

  if (!isSameModuleReference(left.componentsImport, right.componentsImport)) {
    return false;
  }

  if (left.mdxCompileOptionsIdentity !== right.mdxCompileOptionsIdentity) {
    return false;
  }

  if (left.routeBasePath !== right.routeBasePath) {
    return false;
  }

  return isSameRouteHandlerNextPaths(left.paths, right.paths);
};

/**
 * Compare two adapter process-cache identities structurally.
 *
 * @param left - Left process identity.
 * @param right - Right process identity.
 * @returns `true` when both identities describe the same rewrite-generation
 * inputs.
 */
export const isSameRouteHandlerProcessCacheIdentity = (
  left: RouteHandlerProcessCacheIdentity,
  right: RouteHandlerProcessCacheIdentity
): boolean => {
  if (left.phase !== right.phase) {
    return false;
  }

  if (left.configs.length !== right.configs.length) {
    return false;
  }

  const rightConfigIterator = right.configs.values();

  for (const leftConfig of left.configs) {
    const nextRightConfig = rightConfigIterator.next();
    if (nextRightConfig.done) {
      return false;
    }

    if (!isSameRouteHandlerProcessConfigIdentity(leftConfig, nextRightConfig.value)) {
      return false;
    }
  }

  return true;
};
