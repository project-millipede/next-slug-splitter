import {
  resolveNormalizedRouteHandlersTargetsFromAppConfig
} from '../../config/resolve-configs';
import {
  loadRouteHandlersConfigOrRegistered,
  resolveRouteHandlersAppContext
} from '../../internal/route-handlers-bootstrap';

import type {
  BootstrapGenerationToken,
  RouteHandlerProxyOptions
} from './types';

/**
 * Lightweight proxy bootstrap state kept in the parent process.
 *
 * @remarks
 * This state deliberately stops before heavy planner loading. Its job is only
 * to establish:
 * - whether splitter config exists
 * - which route bases are configured for diagnostics
 * - which bootstrap generation token the lazy worker should use
 */
export type RouteHandlerProxyBootstrapState = {
  hasConfiguredTargets: boolean;
  targetRouteBasePaths: Array<string>;
  bootstrapGenerationToken: BootstrapGenerationToken;
};

let bootstrapGenerationSequence = 0;
// Cache-policy note: this is lightweight parent-side value reuse only. It does
// not contain the heavy planning graph or emitted-handler semantics. See
// `docs/architecture/cache-policy.md`.
const cachedBootstrapStates = new Map<string, RouteHandlerProxyBootstrapState>();
const inFlightBootstrapStates = new Map<
  string,
  Promise<RouteHandlerProxyBootstrapState>
>();

const createRouteHandlerProxyBootstrapStateKey = (
  localeConfig: RouteHandlerProxyOptions['localeConfig'],
  configRegistration: RouteHandlerProxyOptions['configRegistration']
): string =>
  JSON.stringify([
    localeConfig,
    configRegistration?.configPath ?? null,
    configRegistration?.rootDir ?? null
  ]);

const createRouteHandlerProxyBootstrapGenerationToken =
  (): BootstrapGenerationToken =>
    `route-handler-proxy-bootstrap-${String(++bootstrapGenerationSequence)}`;

const loadFreshRouteHandlerProxyBootstrapState = async (
  localeConfig: RouteHandlerProxyOptions['localeConfig'],
  configRegistration: RouteHandlerProxyOptions['configRegistration']
): Promise<RouteHandlerProxyBootstrapState> => {
  const routeHandlersConfig = await loadRouteHandlersConfigOrRegistered();
  const bootstrapGenerationToken =
    createRouteHandlerProxyBootstrapGenerationToken();

  if (routeHandlersConfig == null) {
    return {
      hasConfiguredTargets: false,
      targetRouteBasePaths: [],
      bootstrapGenerationToken
    };
  }

  const appContext = resolveRouteHandlersAppContext(
    routeHandlersConfig,
    configRegistration?.rootDir
  );
  const normalizedTargets = resolveNormalizedRouteHandlersTargetsFromAppConfig({
    appConfig: appContext.appConfig,
    routeHandlersConfig: appContext.routeHandlersConfig
  });

  return {
    hasConfiguredTargets: normalizedTargets.length > 0,
    targetRouteBasePaths: normalizedTargets.map(
      ({ options }) => options.routeBasePath
    ),
    bootstrapGenerationToken
  };
};

/**
 * Read or initialize the current proxy bootstrap state.
 *
 * @param localeConfig - Shared locale config captured by the generated proxy.
 * @param configRegistration - Optional cross-process config registration.
 * @returns Cached bootstrap state for the current registration/locale pair.
 */
export const getRouteHandlerProxyBootstrapState = async (
  localeConfig: RouteHandlerProxyOptions['localeConfig'],
  configRegistration: RouteHandlerProxyOptions['configRegistration']
): Promise<RouteHandlerProxyBootstrapState> => {
  const stateKey = createRouteHandlerProxyBootstrapStateKey(
    localeConfig,
    configRegistration
  );
  const existingState = cachedBootstrapStates.get(stateKey);

  if (existingState != null) {
    return existingState;
  }

  const existingBootstrap = inFlightBootstrapStates.get(stateKey);

  if (existingBootstrap != null) {
    return existingBootstrap;
  }

  const bootstrapPromise = loadFreshRouteHandlerProxyBootstrapState(
    localeConfig,
    configRegistration
  ).then(state => {
    cachedBootstrapStates.set(stateKey, state);
    return state;
  }).finally(() => {
    inFlightBootstrapStates.delete(stateKey);
  });

  inFlightBootstrapStates.set(stateKey, bootstrapPromise);
  return bootstrapPromise;
};

/**
 * Clear cached proxy bootstrap state.
 *
 * @remarks
 * This is used by tests and future explicit bootstrap refresh work.
 */
export const clearRouteHandlerProxyBootstrapStateCache = (): void => {
  cachedBootstrapStates.clear();
  inFlightBootstrapStates.clear();
};
