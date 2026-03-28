import type { LocaleConfig } from '../../core/types';
import { resolveRouteHandlersAppConfig } from '../config/app';
import { loadRegisteredSlugSplitterConfig } from '../integration/slug-splitter-config-loader';
import { readRouteHandlerRuntimeSemantics } from '../runtime-semantics/read';

import type {
  ResolvedRouteHandlersAppConfig,
  RouteHandlersConfig,
  RouteHandlersEntrypointInput
} from '../types';

/**
 * Resolved route-handlers app context used after the app-owned config object
 * and its derived app settings have been lined up.
 */
export type RouteHandlersAppContext = {
  appConfig: ResolvedRouteHandlersAppConfig;
  routeHandlersConfig: RouteHandlersConfig | undefined;
};

const copyLocaleConfig = (localeConfig: LocaleConfig): LocaleConfig => ({
  locales: [...localeConfig.locales],
  defaultLocale: localeConfig.defaultLocale
});

/**
 * Read the app-owned route-handlers config from the current caller or the
 * registered loader path.
 *
 * @param routeHandlersConfig - Optional explicit route-handlers config.
 * @returns The explicit config when present, otherwise the registered config.
 */
export const loadRouteHandlersConfigOrRegistered = async (
  routeHandlersConfig?: RouteHandlersConfig
): Promise<RouteHandlersConfig | undefined> =>
  routeHandlersConfig ?? (await loadRegisteredSlugSplitterConfig());

/**
 * Resolve the app-level route-handlers context from explicit entrypoint values
 * plus an optional already-loaded route-handlers config.
 *
 * @param routeHandlersConfig - Already-loaded route-handlers config when available.
 * @param rootDir - Optional explicit app root override.
 * @returns Resolved app config plus the exact route-handlers config used.
 */
export const resolveRouteHandlersAppContext = (
  routeHandlersConfig: RouteHandlersConfig | undefined,
  rootDir?: RouteHandlersEntrypointInput['rootDir']
): RouteHandlersAppContext => ({
  routeHandlersConfig,
  appConfig: resolveRouteHandlersAppConfig({
    rootDir,
    routeHandlersConfig
  })
});

/**
 * Resolve locale data from an explicit locale config or the persisted
 * runtime-semantics snapshot.
 *
 * @param rootDir - Application root directory.
 * @param localeConfig - Optional explicit locale config.
 * @returns Explicit or persisted locale config, otherwise `null`.
 */
export const resolveLocaleConfigFromInputOrRuntimeSemantics = async (
  rootDir: string,
  localeConfig?: LocaleConfig
): Promise<LocaleConfig | null> => {
  if (localeConfig != null) {
    return copyLocaleConfig(localeConfig);
  }

  const persistedRuntimeSemantics = await readRouteHandlerRuntimeSemantics(
    rootDir
  );

  return persistedRuntimeSemantics == null
    ? null
    : copyLocaleConfig(persistedRuntimeSemantics.localeConfig);
};
