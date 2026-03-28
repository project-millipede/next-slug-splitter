import type { LocaleConfig } from '../../../core/types';

/**
 * Adapter-time registration that lets the proxy runtime and worker find the
 * correct app-owned splitter config again.
 *
 * @remarks
 * This stays optional because some environments can rely on ambient defaults,
 * while others need the generated proxy bridge to forward explicit paths.
 */
export type RouteHandlerProxyConfigRegistration = {
  /**
   * Absolute app-owned config file path when one was registered explicitly.
   */
  configPath?: string;
  /**
   * Application root directory associated with the registered config.
   */
  rootDir?: string;
};

/**
 * Stable generation token for one bootstrapped proxy session.
 *
 * @remarks
 * Token aspects:
 * - Identity: one token represents one coherent parent-side bootstrap result.
 * - Reuse: matching tokens allow the worker session to keep its current
 *   bootstrapped state.
 * - Restart: token changes require a worker restart and re-bootstrap.
 */
export type BootstrapGenerationToken = string;

/**
 * Request-time routing state consumed by the dev proxy path.
 *
 * @remarks
 * State aspects:
 * - Scope: this state contains only the values needed by the thin request-time
 *   runtime.
 * - Boundary: request-time routing does not re-resolve app config or heavy
 *   planning data for itself.
 * - Coordination: the bootstrap generation token is the parent-side handle for
 *   the current long-lived worker session.
 */
export type RouteHandlerProxyRoutingState = {
  /**
   * Exact public pathname -> generated internal handler destination.
   */
  rewriteBySourcePath: ReadonlyMap<string, string>;
  /**
   * Configured splitter-owned route bases used only for diagnostics.
   */
  targetRouteBasePaths: Array<string>;
  /**
   * Whether any splitter config is currently available in the parent process.
   *
   * @remarks
   * This lets request routing skip the worker entirely when no registered
   * splitter config exists, while still allowing a conservative worker-only
   * fallback when the thin proxy runtime could not load config in-process.
   */
  hasConfiguredTargets: boolean;
  /**
   * Current bootstrap generation token for the lazy worker session.
   */
  bootstrapGenerationToken: BootstrapGenerationToken;
};

/**
 * Runtime options injected by the generated root `proxy.ts`.
 *
 * @remarks
 * The generated root file captures app-level locale config during adapter-time
 * setup and forwards it here so the request-time path does not need to import
 * the app's `next.config.*` module.
 */
export type RouteHandlerProxyOptions = {
  /**
   * Shared locale configuration captured at adapter time.
   */
  localeConfig: LocaleConfig;
  /**
   * App-owned config registration captured at adapter time.
   *
   * @remarks
   * The thin Proxy runtime must not assume it can rediscover this state later
   * from `process.env`. In ordinary Node code that would be reasonable, but
   * Next's special Proxy runtime can materialize request handling inside a
   * constrained process/bundling environment where ad-hoc registration keys are
   * not always present or trustworthy.
   *
   * The generated root `proxy.ts` therefore embeds the registration explicitly
   * and forwards it through this options object. That keeps the true app-owned
   * config identity attached to the request-time bridge itself, which is the
   * one place we know Next will execute before any lazy worker delegation.
   */
  configRegistration?: RouteHandlerProxyConfigRegistration;
};

/**
 * High-level routing decision produced for one incoming proxy request.
 *
 * @remarks
 * This decision object is the seam between:
 * - request classification
 * - concrete Next response creation
 *
 * That separation keeps the code easier to test and easier to extend later as
 * the dev proxy path evolves.
 */
export type RouteHandlerProxyDecision =
  | {
      /**
       * Path should continue through the normal Next routing flow.
       */
      kind: 'pass-through';
      /**
       * Public request pathname.
       */
      pathname: string;
      /**
       * Known splitter target base paths for diagnostic headers.
       */
      routeBasePaths: Array<string>;
    }
  | {
      /**
       * Path is known-heavy and should rewrite to a generated handler.
       */
      kind: 'rewrite';
      /**
       * Public request pathname.
       */
      pathname: string;
      /**
       * Known splitter target base paths for diagnostic headers.
       */
      routeBasePaths: Array<string>;
      /**
       * Internal generated handler destination.
       */
      rewriteDestination: string;
    };
