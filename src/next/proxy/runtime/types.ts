import type { LocaleConfig } from '../../../core/types';
import type { ResolvedRouteHandlersConfig } from '../../types';

/**
 * Request-time routing state consumed by the dev proxy path.
 *
 * @remarks
 * This state intentionally contains only the minimum data needed once a
 * request reaches the proxy runtime:
 * - exact-path heavy-route rewrite lookups
 * - configured target route bases for diagnostics
 * - the current resolved target configs for worker-side request handling
 *
 * The key boundary is that request-time routing should not re-resolve app
 * config for itself. If a later worker-side step needs the fully resolved
 * target config, it has to come through this routing-state bridge.
 *
 * Keeping the shape narrow makes it easier to reason about what the request
 * layer is allowed to know. Anything more expensive or configuration-heavy
 * belongs in the routing-state loader, not in the per-request decision layer.
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
   * Current fully resolved target configs keyed by stable target id.
   *
   * @remarks
   * The direct request-routing layer should continue to ignore this field
   * unless it is delegating to another isolated subsystem.
   *
   * Right now:
   * 1. the worker path may still need the fully resolved target config
   * 2. request routing should not re-resolve app config for that later step
   * 3. publishing the map here keeps that worker-side step isolated from
   *    config loading
   */
  resolvedConfigsByTargetId: ReadonlyMap<string, ResolvedRouteHandlersConfig>;
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
  configRegistration?: {
    /**
     * Absolute path to the app-owned `route-handlers-config.*` module when the
     * app was registered through `withSlugSplitter({ configPath })`.
     */
    configPath?: string;
    /**
     * True app root captured during Next config evaluation.
     */
    rootDir?: string;
  };
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
