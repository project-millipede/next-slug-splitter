/**
 * Runtime configuration loading for the Next integration layer.
 *
 * @remarks
 * This module is the bridge between consumer-provided configuration and the
 * deeper runtime pipeline. Its place in the system is important:
 * before shared cache policy, target-local planning reuse, or selective
 * emission can happen, the runtime must first normalize app config, accept
 * explicit locale semantics from the caller, and execute the optional
 * app-owned prepare step.
 *
 * When this file calls `prepareRouteHandlersFromConfig(...)`, the runtime is
 * not yet deciding about route planning or emitted handlers; it is only making
 * sure any app-owned prerequisites are in place.
 */
import { resolveRouteHandlersConfigsFromAppConfig } from '../config/resolve-configs';
import {
  loadRouteHandlersConfigOrRegistered,
  resolveRouteHandlersAppContext
} from '../bootstrap/route-handlers-bootstrap';
import { prepareRouteHandlersFromConfig } from '../../shared/prepare/index';

import type { LocaleConfig } from '../../../core/types';
import type {
  ResolvedRouteHandlersConfig,
  RouteHandlersEntrypointInput
} from '../types';

/**
 * Input for loading resolved route handlers configurations.
 */
export type LoadResolvedRouteHandlersConfigsInput = RouteHandlersEntrypointInput & {
  /**
   * Explicit locale configuration from the top-level caller.
   */
  localeConfig: LocaleConfig;
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
  localeConfig,
  routeHandlersConfig
}: LoadResolvedRouteHandlersConfigsInput): Promise<Array<ResolvedRouteHandlersConfig>> => {
  const loadedRouteHandlersConfig = await loadRouteHandlersConfigOrRegistered(
    routeHandlersConfig
  );
  const appContext = resolveRouteHandlersAppContext(
    loadedRouteHandlersConfig,
    rootDir
  );
  // Runtime config loading triggers app-owned preparation before target
  // execution begins because later planning may depend on generated app files.
  await prepareRouteHandlersFromConfig(
    appContext.appConfig.rootDir,
    appContext.routeHandlersConfig
  );

  return resolveRouteHandlersConfigsFromAppConfig(
    appContext.appConfig,
    localeConfig,
    appContext.routeHandlersConfig
  );
};
