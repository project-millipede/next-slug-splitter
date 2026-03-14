import {
  isModuleReference,
  normalizeModuleReferenceFromRoot,
  resolveModuleReferenceToPath
} from '../../module-reference';
import {
  createConfigError,
  createConfigMissingError
} from '../../utils/errors';
import type {
  ModuleReference,
  ResolvedRouteHandlersAppConfig,
  ResolvedRouteHandlersConfigBase,
  RouteHandlerNextPaths,
  RouteHandlersConfig,
  RouteHandlersTargetConfig
} from '../types';
export type { ResolvedRouteHandlersConfigBase } from '../types';

import { readProvidedOrRegisteredRouteHandlersConfig } from '../integration/adapter-entry';
import { resolveRouteHandlerBinding } from './handler-binding';
import {
  deriveTargetIdFromRouteBasePath,
  normalizeHandlerRouteParam,
  normalizeRouteBasePath,
  normalizeTargetId,
  readContentLocaleModeOption,
  readEmitFormatOption,
  readRequiredStringOption
} from './options';
import {
  resolveConfiguredPathOption,
} from './paths';
import { isObjectRecord, readObjectProperty } from './shared';

/**
 * Input for resolving the target-local config.
 */
export type ResolveRouteHandlersConfigBaseInput = {
  /**
   * Resolved app-level config shared by all targets.
   */
  appConfig: ResolvedRouteHandlersAppConfig;
  /**
   * Single-target `RouteHandlersConfig`.
   */
  routeHandlersConfig?: RouteHandlersConfig | RouteHandlersTargetConfig;
};

/**
 * Resolve the target-local config that is independent of locale extraction.
 *
 * @param input - Target-base resolution input.
 * @returns Resolved target config without locale data attached.
 */
export const resolveRouteHandlersConfigBase = ({
  appConfig,
  routeHandlersConfig
}: ResolveRouteHandlersConfigBaseInput): ResolvedRouteHandlersConfigBase => {
  const configuredRouteHandlers =
    readProvidedOrRegisteredRouteHandlersConfig(routeHandlersConfig);
  if (configuredRouteHandlers == null) {
    throw createConfigMissingError(
      'Missing registered routeHandlersConfig. Call withSlugSplitter(...) or createRouteHandlersAdapterPath(...) before exporting the Next config.'
    );
  }
  if (readObjectProperty(configuredRouteHandlers, 'targets') !== undefined) {
    throw createConfigError(
      'Multi-target routeHandlersConfig is not supported in resolveRouteHandlersConfig(...). Use resolveRouteHandlersConfigs(...).'
    );
  }
  if (
    configuredRouteHandlers.paths !== undefined &&
    !isObjectRecord(configuredRouteHandlers.paths)
  ) {
    throw createConfigError('paths must be an object.');
  }

  const configuredPaths = isObjectRecord(configuredRouteHandlers.paths)
    ? configuredRouteHandlers.paths
    : {};
  const readRequiredModuleReferenceOption = ({
    value,
    label
  }: {
    value: unknown;
    label: string;
  }): ModuleReference => {
    if (!isModuleReference(value)) {
      throw createConfigError(`${label} must be a module reference object.`);
    }

    return value;
  };
  if (readObjectProperty(configuredPaths, 'rootDir') !== undefined) {
    throw createConfigError(
      'paths.rootDir is no longer supported. Configure routeHandlersConfig.app.rootDir instead.'
    );
  }
  if (
    readObjectProperty(configuredPaths, 'buildtimeHandlerRegistryImport') !==
    undefined
  ) {
    throw createConfigError(
      'paths.buildtimeHandlerRegistryImport has been replaced by handlerBinding.registryImport.'
    );
  }
  if (
    readObjectProperty(configuredRouteHandlers, 'runtimeHandlerFactoryImport') !==
    undefined
  ) {
    throw createConfigError(
      'runtimeHandlerFactoryImport has been replaced by handlerBinding.runtimeFactory.importBase.'
    );
  }
  if (
    readObjectProperty(configuredRouteHandlers, 'resolveHandlerFactoryVariant') !==
    undefined
  ) {
    throw createConfigError(
      'resolveHandlerFactoryVariant has been replaced by handlerBinding.runtimeFactory.variantStrategy.'
    );
  }

  // App-level config owns root resolution now, so target-local paths are only
  // allowed to override path fragments, not the root itself.
  const resolvedRootDir = appConfig.rootDir;
  const resolvedHandlerBinding = resolveRouteHandlerBinding({
    rootDir: resolvedRootDir,
    handlerBinding: configuredRouteHandlers.handlerBinding
  });
  const resolvedBaseStaticPropsImport = normalizeModuleReferenceFromRoot({
    rootDir: resolvedRootDir,
    reference: readRequiredModuleReferenceOption({
      value: configuredRouteHandlers.baseStaticPropsImport,
      label: 'baseStaticPropsImport'
    })
  });
  try {
    resolveModuleReferenceToPath({
      rootDir: resolvedRootDir,
      reference: resolvedBaseStaticPropsImport
    });
  } catch {
    throw createConfigError(
      `baseStaticPropsImport could not be resolved from "${resolvedRootDir}".`
    );
  }
  const resolvedPaths: RouteHandlerNextPaths = {
    rootDir: resolvedRootDir,
    contentPagesDir: readRequiredStringOption({
      value: resolveConfiguredPathOption({
        rootDir: resolvedRootDir,
        value: configuredPaths.contentPagesDir,
        label: 'paths.contentPagesDir'
      }),
      label: 'paths.contentPagesDir'
    }),
    buildtimeHandlerRegistryPath: resolvedHandlerBinding.buildtimeHandlerRegistryPath,
    handlersDir: readRequiredStringOption({
      value: resolveConfiguredPathOption({
        rootDir: resolvedRootDir,
        value: configuredPaths.handlersDir,
        label: 'paths.handlersDir'
      }),
      label: 'paths.handlersDir'
    })
  };
  const routeBasePath = normalizeRouteBasePath(
    readRequiredStringOption({
      value: configuredRouteHandlers.routeBasePath,
      label: 'routeBasePath'
    })
  );
  const handlerRouteParam = normalizeHandlerRouteParam(
    configuredRouteHandlers.handlerRouteParam
  );
  let configuredTargetId = configuredRouteHandlers.targetId;
  if (configuredTargetId == null) {
    configuredTargetId = deriveTargetIdFromRouteBasePath(routeBasePath);
  }
  const targetId = normalizeTargetId(configuredTargetId);

  return {
    app: appConfig,
    targetId,
    emitFormat: readEmitFormatOption(configuredRouteHandlers.emitFormat),
    contentLocaleMode: readContentLocaleModeOption(
      configuredRouteHandlers.contentLocaleMode
    ),
    handlerRouteParam,
    resolveHandlerFactoryVariant:
      resolvedHandlerBinding.resolveHandlerFactoryVariant,
    runtimeHandlerFactoryImportBase:
      resolvedHandlerBinding.runtimeHandlerFactoryImportBase,
    baseStaticPropsImport: resolvedBaseStaticPropsImport,
    routeBasePath,
    paths: resolvedPaths
  };
};
