import path from 'node:path';

import {
  isModuleReference,
  normalizeModuleReference,
  resolveModuleReferenceToPath,
  type ResolvedModuleReference
} from '../../../module-reference';
import { createConfigError } from '../../../utils/errors';
import { readObjectProperty } from '../../shared/config/shared';
import { resolveRouteHandlerProcessorImport } from '../../shared/config/handler-binding';
import type {
  ModuleReference,
  ResolvedRouteHandlersAppConfig
} from '../../shared/types';
import {
  normalizeRouteHandlersTargetOptions as normalizeSharedRouteHandlersTargetOptions,
  normalizeRouteHandlersTargetRuntimeAttachments as normalizeSharedRouteHandlersTargetRuntimeAttachments,
  requireSingleRouteHandlersConfigBase,
  type NormalizedRouteHandlersTargetOptions,
  type NormalizedRouteHandlersTargetRuntimeAttachments
} from '../../shared/config/resolve-target';
import { inspectAppRouteModuleContract } from '../runtime/route-module';

import type {
  AppRouteHandlerBinding,
  ResolvedRouteHandlersConfigBase,
  RouteHandlersConfig,
  RouteHandlersTargetConfig
} from '../types';

export type { ResolvedRouteHandlersConfigBase } from '../types';

/**
 * Input for resolving one App Router target config.
 */
export type ResolveRouteHandlersConfigBaseInput = {
  /**
   * Resolved app-level config shared by all targets.
   */
  appConfig: ResolvedRouteHandlersAppConfig;
  /**
   * Single-target route-handlers config.
   */
  routeHandlersConfig?: RouteHandlersConfig | RouteHandlersTargetConfig;
};

/**
 * Pure normalized target record shared by the App Router config loaders.
 */
export type NormalizedAppRouteHandlersTargetOptions =
  NormalizedRouteHandlersTargetOptions;

/**
 * Pure normalized runtime attachments for one App Router target.
 */
export type NormalizedAppRouteHandlersTargetRuntimeAttachments =
  NormalizedRouteHandlersTargetRuntimeAttachments;

/**
 * Read one required module-reference option from a raw target config.
 *
 * @param value Unknown configured value.
 * @param label Human-readable option label used in error messages.
 * @returns The validated module reference.
 */
const readRequiredModuleReferenceOption = (
  value: unknown,
  label: string
): ModuleReference => {
  if (!isModuleReference(value)) {
    throw createConfigError(`${label} must be a module reference object.`);
  }

  return value;
};

/**
 * Resolve the optional App-only page-data compiler module reference.
 *
 * @param rootDir Application root used to resolve module references.
 * @param handlerBinding App target binding block.
 * @returns Resolved App compiler config when configured.
 */
const resolveAppPageDataCompilerConfig = (
  rootDir: string,
  handlerBinding: unknown
): { pageDataCompilerImport: ResolvedModuleReference } | undefined => {
  if (handlerBinding == null || typeof handlerBinding !== 'object') {
    return undefined;
  }

  const configuredCompilerImport = readObjectProperty(
    handlerBinding as Record<string, unknown>,
    'pageDataCompilerImport'
  );

  if (configuredCompilerImport == null) {
    return undefined;
  }

  if (!isModuleReference(configuredCompilerImport)) {
    throw createConfigError(
      'handlerBinding.pageDataCompilerImport must be a module reference object when provided.'
    );
  }

  const pageDataCompilerImport = normalizeModuleReference(
    rootDir,
    configuredCompilerImport
  );

  try {
    resolveModuleReferenceToPath(rootDir, pageDataCompilerImport);
  } catch {
    throw createConfigError(
      `handlerBinding.pageDataCompilerImport "${pageDataCompilerImport.kind === 'package' ? pageDataCompilerImport.specifier : pageDataCompilerImport.path}" could not be resolved from "${rootDir}".`
    );
  }

  return {
    pageDataCompilerImport
  };
};

/**
 * Normalize the optional runtime-attachment block for one App target.
 *
 * @param routeHandlersConfig Raw target config or single-target config wrapper.
 * @returns Normalized runtime attachments.
 */
export const normalizeRouteHandlersTargetRuntimeAttachments = (
  routeHandlersConfig?: RouteHandlersConfig | RouteHandlersTargetConfig
): NormalizedAppRouteHandlersTargetRuntimeAttachments =>
  normalizeSharedRouteHandlersTargetRuntimeAttachments(routeHandlersConfig);

/**
 * Normalize target-local App Router options.
 *
 * @param appConfig Resolved app-level config shared by all targets.
 * @param routeHandlersConfig Raw target config or single-target config wrapper.
 * @returns Normalized target options.
 */
export const normalizeRouteHandlersTargetOptions = (
  appConfig: ResolvedRouteHandlersAppConfig,
  routeHandlersConfig?: RouteHandlersConfig | RouteHandlersTargetConfig
): NormalizedAppRouteHandlersTargetOptions =>
  normalizeSharedRouteHandlersTargetOptions(
    appConfig,
    routeHandlersConfig,
    'app'
  );

/**
 * Resolve the target-local config for the App Router path.
 *
 * @param appConfig Resolved app-level config shared by all targets.
 * @param routeHandlersConfig Raw target config or single-target config wrapper.
 * @returns Fully resolved App target config.
 */
export const resolveRouteHandlersConfigBase = async (
  appConfig: ResolvedRouteHandlersAppConfig,
  routeHandlersConfig?: RouteHandlersConfig | RouteHandlersTargetConfig
): Promise<ResolvedRouteHandlersConfigBase> => {
  const configuredRouteHandlers =
    requireSingleRouteHandlersConfigBase<RouteHandlersTargetConfig>(
      routeHandlersConfig
    );
  const typedConfiguredRouteHandlers = configuredRouteHandlers as
    | RouteHandlersConfig
    | RouteHandlersTargetConfig;
  const resolvedRootDir = appConfig.rootDir;
  const normalizedTargetOptions = normalizeRouteHandlersTargetOptions(
    appConfig,
    typedConfiguredRouteHandlers
  );
  const processorImport = resolveRouteHandlerProcessorImport({
    rootDir: resolvedRootDir,
    handlerBinding: typedConfiguredRouteHandlers.handlerBinding
  });
  const resolvedPageDataCompilerConfig = resolveAppPageDataCompilerConfig(
    resolvedRootDir,
    typedConfiguredRouteHandlers.handlerBinding
  );
  const resolvedRouteContract = normalizeModuleReference(
    resolvedRootDir,
    readRequiredModuleReferenceOption(
      typedConfiguredRouteHandlers.routeContract,
      'routeContract'
    )
  );

  try {
    resolveModuleReferenceToPath(resolvedRootDir, resolvedRouteContract);
  } catch {
    throw createConfigError(
      `routeContract could not be resolved from "${resolvedRootDir}".`
    );
  }

  // Route-module inspection runs after path normalization and module
  // validation so later generator/runtime code can rely on a stable contract.
  return {
    app: appConfig,
    ...normalizedTargetOptions,
    routerKind: 'app',
    runtime: normalizeRouteHandlersTargetRuntimeAttachments(
      typedConfiguredRouteHandlers
    ),
    routeContract: resolvedRouteContract,
    handlerRouteSegment: path.basename(
      normalizedTargetOptions.paths.generatedDir
    ),
    routeModule: await inspectAppRouteModuleContract({
      rootDir: resolvedRootDir,
      routeContract: resolvedRouteContract
    }),
    processorConfig: {
      processorImport
    },
    ...(resolvedPageDataCompilerConfig == null
      ? {}
      : {
          pageDataCompilerConfig: resolvedPageDataCompilerConfig
        })
  };
};
