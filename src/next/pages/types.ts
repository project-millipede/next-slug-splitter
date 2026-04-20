import type {
  DynamicRouteParam,
  ResolvedRouteHandlerModuleReference,
  RouteHandlerModuleReference
} from '../../core/types';
import type {
  RouteHandlersEntrypointInput as SharedRouteHandlersEntrypointInput,
  ResolvedRouteHandlersConfigWithLocale,
  ResolvedRouteHandlersAppConfig,
  ResolvedRouteHandlersTargetConfigBase,
  RouteHandlerBinding,
  RouteHandlerNextPaths,
  RouteHandlersConfigBase,
  RouteHandlersTargetConfigBase
} from '../shared/types';

/**
 * Pages Router target config.
 *
 * Extends the shared target contract with the route-owned Pages contract used
 * by generated heavy handler pages.
 */
export type RouteHandlersTargetConfig = RouteHandlersTargetConfigBase & {
  /**
   * Import path for the Pages Router route contract reused by generated
   * handler pages.
   *
   * @remarks
   * Pages Router uses this field as the shared page-data contract seam.
   *
   * Key aspects:
   * 1. This usually is the catch-all page module itself, for example
   *    `pages/docs/[...slug].tsx`.
   * 2. Generated heavy handler pages reuse that page module's `getStaticProps`
   *    contract.
   * 3. The light catch-all page and generated heavy pages therefore stay on
   *    one shared page-data loading seam.
   * 4. Route enumeration still stays on the catch-all page's
   *    `getStaticPaths`; generated handlers do not own a separate
   *    route-enumerator contract in the Pages path.
   */
  routeContract: RouteHandlerModuleReference;
};

/**
 * Pages Router route-handlers config container.
 */
export type RouteHandlersConfig =
  RouteHandlersConfigBase<RouteHandlersTargetConfig> & {
    /**
     * Router family discriminator.
     */
    routerKind: 'pages';
  };

/**
 * Pages Router entrypoint input.
 */
export type RouteHandlersEntrypointInput =
  SharedRouteHandlersEntrypointInput<RouteHandlersConfig>;

/**
 * Options for creating a catch-all Pages Router preset.
 */
export type CreateCatchAllRouteHandlersPresetOptions = Pick<
  RouteHandlersTargetConfig,
  | 'targetId'
  | 'contentLocaleMode'
  | 'emitFormat'
  | 'handlerBinding'
  | 'routeContract'
  | 'mdxCompileOptions'
> & {
  /**
   * Route segment for the catch-all target (e.g. `docs`).
   */
  routeSegment: string;
  /**
   * Dynamic route parameter for the handler page.
   */
  handlerRouteParam: DynamicRouteParam;
  /**
   * Directory containing content page files.
   */
  contentDir: string;
};

/**
 * Resolved Pages Router target config shared by target-wide and lazy analysis.
 */
export type ResolvedRouteHandlersConfigBase =
  ResolvedRouteHandlersTargetConfigBase & {
    /**
     * Router family discriminator for the Pages Router contract.
     */
    routerKind: 'pages';
    /**
     * Resolved app-level configuration.
     */
    app: ResolvedRouteHandlersAppConfig;
    /**
     * Resolved route-contract import reused by generated handler pages.
     */
    routeContract: ResolvedRouteHandlerModuleReference;
  };

/**
 * Fully resolved Pages Router target config.
 */
export type ResolvedRouteHandlersConfig =
  ResolvedRouteHandlersConfigWithLocale<ResolvedRouteHandlersConfigBase>;

/**
 * Narrow Pages Router planning config shared by target-wide and lazy one-file
 * analysis.
 */
export type RouteHandlerPlannerConfig = Pick<
  ResolvedRouteHandlersConfig,
  | 'targetId'
  | 'emitFormat'
  | 'contentLocaleMode'
  | 'handlerRouteParam'
  | 'routeContract'
  | 'routeBasePath'
  | 'localeConfig'
  | 'processorConfig'
  | 'runtime'
> & {
  /**
   * Filesystem paths required during route analysis, planning, emission, and
   * stale-output cleanup.
   */
  paths: RouteHandlerNextPaths;
};

export type { RouteHandlerBinding };
