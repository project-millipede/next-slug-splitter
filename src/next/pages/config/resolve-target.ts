import {
  isModuleReference,
  normalizeModuleReference,
  resolveModuleReferenceToPath
} from '../../../module-reference';
import {
  createConfigError,
  createConfigMissingError
} from '../../../utils/errors';
import type { RouteHandlerMdxCompileOptions } from '../../../core/types';
import type {
  ModuleReference,
  ResolvedRouteHandlersAppConfig,
  ResolvedRouteHandlersRuntimeAttachments,
  RouteHandlerNextPaths
} from '../../shared/types';
import type {
  ResolvedRouteHandlersConfigBase,
  RouteHandlersConfig,
  RouteHandlersTargetConfig
} from '../types';
export type { ResolvedRouteHandlersConfigBase } from '../types';

import { readProvidedOrRegisteredRouteHandlersConfig } from '../../integration/config-registry';
import { resolveRouteHandlerBinding } from '../../shared/config/handler-binding';
import {
  deriveTargetIdFromRouteBasePath,
  normalizeHandlerRouteParam,
  normalizeRouteBasePath,
  normalizeTargetId,
  readContentLocaleModeOption,
  readEmitFormatOption,
  readRequiredStringOption
} from '../../shared/config/options';
import { resolveConfiguredPathOption } from '../../shared/config/paths';
import { isObjectRecord, readObjectProperty } from '../../shared/config/shared';
import { ObjectRecord } from '../../../utils/type-guards-custom';

/**
 * Read and validate target-local MDX compile options.
 *
 * @param value - Candidate compile options value.
 * @returns Validated compile options.
 * @throws If a configured plugin list is not an array.
 */
const readMdxCompileOptions = (
  value: unknown
): RouteHandlerMdxCompileOptions => {
  if (value === undefined) {
    return {};
  }

  if (!isObjectRecord(value)) {
    throw createConfigError('mdxCompileOptions must be an object.');
  }

  const remarkPlugins = readObjectProperty(value, 'remarkPlugins');
  if (remarkPlugins !== undefined && !Array.isArray(remarkPlugins)) {
    throw createConfigError(
      'mdxCompileOptions.remarkPlugins must be an array.'
    );
  }

  const recmaPlugins = readObjectProperty(value, 'recmaPlugins');
  if (recmaPlugins !== undefined && !Array.isArray(recmaPlugins)) {
    throw createConfigError('mdxCompileOptions.recmaPlugins must be an array.');
  }

  return {
    remarkPlugins: Array.isArray(remarkPlugins)
      ? [...remarkPlugins]
      : undefined,
    recmaPlugins: Array.isArray(recmaPlugins) ? [...recmaPlugins] : undefined
  };
};

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
 * Pure normalized target options derived from one configured target before any
 * disk-backed module resolution occurs.
 */
export type NormalizedRouteHandlersTargetOptions = Pick<
  ResolvedRouteHandlersConfigBase,
  | 'targetId'
  | 'emitFormat'
  | 'contentLocaleMode'
  | 'handlerRouteParam'
  | 'routeBasePath'
  | 'paths'
>;

/**
 * Pure normalized runtime attachments derived from one configured target.
 */
export type NormalizedRouteHandlersTargetRuntimeAttachments =
  ResolvedRouteHandlersRuntimeAttachments;

const requireSingleRouteHandlersConfig = (
  routeHandlersConfig: RouteHandlersConfig | RouteHandlersTargetConfig | undefined
): RouteHandlersConfig | RouteHandlersTargetConfig => {
  const configuredRouteHandlers =
    readProvidedOrRegisteredRouteHandlersConfig(routeHandlersConfig);
  if (configuredRouteHandlers == null) {
    throw createConfigMissingError(
      'Missing registered routeHandlersConfig. Call withSlugSplitter(...) or createRouteHandlersAdapterPath(...) before exporting the Next config.'
    );
  }

  /**
   * TODO: FIX
   * Treat the config as a generic 'ObjectRecord' to safely check for the
   * 'targets' property, which may not exist on the current narrowed type.
   */
  if (isObjectRecord(configuredRouteHandlers)) {
    const rawConfig = configuredRouteHandlers as ObjectRecord;
    if (
      readObjectProperty<ObjectRecord, string>(rawConfig, 'targets') !==
      undefined
    ) {
      throw createConfigError(
        'Multi-target routeHandlersConfig is not supported in single-target resolution. Use the multi-target resolveRouteHandlersConfigsFromAppConfig(...) path.'
      );
    }
  }

  return configuredRouteHandlers;
};

/**
 * Normalize runtime/executable attachments that should remain separate from
 * the structural resolved target config.
 *
 * @param routeHandlersConfig - Single-target `RouteHandlersConfig`.
 * @returns Pure normalized runtime attachments.
 */
export const normalizeRouteHandlersTargetRuntimeAttachments = (
  routeHandlersConfig?: RouteHandlersConfig | RouteHandlersTargetConfig
): NormalizedRouteHandlersTargetRuntimeAttachments => {
  const configuredRouteHandlers =
    requireSingleRouteHandlersConfig(routeHandlersConfig);

  return {
    mdxCompileOptions: readMdxCompileOptions(
      readObjectProperty(configuredRouteHandlers, 'mdxCompileOptions')
    )
  };
};

/**
 * Normalize the pure target options that do not require module-resolution or
 * filesystem validation.
 *
 * @param appConfig - Resolved app-level config shared by all targets.
 * @param routeHandlersConfig - Single-target `RouteHandlersConfig`.
 * @returns Pure target options ready for later resolution steps.
 */
export const normalizeRouteHandlersTargetOptions = (
  appConfig: ResolvedRouteHandlersAppConfig,
  routeHandlersConfig?: RouteHandlersConfig | RouteHandlersTargetConfig
): NormalizedRouteHandlersTargetOptions => {
  const configuredRouteHandlers =
    requireSingleRouteHandlersConfig(routeHandlersConfig);

  if (
    configuredRouteHandlers.paths !== undefined &&
    !isObjectRecord(configuredRouteHandlers.paths)
  ) {
    throw createConfigError('paths must be an object.');
  }

  const configuredPaths = isObjectRecord(configuredRouteHandlers.paths)
    ? configuredRouteHandlers.paths
    : {};
  const resolvedRootDir = appConfig.rootDir;
  const resolvedPaths: RouteHandlerNextPaths = {
    rootDir: resolvedRootDir,
    contentPagesDir: readRequiredStringOption(
      resolveConfiguredPathOption({
        rootDir: resolvedRootDir,
        value: configuredPaths.contentPagesDir,
        label: 'paths.contentPagesDir'
      }),
      'paths.contentPagesDir'
    ),
    handlersDir: readRequiredStringOption(
      resolveConfiguredPathOption({
        rootDir: resolvedRootDir,
        value: configuredPaths.handlersDir,
        label: 'paths.handlersDir'
      }),
      'paths.handlersDir'
    )
  };
  const routeBasePath = normalizeRouteBasePath(
    readRequiredStringOption(
      configuredRouteHandlers.routeBasePath,
      'routeBasePath'
    )
  );
  const handlerRouteParam = normalizeHandlerRouteParam(
    configuredRouteHandlers.handlerRouteParam
  );
  let configuredTargetId = configuredRouteHandlers.targetId;
  if (configuredTargetId == null) {
    configuredTargetId = deriveTargetIdFromRouteBasePath(routeBasePath);
  }

  return {
    targetId: normalizeTargetId(configuredTargetId),
    emitFormat: readEmitFormatOption(configuredRouteHandlers.emitFormat),
    contentLocaleMode: readContentLocaleModeOption(
      configuredRouteHandlers.contentLocaleMode
    ),
    handlerRouteParam,
    routeBasePath,
    paths: resolvedPaths
  };
};

/**
 * Resolve the target-local config that is independent of locale extraction.
 *
 * @param appConfig - Resolved app-level config shared by all targets.
 * @param routeHandlersConfig - Single-target `RouteHandlersConfig`.
 * @returns Resolved target config without locale data attached.
 */
export const resolveRouteHandlersConfigBase = (
  appConfig: ResolvedRouteHandlersAppConfig,
  routeHandlersConfig?: RouteHandlersConfig | RouteHandlersTargetConfig
): ResolvedRouteHandlersConfigBase => {
  const configuredRouteHandlers =
    requireSingleRouteHandlersConfig(routeHandlersConfig);
  const readRequiredModuleReferenceOption = (
    value: unknown,
    label: string
  ): ModuleReference => {
    if (!isModuleReference(value)) {
      throw createConfigError(`${label} must be a module reference object.`);
    }

    return value;
  };

  // App-level config owns root resolution now, so target-local paths are only
  // allowed to override path fragments, not the root itself.
  const resolvedRootDir = appConfig.rootDir;
  const normalizedTargetOptions = normalizeRouteHandlersTargetOptions(
    appConfig,
    configuredRouteHandlers
  );
  const resolvedHandlerBinding = resolveRouteHandlerBinding({
    rootDir: resolvedRootDir,
    handlerBinding: configuredRouteHandlers.handlerBinding
  });
  const resolvedBaseStaticPropsImport = normalizeModuleReference(
    resolvedRootDir,
    readRequiredModuleReferenceOption(
      configuredRouteHandlers.baseStaticPropsImport,
      'baseStaticPropsImport'
    )
  );
  try {
    resolveModuleReferenceToPath(
      resolvedRootDir,
      resolvedBaseStaticPropsImport
    );
  } catch {
    throw createConfigError(
      `baseStaticPropsImport could not be resolved from "${resolvedRootDir}".`
    );
  }

  return {
    app: appConfig,
    ...normalizedTargetOptions,
    runtime: normalizeRouteHandlersTargetRuntimeAttachments(
      configuredRouteHandlers
    ),
    baseStaticPropsImport: resolvedBaseStaticPropsImport,
    processorConfig: resolvedHandlerBinding.processorConfig,
  };
};
