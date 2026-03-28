/**
 * Runtime configuration loading for the Next integration layer.
 *
 * @remarks
 * This module is the bridge between consumer-provided configuration and the
 * deeper runtime pipeline. Its place in the system is important:
 * before shared cache policy, target-local planning reuse, or selective
 * emission can happen, the runtime must first normalize app config, load the
 * persisted Next-derived runtime semantics, and execute the optional app-owned
 * prepare step.
 *
 * When this file calls `prepareRouteHandlersFromConfig(...)`, the runtime is
 * not yet deciding about route planning or emitted handlers; it is only making
 * sure any app-owned prerequisites are in place.
 *
 * Raw `next.config.*` loading does not happen here anymore. The only allowed
 * sources of locale semantics at this layer are:
 * - explicit `localeConfig` provided by an approved top-level entrypoint
 * - the persisted runtime-semantics snapshot written earlier by the adapter
 */
import { createConfigError } from '../../utils/errors';
import { resolveRouteHandlersConfigsFromAppConfig } from '../config/resolve-configs';
import {
  loadRouteHandlersConfigOrRegistered,
  resolveLocaleConfigFromInputOrRuntimeSemantics,
  resolveRouteHandlersAppContext
} from '../internal/route-handlers-bootstrap';
import { prepareRouteHandlersFromConfig } from '../prepare/index';

import type { LocaleConfig } from '../../core/types';
import type {
  ResolvedRouteHandlersConfig,
  RouteHandlersEntrypointInput
} from '../types';

/**
 * Input for loading resolved route handlers configurations.
 */
export type LoadResolvedRouteHandlersConfigsInput = RouteHandlersEntrypointInput & {
  /**
   * Already-extracted locale configuration when an allowed entrypoint already
   * has it available.
   */
  localeConfig?: LocaleConfig;
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
  let loadedRouteHandlersConfig = routeHandlersConfig;
  if (loadedRouteHandlersConfig == null && rootDir == null) {
    loadedRouteHandlersConfig = await loadRouteHandlersConfigOrRegistered(
      loadedRouteHandlersConfig
    );
  }

  // Locale resolution only needs a stable app root. We therefore allow one
  // early app-context pass from explicit entrypoint overrides before the full
  // route-handlers config object has necessarily been loaded.
  const initialAppContext = resolveRouteHandlersAppContext(
    loadedRouteHandlersConfig,
    rootDir
  );
  const resolvedLocaleConfig =
    await resolveLocaleConfigFromInputOrRuntimeSemantics(
      initialAppContext.appConfig.rootDir,
      localeConfig
    );
  if (resolvedLocaleConfig == null) {
    throw createConfigError(
      'Missing route-handler runtime semantics snapshot. Capture Next locale semantics through withSlugSplitter(...), the Next adapter, or another top-level entrypoint before executing the pipeline.'
    );
  }

  loadedRouteHandlersConfig = await loadRouteHandlersConfigOrRegistered(
    loadedRouteHandlersConfig
  );
  const appContext = resolveRouteHandlersAppContext(
    loadedRouteHandlersConfig,
    rootDir
  );
  // Runtime config loading triggers app-owned preparation before target
  // execution begins because later planning may depend on generated app files.
  await prepareRouteHandlersFromConfig({
    rootDir: appContext.appConfig.rootDir,
    routeHandlersConfig: appContext.routeHandlersConfig
  });

  return resolveRouteHandlersConfigsFromAppConfig({
    appConfig: appContext.appConfig,
    localeConfig: resolvedLocaleConfig,
    routeHandlersConfig: appContext.routeHandlersConfig
  });
};
