import { createConfigError } from '../../utils/errors';
import { isUndefined } from '../../utils/type-guards';
import { isNonEmptyArray } from '../../utils/type-guards-extended';
import type {
  ResolvedRouteHandlersConfig,
  RouteHandlersConfig,
  RouteHandlersEntrypointInput,
  RouteHandlersTargetConfig
} from '../types';

import { readProvidedOrRegisteredRouteHandlersConfig } from '../integration/config-registry';
import { resolveRouteHandlersAppConfig } from './app';
import type { NextConfigLike } from './load-next-config';
import { resolveLocaleConfig } from './locale';
import {
  type ResolvedRouteHandlersConfigBase,
  resolveRouteHandlersConfigBase
} from './resolve-target';
import { isObjectRecord, readObjectProperty } from './shared';

/**
 * Input for resolving one configured target into a single target config with
 * locale information.
 */
export type ResolveRouteHandlersConfigInput = RouteHandlersEntrypointInput & {
  /**
   * Loaded Next config object.
   */
  nextConfig: NextConfigLike;
  /**
   * App-owned `RouteHandlersConfig`.
   */
  routeHandlersConfig?: RouteHandlersConfig;
};

/**
 * Resolve one configured target into a single target config with locale
 * information.
 *
 * @param input - Config resolution input.
 * @returns Fully resolved target config with locale data attached.
 */
export const resolveRouteHandlersConfig = ({
  rootDir,
  nextConfigPath,
  nextConfig,
  routeHandlersConfig
}: ResolveRouteHandlersConfigInput): ResolvedRouteHandlersConfig => ({
  ...resolveRouteHandlersConfigBase({
    appConfig: resolveRouteHandlersAppConfig({
      rootDir,
      nextConfigPath,
      routeHandlersConfig
    }),
    routeHandlersConfig
  }),
  localeConfig: resolveLocaleConfig(nextConfig)
});

/**
 * Input for resolving the base config for every configured target without
 * attaching locale data.
 */
export type ResolveRouteHandlersConfigBasesInput =
  RouteHandlersEntrypointInput & {
    /**
     * App-owned `RouteHandlersConfig`.
     */
    routeHandlersConfig?: RouteHandlersConfig;
  };

/**
 * Resolve the base config for every configured target without attaching locale
 * data.
 *
 * @param input - Config-base resolution input.
 * @returns Resolved base configs for every configured target.
 */
export const resolveRouteHandlersConfigBases = ({
  rootDir,
  nextConfigPath,
  routeHandlersConfig
}: ResolveRouteHandlersConfigBasesInput): Array<ResolvedRouteHandlersConfigBase> => {
  const configuredRouteHandlers =
    readProvidedOrRegisteredRouteHandlersConfig(routeHandlersConfig);
  const appConfig = resolveRouteHandlersAppConfig({
    rootDir,
    nextConfigPath,
    routeHandlersConfig: configuredRouteHandlers
  });
  const configuredTargets = configuredRouteHandlers
    ? readObjectProperty(configuredRouteHandlers, 'targets')
    : undefined;

  if (isUndefined(configuredTargets)) {
    return [
      resolveRouteHandlersConfigBase({
        appConfig,
        routeHandlersConfig: configuredRouteHandlers
      })
    ];
  }

  if (!isNonEmptyArray(configuredTargets)) {
    throw createConfigError(
      'routeHandlersConfig.targets must be a non-empty array.'
    );
  }

  const resolvedConfigs: Array<ResolvedRouteHandlersConfigBase> = [];
  const seenTargetIds = new Set<string>();
  for (const [targetIndex, targetConfig] of configuredTargets.entries()) {
    if (!isObjectRecord(targetConfig)) {
      throw createConfigError(
        `routeHandlersConfig.targets[${targetIndex}] must be an object.`
      );
    }

    const resolvedConfig = resolveRouteHandlersConfigBase({
      appConfig,
      routeHandlersConfig: targetConfig as RouteHandlersTargetConfig
    });

    if (seenTargetIds.has(resolvedConfig.targetId)) {
      throw createConfigError(
        `routeHandlersConfig.targets contains duplicate targetId "${resolvedConfig.targetId}".`
      );
    }

    seenTargetIds.add(resolvedConfig.targetId);
    resolvedConfigs.push(resolvedConfig);
  }

  return resolvedConfigs;
};

/**
 * Resolve every configured target with locale data attached.
 *
 * @param input Config resolution input.
 * @param input.rootDir Explicit root override from a true entrypoint.
 * @param input.nextConfigPath Explicit Next config path override from a true
 * entrypoint.
 * @param input.nextConfig Loaded Next config object.
 * @param input.routeHandlersConfig App-owned `RouteHandlersConfig`.
 * @returns Fully resolved target configs for all configured targets.
 */
export const resolveRouteHandlersConfigs = ({
  rootDir,
  nextConfigPath,
  nextConfig,
  routeHandlersConfig
}: ResolveRouteHandlersConfigInput): Array<ResolvedRouteHandlersConfig> => {
  return resolveRouteHandlersConfigBases({
    rootDir,
    nextConfigPath,
    routeHandlersConfig
  }).map(resolvedConfig => ({
    ...resolvedConfig,
    localeConfig: resolveLocaleConfig(nextConfig)
  }));
};
