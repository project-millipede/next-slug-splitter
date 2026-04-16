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
import {
  resolveRouteHandlersAppContext
} from '../bootstrap/route-handlers-bootstrap'
import { prepareRouteHandlersFromConfig } from '../prepare/index'

import type { LocaleConfig } from '../../../core/types'
import type { RouteHandlersConfig as PublicRouteHandlersConfig } from '../../types'
import type {
  ResolvedRouteHandlersAppConfig,
  RouteHandlersEntrypointInput
} from '../types'

/**
 * Input for loading resolved route handlers configurations.
 */
export type LoadResolvedRouteHandlersConfigsInput<TConfig = unknown> =
  RouteHandlersEntrypointInput<TConfig> & {
    /**
     * Explicit locale configuration from the top-level caller.
     */
    localeConfig: LocaleConfig;
  }

/**
 * Load and resolve the configured targets used by the Next integration layer.
 *
 * @param input - Runtime config input.
 * @param handlers - Router-specific config narrowing and resolution helpers.
 * @returns Fully resolved target configs with locale data attached.
 */
export const loadResolvedRouteHandlersConfigsWithRuntimeHarness = async <
  TConfig extends PublicRouteHandlersConfig,
  TResolvedConfig
>(
  {
    rootDir,
    localeConfig,
    routeHandlersConfig
  }: LoadResolvedRouteHandlersConfigsInput<TConfig>,
  handlers: {
    /**
     * Router-specific narrowing from the public config union.
     */
    requireTypedRouteHandlersConfig: (
      routeHandlersConfig: PublicRouteHandlersConfig | undefined,
      label: string
    ) => TConfig | undefined;
    /**
     * Router-specific config resolution once app context and locale semantics
     * are already known.
     */
    resolveConfigsFromAppConfig: (
      appConfig: ResolvedRouteHandlersAppConfig,
      localeConfig: LocaleConfig,
      routeHandlersConfig?: TConfig
    ) => Array<TResolvedConfig> | Promise<Array<TResolvedConfig>>;
    /**
     * Human-readable label used in router-kind narrowing errors.
     */
    runtimeLabel: string;
  }
): Promise<Array<TResolvedConfig>> => {
  const loadedRouteHandlersConfig = handlers.requireTypedRouteHandlersConfig(
    routeHandlersConfig,
    handlers.runtimeLabel
  )
  const appContext = resolveRouteHandlersAppContext(
    loadedRouteHandlersConfig,
    rootDir
  )
  // Runtime config loading triggers app-owned preparation before target
  // execution begins because later planning may depend on generated app files.
  await prepareRouteHandlersFromConfig(
    appContext.appConfig.rootDir,
    appContext.routeHandlersConfig
  )

  return await handlers.resolveConfigsFromAppConfig(
    appContext.appConfig,
    localeConfig,
    loadedRouteHandlersConfig
  )
}
