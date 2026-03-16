import { compareStringArrays } from '../core/discovery';
import {
  getHandlerFactoryVariantResolverIdentity,
  type HandlerFactoryVariantResolverIdentity,
  isSameHandlerFactoryVariantResolverIdentity
} from '../core/runtime-variants';
import { isSameModuleReference } from '../module-reference';
import { createMdxCompileOptionsIdentity } from './mdx-compile-options-identity';

import type { LocaleConfig } from '../core/types';
import type {
  DynamicRouteParam,
  ResolvedRouteHandlersAppConfig,
  ResolvedRouteHandlersConfig,
  RouteHandlerNextPaths
} from './types';

/**
 * Pure-data identity for one resolved target in the adapter's
 * in-process rewrite cache.
 */
type RouteHandlerProcessConfigIdentity = Omit<
  ResolvedRouteHandlersConfig,
  'resolveHandlerFactoryVariant' | 'mdxCompileOptions'
> & {
  /**
   * Serializable variant resolver identity for cache comparison.
   */
  resolveHandlerFactoryVariant: HandlerFactoryVariantResolverIdentity;
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
const createRouteHandlerProcessConfigIdentity = (
  config: ResolvedRouteHandlersConfig
): RouteHandlerProcessConfigIdentity => ({
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
  resolveHandlerFactoryVariant: getHandlerFactoryVariantResolverIdentity(
    config.resolveHandlerFactoryVariant
  ),
  runtimeHandlerFactoryImportBase: {
    ...config.runtimeHandlerFactoryImportBase
  },
  baseStaticPropsImport: {
    ...config.baseStaticPropsImport
  },
  componentsImport: {
    ...config.componentsImport
  },
  pageConfigImport:
    config.pageConfigImport == null ? undefined : { ...config.pageConfigImport },
  mdxCompileOptionsIdentity: createMdxCompileOptionsIdentity(
    config.mdxCompileOptions
  ),
  routeBasePath: config.routeBasePath,
  paths: { ...config.paths }
});

/**
 * Create the structured identity used by the adapter's in-process cache.
 *
 * @param input - Process cache identity input.
 * @returns Structured process cache identity.
 */
export const createRouteHandlerProcessCacheIdentity = ({
  phase,
  configs
}: {
  phase: string;
  configs: Array<ResolvedRouteHandlersConfig>;
}): RouteHandlerProcessCacheIdentity => ({
  phase,
  configs: configs.map(createRouteHandlerProcessConfigIdentity)
});

/**
 * Compare two resolved app configs structurally.
 *
 * @param left - Left app config.
 * @param right - Right app config.
 * @returns `true` when both app configs are equal.
 */
const isSameResolvedRouteHandlersAppConfig = (
  left: ResolvedRouteHandlersAppConfig,
  right: ResolvedRouteHandlersAppConfig
): boolean =>
  left.rootDir === right.rootDir &&
  left.nextConfigPath === right.nextConfigPath;

/**
 * Compare two locale configs structurally.
 *
 * @param left - Left locale config.
 * @param right - Right locale config.
 * @returns `true` when both locale configs are equal.
 */
const isSameLocaleConfig = (left: LocaleConfig, right: LocaleConfig): boolean =>
  left.defaultLocale === right.defaultLocale &&
  compareStringArrays(left.locales, right.locales) === 0;

/**
 * Compare two dynamic route parameter descriptors structurally.
 *
 * @param left - Left route parameter.
 * @param right - Right route parameter.
 * @returns `true` when both parameters are equal.
 */
const isSameDynamicRouteParam = (
  left: DynamicRouteParam,
  right: DynamicRouteParam
): boolean => left.name === right.name && left.kind === right.kind;

/**
 * Compare two resolved route-handler path records structurally.
 *
 * @param left - Left path record.
 * @param right - Right path record.
 * @returns `true` when both path records are equal.
 */
const isSameRouteHandlerNextPaths = (
  left: RouteHandlerNextPaths,
  right: RouteHandlerNextPaths
): boolean =>
  left.rootDir === right.rootDir &&
  left.contentPagesDir === right.contentPagesDir &&
  left.handlersDir === right.handlersDir;

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

  if (
    !isSameHandlerFactoryVariantResolverIdentity(
      left.resolveHandlerFactoryVariant,
      right.resolveHandlerFactoryVariant
    )
  ) {
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

  if (left.pageConfigImport == null || right.pageConfigImport == null) {
    if (left.pageConfigImport !== right.pageConfigImport) {
      return false;
    }
  } else if (
    !isSameModuleReference(left.pageConfigImport, right.pageConfigImport)
  ) {
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
