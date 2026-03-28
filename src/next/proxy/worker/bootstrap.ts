import { resolveRouteHandlersConfigsFromAppConfig } from '../../config/resolve-configs';
import {
  loadRouteHandlersConfigOrRegistered,
  resolveRouteHandlersAppContext
} from '../../internal/route-handlers-bootstrap';
import { prepareRouteHandlersFromConfig } from '../../prepare';
import { resolveRouteHandlerLazyResolvedTargetsFromAppConfig } from '../lazy/request-resolution';

import type { LocaleConfig } from '../../../core/types';
import type { ResolvedRouteHandlersConfig } from '../../types';
import type { RouteHandlerLazyResolvedTarget } from '../lazy/types';
import type { BootstrapGenerationToken } from '../runtime/types';

const SLUG_SPLITTER_CONFIG_ROOT_DIR_ENV = 'SLUG_SPLITTER_CONFIG_ROOT_DIR';

/**
 * In-memory worker bootstrap state reused across many lazy-miss requests.
 *
 * @remarks
 * State aspects:
 * - Identity: `bootstrapGenerationToken` ties all derived state to one parent
 *   bootstrap generation.
 * - Reuse: lazy-miss requests reuse resolved targets and configs from this
 *   value object instead of repeating bootstrap work.
 * - Boundary: the state contains derived values only; it does not keep the
 *   original app config-loading inputs around for request-time use.
 */
export type RouteHandlerProxyWorkerBootstrapState = {
  bootstrapGenerationToken: BootstrapGenerationToken;
  lazyResolvedTargets: Array<RouteHandlerLazyResolvedTarget>;
  resolvedConfigsByTargetId: ReadonlyMap<string, ResolvedRouteHandlersConfig>;
};

/**
 * Bootstrap the long-lived worker session for one proxy generation.
 *
 * @param bootstrapGenerationToken - Parent-issued bootstrap generation token.
 * @param localeConfig - Locale semantics for the current worker generation.
 * @returns Bootstrapped heavy-analysis state for later lazy-miss requests.
 *
 * @remarks
 * Bootstrap aspects:
 * - Ownership: this is the only worker-side phase allowed to load
 *   `routeHandlersConfig`, run `prepare`, and resolve the heavy planning
 *   graph.
 * - Timing: bootstrap work runs once per generation, not once per lazy miss.
 * - Output: per-request lazy misses consume only the derived value state
 *   returned here.
 */
export const bootstrapRouteHandlerProxyWorker = async (
  bootstrapGenerationToken: BootstrapGenerationToken,
  localeConfig: LocaleConfig
): Promise<RouteHandlerProxyWorkerBootstrapState> => {
  const routeHandlersConfig = await loadRouteHandlersConfigOrRegistered();

  if (routeHandlersConfig == null) {
    return {
      bootstrapGenerationToken,
      lazyResolvedTargets: [],
      resolvedConfigsByTargetId: new Map()
    };
  }

  const appContext = resolveRouteHandlersAppContext(
    routeHandlersConfig,
    process.env[SLUG_SPLITTER_CONFIG_ROOT_DIR_ENV]
  );
  const bootstrappedRouteHandlersConfig = appContext.routeHandlersConfig;

  if (bootstrappedRouteHandlersConfig == null) {
    throw new Error(
      'next-slug-splitter proxy worker bootstrap lost routeHandlersConfig after loading it.'
    );
  }

  await prepareRouteHandlersFromConfig({
    rootDir: appContext.appConfig.rootDir,
    routeHandlersConfig: bootstrappedRouteHandlersConfig
  });

  const resolvedConfigs = resolveRouteHandlersConfigsFromAppConfig({
    appConfig: appContext.appConfig,
    localeConfig,
    routeHandlersConfig: bootstrappedRouteHandlersConfig
  });

  return {
    bootstrapGenerationToken,
    lazyResolvedTargets: resolveRouteHandlerLazyResolvedTargetsFromAppConfig({
      appConfig: appContext.appConfig,
      localeConfig,
      routeHandlersConfig: bootstrappedRouteHandlersConfig
    }),
    resolvedConfigsByTargetId: new Map(
      resolvedConfigs.map(resolvedConfig => [
        resolvedConfig.targetId,
        resolvedConfig
      ])
    )
  };
};
