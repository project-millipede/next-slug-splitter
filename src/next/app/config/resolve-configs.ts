import {
  createConfigError,
  createConfigMissingError
} from '../../../utils/errors';
import { cloneLocaleConfig } from '../../../core/locale-config';
import type { LocaleConfig } from '../../../core/types';
import { isUndefined } from '../../../utils/type-guards';
import { isNonEmptyArray } from '../../../utils/type-guards-extended';
import type { ResolvedRouteHandlersAppConfig } from '../../shared/types';
import {
  isObjectRecord,
  readObjectProperty
} from '../../shared/config/shared';
import {
  normalizeRouteHandlersTargetOptions,
  normalizeRouteHandlersTargetRuntimeAttachments,
  resolveRouteHandlersConfigBase,
  type NormalizedAppRouteHandlersTargetOptions,
  type NormalizedAppRouteHandlersTargetRuntimeAttachments
} from './resolve-target';

import type {
  ResolvedRouteHandlersConfig,
  ResolvedRouteHandlersConfigBase,
  RouteHandlersConfig,
  RouteHandlersTargetConfig
} from '../types';

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

export type NormalizedRouteHandlersTargetRecord = {
  routeHandlersConfig: RouteHandlersConfig | RouteHandlersTargetConfig;
  options: NormalizedAppRouteHandlersTargetOptions;
  runtime: NormalizedAppRouteHandlersTargetRuntimeAttachments;
};

export const resolveRouteHandlersConfigBasesFromAppConfig = async (
  appConfig: ResolvedRouteHandlersAppConfig,
  routeHandlersConfig?: RouteHandlersConfig
): Promise<Array<ResolvedRouteHandlersConfigBase>> =>
  Promise.all(
    resolveNormalizedRouteHandlersTargetsFromAppConfig(
      appConfig,
      routeHandlersConfig
    ).map(({ routeHandlersConfig: normalizedTargetConfig }) =>
      resolveRouteHandlersConfigBase(appConfig, normalizedTargetConfig)
    )
  );

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
          configuredRouteHandlers
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
      normalizedTargetConfig
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

export const resolveRouteHandlersConfigsFromAppConfig = async (
  appConfig: ResolvedRouteHandlersAppConfig,
  localeConfig: LocaleConfig,
  routeHandlersConfig?: RouteHandlersConfig
): Promise<Array<ResolvedRouteHandlersConfig>> =>
  (await resolveRouteHandlersConfigBasesFromAppConfig(
    appConfig,
    routeHandlersConfig
  )).map(resolvedConfig => ({
    ...resolvedConfig,
    localeConfig: cloneLocaleConfig(localeConfig)
  }));
