import path from 'node:path';

import {
  createConfigError,
  createConfigMissingError
} from '../../../utils/errors';
import type { RouteHandlerMdxCompileOptions } from '../../../core/types';
import type {
  RouteHandlerRouterKind,
  RouteHandlersConfigBase,
  RouteHandlersTargetConfigBase,
  ResolvedRouteHandlersConfigBase,
  ResolvedRouteHandlersRuntimeAttachments,
  ResolvedRouteHandlersAppConfig,
  RouteHandlerNextPaths
} from '../types';
import {
  deriveTargetIdFromRouteBasePath,
  normalizeHandlerRouteParam,
  normalizeRouteBasePath,
  normalizeTargetId,
  readContentLocaleModeOption,
  readEmitFormatOption,
  readRequiredStringOption
} from './options';
import { resolveConfiguredPathOption } from './paths';
import { isObjectRecord, readObjectProperty } from './shared';
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

type SingleTargetRouteHandlersConfig<
  TTarget extends RouteHandlersTargetConfigBase
> = RouteHandlersConfigBase<TTarget> | TTarget;

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
> & {
  routerKind: RouteHandlerRouterKind;
};

/**
 * Pure normalized runtime attachments derived from one configured target.
 */
export type NormalizedRouteHandlersTargetRuntimeAttachments =
  ResolvedRouteHandlersRuntimeAttachments;

const GENERATED_HANDLER_SEGMENT = 'generated-handlers';

export const requireSingleRouteHandlersConfigBase = <
  TTarget extends RouteHandlersTargetConfigBase
>(
  routeHandlersConfig: SingleTargetRouteHandlersConfig<TTarget> | undefined
): SingleTargetRouteHandlersConfig<TTarget> => {
  if (routeHandlersConfig == null) {
    throw createConfigMissingError('Missing routeHandlersConfig.');
  }

  if (isObjectRecord(routeHandlersConfig)) {
    const rawConfig = routeHandlersConfig as ObjectRecord;
    if (
      readObjectProperty<ObjectRecord, string>(rawConfig, 'targets') !==
      undefined
    ) {
      throw createConfigError(
        'Multi-target routeHandlersConfig is not supported in single-target resolution. Use the multi-target resolveRouteHandlersConfigsFromAppConfig(...) path.'
      );
    }
  }

  return routeHandlersConfig;
};

/**
 * Normalize runtime/executable attachments that should remain separate from
 * the structural resolved target config.
 *
 * @param routeHandlersConfig - Single-target `RouteHandlersConfig`.
 * @returns Pure normalized runtime attachments.
 */
export const normalizeRouteHandlersTargetRuntimeAttachments = (
  routeHandlersConfig?: SingleTargetRouteHandlersConfig<RouteHandlersTargetConfigBase>
): NormalizedRouteHandlersTargetRuntimeAttachments => {
  const configuredRouteHandlers =
    requireSingleRouteHandlersConfigBase(routeHandlersConfig);

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
  routeHandlersConfig:
    | SingleTargetRouteHandlersConfig<RouteHandlersTargetConfigBase>
    | undefined,
  routerKind: RouteHandlerRouterKind
): NormalizedRouteHandlersTargetOptions => {
  const configuredRouteHandlers =
    requireSingleRouteHandlersConfigBase(routeHandlersConfig);
  const resolvedRootDir = appConfig.rootDir;
  const generatedRootDir = readRequiredStringOption(
    resolveConfiguredPathOption({
      rootDir: resolvedRootDir,
      value: configuredRouteHandlers.generatedRootDir,
      label: 'generatedRootDir'
    }),
    'generatedRootDir'
  );
  const resolvedPaths: RouteHandlerNextPaths = {
    rootDir: resolvedRootDir,
    contentDir: readRequiredStringOption(
      resolveConfiguredPathOption({
        rootDir: resolvedRootDir,
        value: configuredRouteHandlers.contentDir,
        label: 'contentDir'
      }),
      'contentDir'
    ),
    generatedDir: path.join(generatedRootDir, GENERATED_HANDLER_SEGMENT)
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
    routerKind,
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
