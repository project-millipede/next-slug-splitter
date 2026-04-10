import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { isModuleReference } from '../../module-reference';
import { isArrayOf, isString } from '../../utils/type-guards';
import {
  isObjectRecordOf,
  isStringArray,
  readObjectProperty
} from '../../utils/type-guards-custom';
import { isDynamicRouteParamKind } from '../shared/config/shared';

import type {
  ContentLocaleMode,
  DynamicRouteParam,
  EmitFormat,
  LocaleConfig,
  ResolvedRouteHandlerProcessorConfig
} from '../../core/types';
import type { BootstrapGenerationToken } from './runtime/types';
import type {
  RouteHandlerNextPaths
} from '../shared/types';
import type {
  ResolvedRouteHandlersConfig,
  RouteHandlerPlannerConfig
} from '../pages/types';
import type { RouteHandlerLazyResolvedTarget } from './lazy/types';

const ROUTE_HANDLER_PROXY_BOOTSTRAP_VERSION = 1;
const ROUTE_HANDLER_PROXY_BOOTSTRAP_PATH = path.join(
  '.next',
  'cache',
  'route-handlers-worker-bootstrap.json'
);

type PersistedRouteHandlerProxyBootstrapPaths = Pick<
  RouteHandlerNextPaths,
  'rootDir' | 'contentPagesDir' | 'handlersDir'
>;

/**
 * Persisted structural worker target entry.
 */
export type PersistedRouteHandlerProxyBootstrapTarget = Pick<
  RouteHandlerPlannerConfig,
  | 'targetId'
  | 'routeBasePath'
  | 'contentLocaleMode'
  | 'emitFormat'
  | 'handlerRouteParam'
  | 'baseStaticPropsImport'
  | 'processorConfig'
> & {
  paths: PersistedRouteHandlerProxyBootstrapPaths;
};

type StructuralRouteHandlerPlannerConfig = Omit<
  RouteHandlerPlannerConfig,
  'runtime'
>;

/**
 * Persisted structural worker bootstrap contract.
 */
export type PersistedRouteHandlerProxyBootstrap = {
  /**
   * Persisted manifest schema version.
   *
   * Used to reject stale on-disk bootstrap artifacts after structural format
   * changes.
   */
  version: number;

  /**
   * Adapter-owned generation token for the current proxy bootstrap cycle.
   *
   * Used to distinguish the current manifest from older bootstrap writes that
   * may still exist on disk.
   */
  bootstrapGenerationToken: BootstrapGenerationToken;

  /**
   * Shared locale semantics used by every persisted target entry.
   *
   * This stays at the manifest root because it is app-wide state rather than
   * per-target structure.
   */
  localeConfig: LocaleConfig;

  /**
   * Persisted structural target entries available to the worker.
   *
   * Each entry contains the serializable target subset needed to reconstruct
   * worker planner state without persisting runtime attachments.
   */
  targets: Array<PersistedRouteHandlerProxyBootstrapTarget>;
};

const isContentLocaleMode = (value: unknown): value is ContentLocaleMode =>
  value === 'filename' || value === 'default-locale';

const isEmitFormat = (value: unknown): value is EmitFormat =>
  value === 'js' || value === 'ts';

const isDynamicRouteParam = (value: unknown): value is DynamicRouteParam => {
  if (!isObjectRecordOf<DynamicRouteParam>(value)) {
    return false;
  }

  return (
    isString(readObjectProperty(value, 'name')) &&
    isDynamicRouteParamKind(readObjectProperty(value, 'kind'))
  );
};

const isLocaleConfig = (value: unknown): value is LocaleConfig => {
  if (!isObjectRecordOf<LocaleConfig>(value)) {
    return false;
  }

  const locales = readObjectProperty(value, 'locales');
  const defaultLocale = readObjectProperty(value, 'defaultLocale');

  return isStringArray(locales) && isString(defaultLocale);
};

const isPersistedRouteHandlerProcessorConfig = (
  value: unknown
): value is ResolvedRouteHandlerProcessorConfig => {
  if (!isObjectRecordOf<ResolvedRouteHandlerProcessorConfig>(value)) {
    return false;
  }

  return (
    readObjectProperty(value, 'kind') === 'module' &&
    isModuleReference(readObjectProperty(value, 'processorImport'))
  );
};

const isPersistedRouteHandlerProxyBootstrapPaths = (
  value: unknown
): value is PersistedRouteHandlerProxyBootstrapPaths => {
  if (!isObjectRecordOf<PersistedRouteHandlerProxyBootstrapPaths>(value)) {
    return false;
  }

  return (
    isString(readObjectProperty(value, 'rootDir')) &&
    isString(readObjectProperty(value, 'contentPagesDir')) &&
    isString(readObjectProperty(value, 'handlersDir'))
  );
};

const isPersistedRouteHandlerProxyBootstrapTarget = (
  value: unknown
): value is PersistedRouteHandlerProxyBootstrapTarget => {
  if (!isObjectRecordOf<PersistedRouteHandlerProxyBootstrapTarget>(value)) {
    return false;
  }

  return (
    isString(readObjectProperty(value, 'targetId')) &&
    isString(readObjectProperty(value, 'routeBasePath')) &&
    isContentLocaleMode(readObjectProperty(value, 'contentLocaleMode')) &&
    isEmitFormat(readObjectProperty(value, 'emitFormat')) &&
    isDynamicRouteParam(readObjectProperty(value, 'handlerRouteParam')) &&
    isModuleReference(readObjectProperty(value, 'baseStaticPropsImport')) &&
    isPersistedRouteHandlerProcessorConfig(
      readObjectProperty(value, 'processorConfig')
    ) &&
    isPersistedRouteHandlerProxyBootstrapPaths(
      readObjectProperty(value, 'paths')
    )
  );
};

const isPersistedRouteHandlerProxyBootstrap = (
  value: unknown
): value is PersistedRouteHandlerProxyBootstrap => {
  if (!isObjectRecordOf<PersistedRouteHandlerProxyBootstrap>(value)) {
    return false;
  }

  return (
    readObjectProperty(value, 'version') ===
      ROUTE_HANDLER_PROXY_BOOTSTRAP_VERSION &&
    isString(readObjectProperty(value, 'bootstrapGenerationToken')) &&
    isLocaleConfig(readObjectProperty(value, 'localeConfig')) &&
    isArrayOf(isPersistedRouteHandlerProxyBootstrapTarget)(
      readObjectProperty(value, 'targets')
    )
  );
};

/**
 * Create one bootstrap generation token owned by the adapter bootstrap.
 *
 * @returns Stable generation token.
 */
export const createRouteHandlerProxyBootstrapGenerationToken =
  (): BootstrapGenerationToken =>
    `route-handler-proxy-bootstrap-${randomUUID()}`;

/**
 * Resolve the persisted structural bootstrap path.
 *
 * @param rootDir - Application root directory.
 * @returns Absolute manifest path.
 */
export const resolveRouteHandlerProxyBootstrapPath = (
  rootDir: string
): string => path.join(rootDir, ROUTE_HANDLER_PROXY_BOOTSTRAP_PATH);

/**
 * Build the persisted structural bootstrap manifest from fully resolved target
 * configs.
 *
 * @param bootstrapGenerationToken - Adapter-owned bootstrap generation token.
 * @param localeConfig - Shared locale semantics.
 * @param resolvedConfigs - Fully resolved configs for the current proxy bootstrap.
 * @returns Persisted structural bootstrap manifest.
 */
export const createRouteHandlerProxyBootstrapManifest = (
  bootstrapGenerationToken: BootstrapGenerationToken,
  localeConfig: LocaleConfig,
  resolvedConfigs: Array<ResolvedRouteHandlersConfig>
): PersistedRouteHandlerProxyBootstrap => ({
  version: ROUTE_HANDLER_PROXY_BOOTSTRAP_VERSION,
  bootstrapGenerationToken,
  localeConfig: {
    locales: [...localeConfig.locales],
    defaultLocale: localeConfig.defaultLocale
  },
  targets: resolvedConfigs.map(config => ({
    targetId: config.targetId,
    routeBasePath: config.routeBasePath,
    contentLocaleMode: config.contentLocaleMode,
    emitFormat: config.emitFormat,
    handlerRouteParam: config.handlerRouteParam,
    baseStaticPropsImport: config.baseStaticPropsImport,
    processorConfig: config.processorConfig,
    paths: {
      rootDir: config.paths.rootDir,
      contentPagesDir: config.paths.contentPagesDir,
      handlersDir: config.paths.handlersDir
    }
  }))
});

/**
 * Persist the structural worker bootstrap manifest.
 *
 * @param rootDir - Application root directory.
 * @param manifest - Structural bootstrap manifest to persist.
 * @returns A promise that settles after the manifest is written.
 */
export const writeRouteHandlerProxyBootstrap = async (
  rootDir: string,
  manifest: PersistedRouteHandlerProxyBootstrap
): Promise<void> => {
  const manifestPath = resolveRouteHandlerProxyBootstrapPath(rootDir);

  await mkdir(path.dirname(manifestPath), {
    recursive: true
  });
  await writeFile(
    manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );
};

/**
 * Read and validate the persisted structural worker bootstrap manifest.
 *
 * @param rootDir - Application root directory.
 * @returns Decoded manifest, or `null` when missing/invalid.
 */
export const readRouteHandlerProxyBootstrap = async (
  rootDir: string
): Promise<PersistedRouteHandlerProxyBootstrap | null> => {
  try {
    const raw = await readFile(
      resolveRouteHandlerProxyBootstrapPath(rootDir),
      'utf8'
    );
    const parsed = JSON.parse(raw);

    return isPersistedRouteHandlerProxyBootstrap(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Convert the structural bootstrap manifest into lightweight request-resolution
 * targets.
 *
 * @param manifest - Structural worker bootstrap manifest.
 * @returns Lightweight request-resolution targets.
 */
export const createRouteHandlerLazyResolvedTargetsFromProxyBootstrap = (
  manifest: PersistedRouteHandlerProxyBootstrap
): Array<RouteHandlerLazyResolvedTarget> =>
  manifest.targets.map(target => ({
    targetId: target.targetId,
    routeBasePath: target.routeBasePath,
    contentLocaleMode: target.contentLocaleMode,
    localeConfig: {
      locales: [...manifest.localeConfig.locales],
      defaultLocale: manifest.localeConfig.defaultLocale
    },
    emitFormat: target.emitFormat,
    paths: {
      contentPagesDir: target.paths.contentPagesDir,
      handlersDir: target.paths.handlersDir
    }
  }));

/**
 * Convert the structural bootstrap manifest into planner configs by target id.
 *
 * @param manifest - Structural worker bootstrap manifest.
 * @returns Structural planner configs keyed by target id.
 */
export const createRouteHandlerPlannerConfigsByIdFromProxyBootstrap = (
  manifest: PersistedRouteHandlerProxyBootstrap
): ReadonlyMap<string, StructuralRouteHandlerPlannerConfig> =>
  new Map(
    manifest.targets.map(target => [
      target.targetId,
      {
        targetId: target.targetId,
        routeBasePath: target.routeBasePath,
        contentLocaleMode: target.contentLocaleMode,
        emitFormat: target.emitFormat,
        handlerRouteParam: target.handlerRouteParam,
        baseStaticPropsImport: target.baseStaticPropsImport,
        processorConfig: target.processorConfig,
        localeConfig: {
          locales: [...manifest.localeConfig.locales],
          defaultLocale: manifest.localeConfig.defaultLocale
        },
        paths: {
          rootDir: target.paths.rootDir,
          contentPagesDir: target.paths.contentPagesDir,
          handlersDir: target.paths.handlersDir
        }
      }
    ])
  );
