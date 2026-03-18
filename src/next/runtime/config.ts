import { resolveRouteHandlersAppConfig } from '../config/app';
import { resolveRouteHandlersConfigs } from '../config/resolve-configs';
import { loadNextConfig, type NextConfigLike } from '../config/load-next-config';
import { loadRegisteredSlugSplitterConfig } from '../integration/slug-splitter-config-loader';
import { prepareRouteHandlersFromConfig } from '../prepare';

import type {
  ResolvedRouteHandlersConfig,
  RouteHandlersEntrypointInput
} from '../types';

/**
 * Input for loading resolved route handlers configurations.
 */
export type LoadResolvedRouteHandlersConfigsInput = RouteHandlersEntrypointInput & {
  /**
   * Already-loaded Next config object, when available.
   */
  nextConfig?: NextConfigLike;
};

/**
 * Load and resolve the configured targets used by the Next
 * integration layer.
 *
 * @param input - Runtime config input.
 * @returns Fully resolved target configs with locale data attached.
 */
export const loadResolvedRouteHandlersConfigs = async ({
  rootDir,
  nextConfigPath,
  nextConfig,
  routeHandlersConfig
}: LoadResolvedRouteHandlersConfigsInput): Promise<Array<ResolvedRouteHandlersConfig>> => {
  let resolvedRouteHandlersConfig = routeHandlersConfig;
  if (
    resolvedRouteHandlersConfig == null &&
    (rootDir == null || nextConfigPath == null)
  ) {
    resolvedRouteHandlersConfig = await loadRegisteredSlugSplitterConfig();
  }

  const appConfig = resolveRouteHandlersAppConfig({
    rootDir,
    nextConfigPath,
    routeHandlersConfig: resolvedRouteHandlersConfig
  });
  let loadedNextConfig = nextConfig;
  if (loadedNextConfig == null) {
    loadedNextConfig = await loadNextConfig(appConfig.nextConfigPath);
  }
  if (resolvedRouteHandlersConfig == null) {
    resolvedRouteHandlersConfig = await loadRegisteredSlugSplitterConfig();
  }
  await prepareRouteHandlersFromConfig({
    rootDir: appConfig.rootDir,
    routeHandlersConfig: resolvedRouteHandlersConfig
  });

  return resolveRouteHandlersConfigs({
    rootDir: appConfig.rootDir,
    nextConfigPath: appConfig.nextConfigPath,
    nextConfig: loadedNextConfig,
    routeHandlersConfig: resolvedRouteHandlersConfig
  });
};
