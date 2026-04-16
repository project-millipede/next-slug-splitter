import {
  createConfigError,
  createConfigMissingError
} from '../../../utils/errors';
import { cloneLocaleConfig } from '../../../core/locale-config';
import type { LocaleConfig } from '../../../core/types';
import { isUndefined } from '../../../utils/type-guards';
import { isNonEmptyArray } from '../../../utils/type-guards-extended';
import type { ResolvedRouteHandlersAppConfig } from '../../shared/types';
import type {
  ResolvedRouteHandlersConfig,
  ResolvedRouteHandlersConfigBase,
  RouteHandlersConfig,
  RouteHandlersTargetConfig
} from '../types';

import {
  type NormalizedRouteHandlersTargetOptions,
  type NormalizedRouteHandlersTargetRuntimeAttachments,
  normalizeRouteHandlersTargetRuntimeAttachments,
  normalizeRouteHandlersTargetOptions,
} from '../../shared/config/resolve-target';
import {
  resolveRouteHandlersConfigBase
} from './resolve-target';
import { isObjectRecord, readObjectProperty } from '../../shared/config/shared';

const MISSING_ROUTE_HANDLERS_CONFIG_ERROR_MESSAGE =
  'Missing registered routeHandlersConfig. Call withSlugSplitter(...) or createRouteHandlersAdapterPath(...) before exporting the Next config.';

const requireResolvedRouteHandlersConfig = (
  routeHandlersConfig: RouteHandlersConfig | undefined
): RouteHandlersConfig => {
  if (routeHandlersConfig == null) {
    throw createConfigMissingError(MISSING_ROUTE_HANDLERS_CONFIG_ERROR_MESSAGE);
  }

  return routeHandlersConfig;
};

/**
 * Pure normalized target record used to separate target-array interpretation
 * from later disk-backed resolution.
 */
export type NormalizedRouteHandlersTargetRecord = {
  routeHandlersConfig: RouteHandlersConfig | RouteHandlersTargetConfig;
  options: NormalizedRouteHandlersTargetOptions;
  runtime: NormalizedRouteHandlersTargetRuntimeAttachments;
};

/**
 * Resolve the base config for every configured target from an already-resolved
 * app config.
 *
 * @param appConfig - Resolved app-level config shared by all targets.
 * @param routeHandlersConfig - App-owned `RouteHandlersConfig`.
 * @returns Resolved base configs for every configured target.
 *
 * @remarks
 * This helper intentionally stops at the config-base layer.
 * `localeConfig` is attached later by the caller that already owns the locale
 * data for the current execution path.
 */
export const resolveRouteHandlersConfigBasesFromAppConfig = (
  appConfig: ResolvedRouteHandlersAppConfig,
  routeHandlersConfig?: RouteHandlersConfig
): Array<ResolvedRouteHandlersConfigBase> => {
  return resolveNormalizedRouteHandlersTargetsFromAppConfig(
    appConfig,
    routeHandlersConfig
  ).map(({ routeHandlersConfig: normalizedTargetConfig }) =>
    resolveRouteHandlersConfigBase(appConfig, normalizedTargetConfig)
  );
};

/**
 * Expand and normalize the configured target list without performing
 * disk-backed module resolution.
 *
 * @param appConfig - Resolved app-level config shared by all targets.
 * @param routeHandlersConfig - App-owned `RouteHandlersConfig`.
 * @returns Configured targets paired with their pure normalized options.
 */
export const resolveNormalizedRouteHandlersTargetsFromAppConfig = (
  appConfig: ResolvedRouteHandlersAppConfig,
  routeHandlersConfig?: RouteHandlersConfig
): Array<NormalizedRouteHandlersTargetRecord> => {
  const configuredRouteHandlers =
    requireResolvedRouteHandlersConfig(routeHandlersConfig);
  const configuredTargets = readObjectProperty(
    configuredRouteHandlers,
    'targets'
  );

  if (isUndefined(configuredTargets)) {
    return [
      {
        routeHandlersConfig: configuredRouteHandlers,
        options: normalizeRouteHandlersTargetOptions(
          appConfig,
          configuredRouteHandlers,
          'pages'
        ),
        runtime: normalizeRouteHandlersTargetRuntimeAttachments(
          configuredRouteHandlers
        )
      }
    ];
  }

  if (!isNonEmptyArray(configuredTargets)) {
    throw createConfigError(
      'routeHandlersConfig.targets must be a non-empty array.'
    );
  }

  const normalizedTargets: Array<NormalizedRouteHandlersTargetRecord> = [];
  const seenTargetIds = new Set<string>();
  for (const [targetIndex, targetConfig] of configuredTargets.entries()) {
    if (!isObjectRecord(targetConfig)) {
      throw createConfigError(
        `routeHandlersConfig.targets[${targetIndex}] must be an object.`
      );
    }

    const normalizedTargetConfig = targetConfig as RouteHandlersTargetConfig;
    const options = normalizeRouteHandlersTargetOptions(
      appConfig,
      normalizedTargetConfig,
      'pages'
    );

    if (seenTargetIds.has(options.targetId)) {
      throw createConfigError(
        `routeHandlersConfig.targets contains duplicate targetId "${options.targetId}".`
      );
    }

    seenTargetIds.add(options.targetId);
    normalizedTargets.push({
      routeHandlersConfig: normalizedTargetConfig,
      options,
      runtime: normalizeRouteHandlersTargetRuntimeAttachments(
        normalizedTargetConfig
      )
    });
  }

  return normalizedTargets;
};

/**
 * Resolve every configured target from an already-resolved app config.
 *
 * @param appConfig - Resolved app-level config shared by all targets.
 * @param localeConfig - Already-normalized locale semantics for the current
 *   Pages Router config.
 * @param routeHandlersConfig - App-owned `RouteHandlersConfig`.
 * @returns Fully resolved target configs for all configured targets.
 */
export const resolveRouteHandlersConfigsFromAppConfig = (
  appConfig: ResolvedRouteHandlersAppConfig,
  localeConfig: LocaleConfig,
  routeHandlersConfig?: RouteHandlersConfig
): Array<ResolvedRouteHandlersConfig> =>
  resolveRouteHandlersConfigBasesFromAppConfig(
    appConfig,
    routeHandlersConfig
  ).map(resolvedConfig => ({
    ...resolvedConfig,
    localeConfig: cloneLocaleConfig(localeConfig)
  }));
