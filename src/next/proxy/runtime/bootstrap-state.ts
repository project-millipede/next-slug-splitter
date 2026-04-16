import { createRuntimeError } from '../../../utils/errors';
import { readRouteHandlerProxyBootstrap } from '../bootstrap-persisted';
import { doesRouteHandlerProxyLocaleConfigMatch } from './shared';

import type { LocaleConfig } from '../../../core/types';
import type {
  BootstrapGenerationToken,
  RouteHandlerProxyConfigRegistration
} from './types';

/**
 * Lightweight proxy bootstrap state kept in the parent process.
 *
 * @remarks
 * This state deliberately stops before runtime attachment loading and heavy
 * planner construction. Its job is only to establish:
 * - whether splitter targets exist
 * - which route bases are configured for diagnostics
 * - which bootstrap generation token the lazy worker should use
 */
export type RouteHandlerProxyBootstrapState = {
  hasConfiguredTargets: boolean;
  targetRouteBasePaths: Array<string>;
  bootstrapGenerationToken: BootstrapGenerationToken;
};

// Cache-policy note: this is lightweight parent-side value reuse only. It does
// not contain the heavy planning graph or emitted-handler semantics. See
// `docs/architecture/cache-policy.md`.
const cachedBootstrapStates = new Map<string, RouteHandlerProxyBootstrapState>();
const inFlightBootstrapStates = new Map<
  string,
  Promise<RouteHandlerProxyBootstrapState>
>();

const createRouteHandlerProxyBootstrapStateKey = (
  localeConfig: LocaleConfig,
  configRegistration: RouteHandlerProxyConfigRegistration = {}
): string =>
  JSON.stringify([
    localeConfig,
    configRegistration.rootDir ?? null
  ]);

const loadFreshRouteHandlerProxyBootstrapState = async (
  localeConfig: LocaleConfig,
  configRegistration: RouteHandlerProxyConfigRegistration = {}
): Promise<RouteHandlerProxyBootstrapState> => {
  const rootDir = configRegistration.rootDir ?? process.cwd();
  const manifest = await readRouteHandlerProxyBootstrap(rootDir);

  if (manifest == null) {
    throw createRuntimeError(
      'Missing route-handler proxy bootstrap manifest. Proxy request routing requires a bootstrap-generated `.next/cache/route-handlers-worker-bootstrap.json` manifest.'
    );
  }

  if (
    !doesRouteHandlerProxyLocaleConfigMatch(
      localeConfig,
      manifest.localeConfig
    )
  ) {
    throw createRuntimeError(
      'Route-handler proxy bootstrap manifest localeConfig does not match the generated proxy localeConfig.'
    );
  }

  return {
    hasConfiguredTargets: manifest.targets.length > 0,
    targetRouteBasePaths: manifest.targets.map(target => target.routeBasePath),
    bootstrapGenerationToken: manifest.bootstrapGenerationToken
  };
};

/**
 * Read or initialize the current proxy bootstrap state.
 *
 * @param localeConfig - Shared locale config captured by the generated proxy.
 * @param configRegistration - Cross-process config registration.
 * @returns Cached bootstrap state for the current registration/locale pair.
 */
export const getRouteHandlerProxyBootstrapState = async (
  localeConfig: LocaleConfig,
  configRegistration: RouteHandlerProxyConfigRegistration = {}
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
