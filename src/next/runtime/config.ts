/**
 * Runtime configuration loading for the Next integration layer.
 *
 * @remarks
 * This module is the bridge between consumer-provided configuration and the
 * deeper cache-aware runtime pipeline. Its place in the system is important:
 * before shared cache policy, target-local planning reuse, or selective
 * emission can happen, the runtime must first normalize app config, load the
 * Next config, and execute app-owned preparation tasks.
 *
 * The cache group touched here is the preparation-cache group. When this file
 * calls `prepareRouteHandlersFromConfig(...)`, the runtime is not yet deciding
 * about route planning or emitted handlers; it is only making sure any
 * app-owned prerequisites, such as cached `tsc-project` steps, are in place.
 */
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
  // Consumer entry into the preparation-cache group. This call happens before
  // target execution and before shared-cache policy is consulted because the
  // app may need its preparation tasks to materialize processor/runtime inputs
  // that the rest of the pipeline depends on.
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
