import {
  isModuleReference,
  normalizeModuleReference,
  resolveModuleReferenceToPath
} from '../../../module-reference';
import { createConfigError } from '../../../utils/errors';
import type {
  ModuleReference,
  ResolvedRouteHandlersAppConfig
} from '../../shared/types';
import type {
  ResolvedRouteHandlersConfigBase,
  RouteHandlersConfig,
  RouteHandlersTargetConfig
} from '../types';
import {
  normalizeRouteHandlersTargetOptions,
  normalizeRouteHandlersTargetRuntimeAttachments,
  requireSingleRouteHandlersConfigBase
} from '../../shared/config/resolve-target';

export type { ResolvedRouteHandlersConfigBase } from '../types';
export type {
  NormalizedRouteHandlersTargetOptions,
  NormalizedRouteHandlersTargetRuntimeAttachments
} from '../../shared/config/resolve-target';

import { resolveRouteHandlerBinding } from '../../shared/config/handler-binding';

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
 * Read one concrete target config from the Pages Router config input.
 *
 * @param routeHandlersConfig Raw target config or single-target config wrapper.
 * @returns The single target config expected by the Pages resolver.
 */
const requireSingleRouteHandlersConfig = (
  routeHandlersConfig: RouteHandlersConfig | RouteHandlersTargetConfig | undefined
): RouteHandlersConfig | RouteHandlersTargetConfig => {
  return requireSingleRouteHandlersConfigBase<RouteHandlersTargetConfig>(
    routeHandlersConfig
  ) as RouteHandlersConfig | RouteHandlersTargetConfig;
};

/**
 * Resolve the target-local config that is independent of locale extraction.
 *
 * @param appConfig Resolved app-level config shared by all targets.
 * @param routeHandlersConfig Raw target config or single-target config wrapper.
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
    configuredRouteHandlers,
    'pages'
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
    routerKind: 'pages',
    runtime: normalizeRouteHandlersTargetRuntimeAttachments(
      configuredRouteHandlers
    ),
    baseStaticPropsImport: resolvedBaseStaticPropsImport,
    processorConfig: resolvedHandlerBinding.processorConfig
  };
};
