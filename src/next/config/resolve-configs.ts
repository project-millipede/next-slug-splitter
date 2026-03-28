import {
  createConfigError,
  createConfigMissingError
} from '../../utils/errors';
import type { LocaleConfig } from '../../core/types';
import { isUndefined } from '../../utils/type-guards';
import { isNonEmptyArray } from '../../utils/type-guards-extended';
import type {
  ResolvedRouteHandlersAppConfig,
  ResolvedRouteHandlersConfig,
  RouteHandlersConfig,
  RouteHandlersEntrypointInput,
  RouteHandlersTargetConfig
} from '../types';

import { readProvidedOrRegisteredRouteHandlersConfig } from '../integration/config-registry';
import { resolveRouteHandlersAppConfig } from './app';
import {
  type NormalizedRouteHandlersTargetOptions,
  normalizeRouteHandlersTargetOptions,
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
   * Already-extracted Next runtime semantics.
   */
  localeConfig: LocaleConfig;
  /**
   * App-owned `RouteHandlersConfig`.
   */
  routeHandlersConfig?: RouteHandlersConfig;
};

type RouteHandlersConfigLike =
  | RouteHandlersConfig
  | RouteHandlersTargetConfig;

const MISSING_ROUTE_HANDLERS_CONFIG_ERROR_MESSAGE =
  'Missing registered routeHandlersConfig. Call withSlugSplitter(...) or createRouteHandlersAdapterPath(...) before exporting the Next config.';

const copyLocaleConfig = (localeConfig: LocaleConfig): LocaleConfig => ({
  locales: [...localeConfig.locales],
  defaultLocale: localeConfig.defaultLocale
});

const requireResolvedRouteHandlersConfig = <
  TRouteHandlersConfig extends RouteHandlersConfigLike
>(
  routeHandlersConfig: TRouteHandlersConfig | undefined
): TRouteHandlersConfig => {
  if (routeHandlersConfig == null) {
    throw createConfigMissingError(
      MISSING_ROUTE_HANDLERS_CONFIG_ERROR_MESSAGE
    );
  }

  return routeHandlersConfig;
};

/**
 * Resolve one configured target from an already-resolved app config.
 *
 * @param input - Config-resolution input.
 * @returns Fully resolved target config with locale data attached.
 */
export const resolveRouteHandlersConfigFromAppConfig = ({
  appConfig,
  localeConfig,
  routeHandlersConfig
}: {
  appConfig: ResolvedRouteHandlersAppConfig;
  localeConfig: LocaleConfig;
  routeHandlersConfig?: RouteHandlersConfigLike;
}): ResolvedRouteHandlersConfig => ({
  ...resolveRouteHandlersConfigBaseFromAppConfig({
    appConfig,
    routeHandlersConfig
  }),
  localeConfig: copyLocaleConfig(localeConfig)
});

/**
 * Resolve one configured target from an already-resolved app config without
 * re-resolving the app-level inputs.
 *
 * @param input - Config-base resolution input.
 * @returns Resolved target config without locale data attached.
 */
export const resolveRouteHandlersConfigBaseFromAppConfig = ({
  appConfig,
  routeHandlersConfig
}: {
  appConfig: ResolvedRouteHandlersAppConfig;
  routeHandlersConfig?: RouteHandlersConfigLike;
}): ResolvedRouteHandlersConfigBase =>
  resolveRouteHandlersConfigBase({
    appConfig,
    routeHandlersConfig: requireResolvedRouteHandlersConfig(routeHandlersConfig)
  });

/**
 * Resolve one configured target into a single target config with locale
 * information.
 *
 * @param input - Config resolution input.
 * @returns Fully resolved target config with locale data attached.
 */
export const resolveRouteHandlersConfig = ({
  rootDir,
  localeConfig,
  routeHandlersConfig
}: ResolveRouteHandlersConfigInput): ResolvedRouteHandlersConfig => {
  const configuredRouteHandlers =
    readProvidedOrRegisteredRouteHandlersConfig(routeHandlersConfig);
  const appConfig = resolveRouteHandlersAppConfig({
    rootDir,
    routeHandlersConfig: configuredRouteHandlers
  });

  return resolveRouteHandlersConfigFromAppConfig({
    appConfig,
    localeConfig,
    routeHandlersConfig: configuredRouteHandlers
  });
};

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
 * Pure normalized target record used to separate target-array interpretation
 * from later disk-backed resolution.
 */
export type NormalizedRouteHandlersTargetRecord = {
  routeHandlersConfig: RouteHandlersConfig | RouteHandlersTargetConfig;
  options: NormalizedRouteHandlersTargetOptions;
};

/**
 * Resolve the base config for every configured target from an already-resolved
 * app config.
 *
 * @param input - Config-base resolution input.
 * @returns Resolved base configs for every configured target.
 *
 * @remarks
 * This helper intentionally stops at the config-base layer. Locale semantics
 * are attached later by the caller that owns the approved runtime-semantics
 * source for the current execution path.
 */
export const resolveRouteHandlersConfigBasesFromAppConfig = ({
  appConfig,
  routeHandlersConfig
}: {
  appConfig: ResolvedRouteHandlersAppConfig;
  routeHandlersConfig?: RouteHandlersConfig;
}): Array<ResolvedRouteHandlersConfigBase> => {
  return resolveNormalizedRouteHandlersTargetsFromAppConfig({
    appConfig,
    routeHandlersConfig
  }).map(({ routeHandlersConfig: normalizedTargetConfig }) =>
    resolveRouteHandlersConfigBase({
      appConfig,
      routeHandlersConfig: normalizedTargetConfig
    })
  );
};

/**
 * Expand and normalize the configured target list without performing
 * disk-backed module resolution.
 *
 * @param input - Pure target-normalization input.
 * @returns Configured targets paired with their pure normalized options.
 */
export const resolveNormalizedRouteHandlersTargetsFromAppConfig = ({
  appConfig,
  routeHandlersConfig
}: {
  appConfig: ResolvedRouteHandlersAppConfig;
  routeHandlersConfig?: RouteHandlersConfig;
}): Array<NormalizedRouteHandlersTargetRecord> => {
  const configuredRouteHandlers =
    requireResolvedRouteHandlersConfig(routeHandlersConfig);
  const configuredTargets = readObjectProperty(configuredRouteHandlers, 'targets');

  if (isUndefined(configuredTargets)) {
    return [
      {
        routeHandlersConfig: configuredRouteHandlers,
        options: normalizeRouteHandlersTargetOptions({
          appConfig,
          routeHandlersConfig: configuredRouteHandlers
        })
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
    const options = normalizeRouteHandlersTargetOptions({
      appConfig,
      routeHandlersConfig: normalizedTargetConfig
    });

    if (seenTargetIds.has(options.targetId)) {
      throw createConfigError(
        `routeHandlersConfig.targets contains duplicate targetId "${options.targetId}".`
      );
    }

    seenTargetIds.add(options.targetId);
    normalizedTargets.push({
      routeHandlersConfig: normalizedTargetConfig,
      options
    });
  }

  return normalizedTargets;
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
  routeHandlersConfig
}: ResolveRouteHandlersConfigBasesInput): Array<ResolvedRouteHandlersConfigBase> => {
  const configuredRouteHandlers =
    readProvidedOrRegisteredRouteHandlersConfig(routeHandlersConfig);
  const appConfig = resolveRouteHandlersAppConfig({
    rootDir,
    routeHandlersConfig: configuredRouteHandlers
  });

  return resolveRouteHandlersConfigBasesFromAppConfig({
    appConfig,
    routeHandlersConfig: configuredRouteHandlers
  });
};

/**
 * Resolve every configured target from an already-resolved app config.
 *
 * @param input - Config-resolution input.
 * @returns Fully resolved target configs for all configured targets.
 */
export const resolveRouteHandlersConfigsFromAppConfig = ({
  appConfig,
  localeConfig,
  routeHandlersConfig
}: {
  appConfig: ResolvedRouteHandlersAppConfig;
  localeConfig: LocaleConfig;
  routeHandlersConfig?: RouteHandlersConfig;
}): Array<ResolvedRouteHandlersConfig> =>
  resolveRouteHandlersConfigBasesFromAppConfig({
    appConfig,
    routeHandlersConfig
  }).map(resolvedConfig => ({
    ...resolvedConfig,
    localeConfig: copyLocaleConfig(localeConfig)
  }));

/**
 * Resolve every configured target with locale data attached.
 *
 * @param input Config resolution input.
 * @param input.rootDir Explicit root override from a true entrypoint.
 * @param input.localeConfig Already-extracted locale configuration.
 * @param input.routeHandlersConfig App-owned `RouteHandlersConfig`.
 * @returns Fully resolved target configs for all configured targets.
 */
export const resolveRouteHandlersConfigs = ({
  rootDir,
  localeConfig,
  routeHandlersConfig
}: ResolveRouteHandlersConfigInput): Array<ResolvedRouteHandlersConfig> => {
  const configuredRouteHandlers =
    readProvidedOrRegisteredRouteHandlersConfig(routeHandlersConfig);
  const appConfig = resolveRouteHandlersAppConfig({
    rootDir,
    routeHandlersConfig: configuredRouteHandlers
  });

  return resolveRouteHandlersConfigsFromAppConfig({
    appConfig,
    localeConfig,
    routeHandlersConfig: configuredRouteHandlers
  });
};
