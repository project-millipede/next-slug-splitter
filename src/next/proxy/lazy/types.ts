import type {
  ContentLocaleMode,
  DynamicRouteParam,
  EmitFormat,
  LocaleConfig,
  LocalizedRoutePath,
  PlannedHeavyRoute,
  ResolvedRouteHandlerModuleReference
} from '../../../core/types';
import type { RouteHandlerOutputSynchronizationStatus } from '../../../generator/shared/protocol/output-lifecycle';
import type { ResolvedAppRouteModuleContract } from '../../app/types';
import type { ResolvedRouteHandlersTargetConfigBase } from '../../shared/types';
import type { RouteHandlerLazySingleRouteCacheManager } from './single-route-cache-manager';

/**
 * Locale-aware request identity derived from one incoming public pathname.
 *
 * @remarks
 * This is the smallest semantic unit the lazy dev path needs before it can do
 * any deeper work:
 * - which locale is being requested?
 * - which slug segments are being requested?
 *
 * Keeping this type explicit makes it easier to talk about "request identity"
 * separately from "filesystem file that satisfies that identity."
 */
export type RouteHandlerLazyRequestIdentity = {
  /**
   * Public pathname being resolved.
   */
  pathname: string;
  /**
   * Resolved locale for the request.
   */
  locale: string;
  /**
   * Resolved slug segments for the request.
   */
  slugArray: Array<string>;
};

/**
 * Lightweight target shape needed by lazy request resolution.
 *
 * @remarks
 * This type is intentionally much smaller than `ResolvedRouteHandlersConfig`.
 * The lazy request-resolution seam should not depend on handler bindings,
 * processors, or generation imports because it only needs to answer
 * "which target owns this pathname?" and "which content file would back it?"
 */
export type RouteHandlerLazyResolvedTarget = {
  /**
   * Router family that owns the target.
   */
  routerKind: 'pages' | 'app';
  /**
   * Stable target identifier.
   */
  targetId: string;
  /**
   * Public route base path owned by the target.
   */
  routeBasePath: string;
  /**
   * Locale-detection strategy for content files in this target.
   */
  contentLocaleMode: ContentLocaleMode;
  /**
   * Locale configuration captured from Next config.
   */
  localeConfig: LocaleConfig;
  /**
   * Generated handler output format for this target.
   *
   * @remarks
   * Lazy request resolution intentionally now carries this one output-facing
   * detail so later stale-output cleanup can compute the deterministic handler
   * file path for a route even when there is no longer a concrete content file.
   * It still does not pull in processor bindings or other planner-only inputs.
   */
  emitFormat: EmitFormat;
  /**
   * Dynamic route parameter used by emitted handlers for this target.
   */
  handlerRouteParam?: DynamicRouteParam;
  /**
   * Filesystem path inputs required by lazy request resolution.
   */
  paths: {
    /**
     * Application root directory.
     */
    rootDir?: string;
    /**
     * Directory containing localized content files.
     */
    contentPagesDir: string;
    /**
     * Directory containing generated handler pages for this target.
     *
     * @remarks
     * This path is included in the lightweight target shape so the lazy stale-
     * output cleanup layer can remove a previously emitted handler file on a
     * `missing-route-file` request without having to re-resolve the full target
     * planning config.
     */
    handlersDir: string;
  };
};

/**
 * Common bootstrapped planner config shared by the lazy worker's router
 * adapters.
 *
 * @remarks
 * The Pages dev proxy architecture remains the source of truth here: the lazy
 * worker still wants one target-local planning object that can:
 * - analyze a concrete route
 * - emit or remove the corresponding generated handler
 * - resolve the final rewrite destination
 *
 * App Router support should therefore adapt to this same planner shape rather
 * than introducing a parallel worker architecture.
 */
type RouteHandlerLazyPlannerConfigBase = Pick<
  ResolvedRouteHandlersTargetConfigBase,
  | 'targetId'
  | 'emitFormat'
  | 'contentLocaleMode'
  | 'handlerRouteParam'
  | 'routeBasePath'
  | 'processorConfig'
  | 'runtime'
  | 'paths'
> & {
  /**
   * Router family that owns the target.
   */
  routerKind: 'pages' | 'app';
  /**
   * Locale semantics captured from the Next config.
   */
  localeConfig: LocaleConfig;
  /**
   * Internal generated-handler segment used by rewrite resolution.
   */
  handlerRouteSegment?: string;
};

/**
 * Bootstrapped lazy planner config for the Pages Router worker path.
 */
export type RouteHandlerLazyPagesPlannerConfig =
  RouteHandlerLazyPlannerConfigBase & {
    routerKind: 'pages';
    /**
     * Catch-all page module whose `getStaticProps` contract the generated
     * handler page should reuse.
     */
    baseStaticPropsImport: ResolvedRouteHandlerModuleReference;
  };

/**
 * Bootstrapped lazy planner config for the App Router worker path.
 */
export type RouteHandlerLazyAppPlannerConfig =
  RouteHandlerLazyPlannerConfigBase & {
    routerKind: 'app';
    /**
     * Route-owned App contract shared by the public light page and generated
     * heavy handler pages.
     */
    routeModuleImport: ResolvedRouteHandlerModuleReference;
    /**
     * Build-time inspection result for the page-safe route module.
     */
    routeModule: ResolvedAppRouteModuleContract;
  };

/**
 * Router-aware bootstrapped planner config reused across lazy analysis,
 * emission, and rewrite resolution.
 */
export type RouteHandlerLazyPlannerConfig =
  | RouteHandlerLazyPagesPlannerConfig
  | RouteHandlerLazyAppPlannerConfig;

/**
 * Minimal output configuration shared by lazy stale-output cleanup helpers.
 *
 * @remarks
 * Both of these shapes satisfy this contract:
 * - the lightweight lazy request-resolution target
 * - the fully resolved target config used by one-file analysis
 *
 * That lets the lazy cleanup layer stay generic and reuse one deterministic
 * handler-path calculation protocol instead of branching on caller-specific
 * config types.
 */
export type RouteHandlerLazyOutputConfig = {
  routerKind: 'pages' | 'app';
  emitFormat: EmitFormat;
  contentLocaleMode: ContentLocaleMode;
  paths: {
    handlersDir: string;
  };
};

export type RouteHandlerLazyMatchedRouteInput = {
  /**
   * Stable target identifier selected by lazy request resolution.
   */
  targetId: string;
  /**
   * Concrete localized content route file to analyze.
   */
  routePath: LocalizedRoutePath;
  /**
   * Bootstrapped heavy target configs keyed by target id.
   */
  resolvedConfigsByTargetId: ReadonlyMap<string, RouteHandlerLazyPlannerConfig>;
  /**
   * Generation-scoped cache manager retained by the worker session.
   */
  lazySingleRouteCacheManager: RouteHandlerLazySingleRouteCacheManager;
};

/**
 * Result of resolving a proxy request into one target-local content route.
 *
 * @remarks
 * The lazy dev path needs to distinguish three states clearly:
 * - `no-target`: the request does not belong to any configured splitter target
 * - `missing-route-file`: the request belongs to a target shape, but no actual
 *   backing content file exists
 * - `matched-route-file`: the request maps cleanly to one concrete source file
 *
 * That separation will matter later when we add true lazy analysis/emission,
 * because only the third case is eligible for on-demand heavy-route planning.
 */
export type RouteHandlerLazyRequestResolution =
  | {
      /**
       * Pathname is outside all configured splitter targets.
       */
      kind: 'no-target';
      /**
       * Public pathname that was inspected.
       */
      pathname: string;
    }
  | {
      /**
       * Pathname belongs to a configured target, but no matching content file
       * exists for the resolved locale/slug identity.
       */
      kind: 'missing-route-file';
      /**
       * Public pathname that was inspected.
       */
      pathname: string;
      /**
       * Target that owns the pathname shape.
       */
      config: RouteHandlerLazyResolvedTarget;
      /**
       * Resolved locale/slug identity requested by the pathname.
       */
      identity: RouteHandlerLazyRequestIdentity;
    }
  | {
      /**
       * Pathname resolved successfully to one concrete content file.
       */
      kind: 'matched-route-file';
      /**
       * Public pathname that was inspected.
       */
      pathname: string;
      /**
       * Target that owns the pathname.
       */
      config: RouteHandlerLazyResolvedTarget;
      /**
       * Resolved locale/slug identity requested by the pathname.
       */
      identity: RouteHandlerLazyRequestIdentity;
      /**
       * Concrete localized content route file satisfying the request.
       */
      routePath: LocalizedRoutePath;
    };

/**
 * Result of analyzing exactly one matched lazy route file.
 *
 * @remarks
 * This is deliberately narrower than a full pipeline result. The lazy proxy
 * path only needs to know whether one route is heavy or light and, if heavy,
 * what its fully planned one-file handler payload looks like.
 */
export type RouteHandlerLazySingleRouteAnalysisResult =
  | {
      /**
       * The requested route is light and does not need a generated handler.
       */
      kind: 'light';
      /**
       * Whether the Stage 1 capture facts were reused from cache or freshly
       * computed.
       */
      source: 'cache' | 'fresh';
      /**
       * Narrow planner config used by analysis.
       */
      config: RouteHandlerLazyPlannerConfig;
      /**
       * Concrete localized content file that was analyzed.
       */
      routePath: LocalizedRoutePath;
    }
  | {
      /**
       * The requested route is heavy and has a fully planned one-file handler
       * payload ready for later emission.
       */
      kind: 'heavy';
      /**
       * Whether the Stage 1 capture facts were reused from cache or freshly
       * computed.
       *
       * @remarks
       * A cached Stage 1 hit still reconstructs heavy-route processor planning
       * in memory. `source: 'cache'` therefore means MDX analysis was skipped,
       * not that a full `PlannedHeavyRoute` object was persisted and reused.
       */
      source: 'cache' | 'fresh';
      /**
       * Narrow planner config used by analysis.
       */
      config: RouteHandlerLazyPlannerConfig;
      /**
       * Concrete localized content file that was analyzed.
       */
      routePath: LocalizedRoutePath;
      /**
       * Fully planned heavy-route payload for later single-handler emission.
       */
      plannedHeavyRoute: PlannedHeavyRoute;
    };

export type RouteHandlerLazyLightAnalysisResult = Extract<
  RouteHandlerLazySingleRouteAnalysisResult,
  {
    kind: 'light';
  }
>;

export type RouteHandlerLazyHeavyAnalysisResult = Extract<
  RouteHandlerLazySingleRouteAnalysisResult,
  {
    kind: 'heavy';
  }
>;

/**
 * Result of the shared cold-request "prepare one matched route" workflow.
 *
 * @remarks
 * The lazy dev proxy path intentionally separates:
 * - route analysis truth ("light" vs "heavy")
 * - the emitted heavy-route plan used for rewrite destination resolution and
 *   lazy discovery publication
 *
 * That distinction matters because "file exists on disk" is not the same
 * thing as "this request resolved to a heavy route and already has the exact
 * generated destination it should rewrite to". The bug we observed after a
 * fully clean dev start was:
 *
 * 1. request a heavy page first
 * 2. lazily analyze the one backing MDX file
 * 3. lazily emit the one generated handler page
 * 4. if the handler path was overwritten in place, give Next one extra request
 *    boundary before rewriting to it
 * 5. receive a transient 500
 *
 * This is also route-local, not process-global. If a developer navigates from
 * one already-warm heavy page to a *different* heavy page that has never been
 * emitted in this dev session, the second page can still legitimately be the
 * first route to trigger handler emission in that session.
 */
export type RouteHandlerLazyMatchedRoutePreparationResult =
  | {
      /**
       * The matched route analyzed as light, so no emitted handler is needed.
       */
      kind: 'light';
      /**
       * One-file analysis result that proved the route is light.
       */
      analysisResult: RouteHandlerLazyLightAnalysisResult;
    }
  | {
      /**
       * The matched route analyzed as heavy and has an emitted handler file.
       */
      kind: 'heavy';
      /**
       * One-file heavy analysis result used for later rewrite resolution and
       * lazy discovery publication.
       */
      analysisResult: RouteHandlerLazyHeavyAnalysisResult;
      /**
       * Filesystem synchronization result for the emitted heavy handler file.
       *
       * Synchronization aspects:
       * 1. `unchanged` means the emitted handler file already matched the
       *    freshly prepared source.
       * 2. `created` means no emitted handler file existed before this
       *    request.
       * 3. `updated` means an existing emitted handler file was overwritten
       *    with new source during this request.
       *
       * The proxy runtime treats `updated` more conservatively than
       * `created` or `unchanged`, because a just-overwritten handler path may
       * need one more request boundary before it is safe to rewrite into.
       */
      handlerSynchronizationStatus: RouteHandlerOutputSynchronizationStatus;
    };
