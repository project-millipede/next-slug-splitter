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
 * Extends the shared target contract with the `getStaticProps` delegation
 * module used by generated heavy handler pages.
 */
export type RouteHandlersTargetConfig = RouteHandlersTargetConfigBase & {
  /**
   * Import path for the catch-all page whose `getStaticProps` should be reused
   * by generated handler pages.
   */
  baseStaticPropsImport?: RouteHandlerModuleReference;
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
  contentPagesDir: string;
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
     * Resolved import path for the base static props module.
     */
    baseStaticPropsImport: ResolvedRouteHandlerModuleReference;
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
  | 'baseStaticPropsImport'
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
