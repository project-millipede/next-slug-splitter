import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

import { cloneLocaleConfig } from '../../core/locale-config';
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
  ResolvedRouteHandlerModuleReference,
  ResolvedRouteHandlerProcessorConfig
} from '../../core/types';
import type { BootstrapGenerationToken } from './runtime/types';
import type {
  RouteHandlerNextPaths
} from '../shared/types';
import type {
  ResolvedAppRouteModuleContract
} from '../app/types';
import type { ResolvedRouteHandlersConfig } from '../types';
import type {
  RouteHandlerLazyAppPlannerConfig,
  RouteHandlerLazyPagesPlannerConfig,
  RouteHandlerLazyResolvedTarget
} from './lazy/types';

const ROUTE_HANDLER_PROXY_BOOTSTRAP_VERSION = 4;
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
type PersistedRouteHandlerProxyBootstrapTargetBase = {
  /**
   * Router family for the persisted target entry.
   */
  routerKind: 'pages' | 'app';
  /**
   * Stable target identifier used by the worker and lookup layers.
   */
  targetId: string;
  /**
   * Public route prefix owned by the target.
   */
  routeBasePath: string;
  /**
   * Content locale strategy used to derive localized paths.
   */
  contentLocaleMode: ContentLocaleMode;
  /**
   * Generated file format for emitted handlers.
   */
  emitFormat: EmitFormat;
  /**
   * Dynamic route parameter bound by the generated handler page.
   */
  handlerRouteParam: DynamicRouteParam;
  /**
   * Filesystem segment used for generated handlers under the target subtree.
   */
  handlerRouteSegment: string;
  /**
   * Resolved processor module config used for heavy-route planning.
   */
  processorConfig: ResolvedRouteHandlerProcessorConfig;
  /**
   * Absolute filesystem paths needed to rebuild structural planner state.
   */
  paths: PersistedRouteHandlerProxyBootstrapPaths;
};

/**
 * Persisted structural target entry for the Pages Router path.
 */
export type PersistedRouteHandlerProxyBootstrapPagesTarget =
  PersistedRouteHandlerProxyBootstrapTargetBase & {
    /**
     * Router family discriminator for Pages Router targets.
     */
    routerKind: 'pages';
    /**
     * Resolved base static-props module import used by Pages generation.
     */
    baseStaticPropsImport: ResolvedRouteHandlerModuleReference;
  };

/**
 * Persisted structural target entry for the App Router path.
 */
export type PersistedRouteHandlerProxyBootstrapAppTarget =
  PersistedRouteHandlerProxyBootstrapTargetBase & {
    /**
     * Router family discriminator for App Router targets.
     */
    routerKind: 'app';
    /**
     * Resolved route-contract import shared by the public page and generated
     * heavy pages.
     */
    routeModuleImport: ResolvedRouteHandlerModuleReference;
    /**
     * Build-time inspection result for the App route contract.
     */
    routeModule: ResolvedAppRouteModuleContract;
  };

export type PersistedRouteHandlerProxyBootstrapTarget =
  | PersistedRouteHandlerProxyBootstrapPagesTarget
  | PersistedRouteHandlerProxyBootstrapAppTarget;

type StructuralRouteHandlerPlannerConfig =
  | Omit<RouteHandlerLazyPagesPlannerConfig, 'runtime'>
  | Omit<RouteHandlerLazyAppPlannerConfig, 'runtime'>;

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

  return isModuleReference(readObjectProperty(value, 'processorImport'));
};

const isResolvedAppRouteModuleContract = (
  value: unknown
): value is ResolvedAppRouteModuleContract => {
  if (!isObjectRecordOf<ResolvedAppRouteModuleContract>(value)) {
    return false;
  }

  const hasGeneratePageMetadata = readObjectProperty(
    value,
    'hasGeneratePageMetadata'
  );
  const revalidate = readObjectProperty(value, 'revalidate');

  return (
    typeof hasGeneratePageMetadata === 'boolean' &&
    (revalidate === undefined ||
      revalidate === false ||
      typeof revalidate === 'number')
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
  if (!isObjectRecordOf<Record<string, unknown>>(value)) {
    return false;
  }

  const routerKind = readObjectProperty(value, 'routerKind');

  const hasSharedShape =
    (routerKind === 'pages' || routerKind === 'app') &&
    isString(readObjectProperty(value, 'targetId')) &&
    isString(readObjectProperty(value, 'routeBasePath')) &&
    isContentLocaleMode(readObjectProperty(value, 'contentLocaleMode')) &&
    isEmitFormat(readObjectProperty(value, 'emitFormat')) &&
    isDynamicRouteParam(readObjectProperty(value, 'handlerRouteParam')) &&
    isString(readObjectProperty(value, 'handlerRouteSegment')) &&
    isPersistedRouteHandlerProcessorConfig(
      readObjectProperty(value, 'processorConfig')
    ) &&
    isPersistedRouteHandlerProxyBootstrapPaths(
      readObjectProperty(value, 'paths')
    );

  if (!hasSharedShape) {
    return false;
  }

  if (routerKind === 'app') {
    return (
      isModuleReference(readObjectProperty(value, 'routeModuleImport')) &&
      isResolvedAppRouteModuleContract(readObjectProperty(value, 'routeModule'))
    );
  }

  return isModuleReference(readObjectProperty(value, 'baseStaticPropsImport'));
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
  localeConfig: cloneLocaleConfig(localeConfig),
  targets: resolvedConfigs.map(config => {
    const sharedTarget = {
      routerKind: config.routerKind,
      targetId: config.targetId,
      routeBasePath: config.routeBasePath,
      contentLocaleMode: config.contentLocaleMode,
      emitFormat: config.emitFormat,
      handlerRouteParam: config.handlerRouteParam,
      handlerRouteSegment: path.basename(config.paths.handlersDir),
      processorConfig: config.processorConfig,
      paths: {
        rootDir: config.paths.rootDir,
        contentPagesDir: config.paths.contentPagesDir,
        handlersDir: config.paths.handlersDir
      }
    };

    if (config.routerKind === 'app') {
      return {
        ...sharedTarget,
        routerKind: 'app' as const,
        routeModuleImport: config.routeModuleImport,
        routeModule: config.routeModule
      };
    }

    return {
      ...sharedTarget,
      routerKind: 'pages' as const,
      baseStaticPropsImport: config.baseStaticPropsImport
    };
  })
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
    routerKind: target.routerKind,
    targetId: target.targetId,
    routeBasePath: target.routeBasePath,
    contentLocaleMode: target.contentLocaleMode,
    localeConfig: cloneLocaleConfig(manifest.localeConfig),
    emitFormat: target.emitFormat,
    handlerRouteParam: target.handlerRouteParam,
    paths: {
      rootDir: target.paths.rootDir,
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
      target.routerKind === 'app'
        ? {
            routerKind: 'app',
            targetId: target.targetId,
            routeBasePath: target.routeBasePath,
            contentLocaleMode: target.contentLocaleMode,
            emitFormat: target.emitFormat,
            handlerRouteParam: target.handlerRouteParam,
            handlerRouteSegment: target.handlerRouteSegment,
            routeModuleImport: target.routeModuleImport,
            routeModule: target.routeModule,
            processorConfig: target.processorConfig,
            localeConfig: cloneLocaleConfig(manifest.localeConfig),
            paths: {
              rootDir: target.paths.rootDir,
              contentPagesDir: target.paths.contentPagesDir,
              handlersDir: target.paths.handlersDir
            }
          }
        : {
            routerKind: 'pages',
            targetId: target.targetId,
            routeBasePath: target.routeBasePath,
            contentLocaleMode: target.contentLocaleMode,
            emitFormat: target.emitFormat,
            handlerRouteParam: target.handlerRouteParam,
            handlerRouteSegment: target.handlerRouteSegment,
            baseStaticPropsImport: target.baseStaticPropsImport,
            processorConfig: target.processorConfig,
            localeConfig: cloneLocaleConfig(manifest.localeConfig),
            paths: {
              rootDir: target.paths.rootDir,
              contentPagesDir: target.paths.contentPagesDir,
              handlersDir: target.paths.handlersDir
            }
          }
    ])
  );
