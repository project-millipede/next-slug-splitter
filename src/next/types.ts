import type {
  HandlerFactoryVariantDescriptor,
  HandlerFactoryVariantResolver
} from '../core/runtime-variants';
import type {
  ContentLocaleMode,
  EmitFormat,
  LocaleConfig,
  ResolvedRouteHandlerModuleReference,
  RouteHandlerModuleReference,
  RouteHandlerPaths,
  RouteHandlerPipelineResult
} from '../core/types';
export type {
  AbsoluteFileModuleReference,
  AppRelativeModuleReference,
  ModuleReference,
  PackageModuleReference,
  ResolvedModuleReference
} from '../module-reference';

/**
 * Public rewrite entry emitted by the route handler pipeline.
 *
 * Represents one concrete rewrite that should be merged into the owning
 * Next.js config.
 */
export type RouteHandlerRewriteLike = {
  /**
   * Public request pathname matched by the rewrite.
   *
   * Examples:
   * - `"/content/example"`
   * - `"/de/content/example"`
   */
  source: string;

  /**
   * Internal destination pathname for the generated handler route.
   *
   * Examples:
   * - `"/content/_handlers/example/en"`
   * - `"/de/content/_handlers/example/de"`
   */
  destination: string;

  /**
   * Whether Next.js locale handling is disabled for this rewrite.
   *
   * When `false`, the rewrite is treated as already locale-qualified.
   */
  locale?: false;

  /**
   * Whether Next.js base path handling is disabled for this rewrite.
   *
   * When `false`, the rewrite is treated as already base-path-qualified.
   */
  basePath?: false;
};

/**
 * Backwards-compatible alias for route handler rewrite entries.
 */
export type RewriteRecord = RouteHandlerRewriteLike;

/**
 * Canonical rewrite entry exported by the route handler library.
 */
export type RouteHandlerRewrite = RewriteRecord;

/**
 * Fully populated rewrite buckets organized by Next.js rewrite phase.
 *
 * The generic parameter allows callers to preserve richer rewrite record
 * shapes while still using the shared phase structure.
 */
export type RouteHandlerRewritePhases<
  TRewrite extends RouteHandlerRewriteLike = RouteHandlerRewrite
> = {
  /**
   * Rewrites applied before Next.js checks filesystem routes.
   *
   * Use this bucket for generated route-handler rewrites that must take
   * precedence over concrete page files.
   */
  beforeFiles: Array<TRewrite>;

  /**
   * Rewrites applied after Next.js checks filesystem routes.
   *
   * These rewrites run only when no concrete page file matched earlier.
   */
  afterFiles: Array<TRewrite>;

  /**
   * Fallback rewrites used when no earlier rewrite phase produced a match.
   *
   * This is the final rewrite bucket evaluated by Next.js.
   */
  fallback: Array<TRewrite>;
};

/**
 * Partially specified rewrite buckets used before normalization.
 *
 * This shape is useful for inputs where one or more rewrite buckets may be
 * omitted and later expanded into a full `RouteHandlerRewritePhases` object.
 */
export type RouteHandlerRewritePhaseConfig<
  TRewrite extends RouteHandlerRewriteLike = RouteHandlerRewrite
> = {
  /**
   * Optional rewrites to apply before filesystem routes are checked.
   */
  beforeFiles?: Array<TRewrite>;

  /**
   * Optional rewrites to apply after filesystem routes are checked.
   */
  afterFiles?: Array<TRewrite>;

  /**
   * Optional fallback rewrites used when no earlier phase matched.
   */
  fallback?: Array<TRewrite>;
};

/**
 * Filesystem and import inputs required by one configured target.
 */
export type RouteHandlerNextPaths = RouteHandlerPaths;

/**
 * Target-local filesystem path overrides.
 *
 * Excludes `rootDir` and `buildtimeHandlerRegistryPath` as those are
 * resolved at the app level.
 */
export type RouteHandlerTargetPaths = Omit<
  RouteHandlerNextPaths,
  'rootDir' | 'buildtimeHandlerRegistryPath'
>;

/**
 * App-level inputs shared by all configured targets.
 */
export type AppConfigBase = {
  /**
   * Application root directory.
   */
  rootDir?: string;

  /**
   * Path to the Next.js configuration file.
   */
  nextConfigPath?: string;
};

/**
 * User-facing app configuration.
 */
export type RouteHandlersAppConfig = AppConfigBase;

/**
 * Fully resolved app-level configuration.
 */
export type ResolvedRouteHandlersAppConfig = Required<RouteHandlersAppConfig>;

/**
 * Kind discriminator for dynamic route parameter segments.
 *
 * Determines the bracket syntax used in the route file path.
 *
 * Variants:
 * - 'single': Single dynamic segment `[param]`.
 * - 'catch-all': Catch-all segment `[...param]`.
 * - 'optional-catch-all': Optional catch-all `[[...param]]`.
 */
export type DynamicRouteParamKind =
  | 'single'
  | 'catch-all'
  | 'optional-catch-all';

/**
 * Descriptor for a Next.js dynamic route parameter segment.
 *
 * Discriminates by `kind` to determine the parameter pattern syntax.
 */
export type DynamicRouteParam =
  | {
      /**
       * Single dynamic segment matching one path part.
       *
       * Renders as: `[name]`
       */
      kind: 'single';
      /**
       * Parameter name used in the route file and as a prop key.
       */
      name: string;
    }
  | {
      /**
       * Catch-all dynamic segment matching one or more path parts.
       *
       * Renders as: `[...name]`
       */
      kind: 'catch-all';
      /**
       * Parameter name used in the route file and as a prop key.
       */
      name: string;
    }
  | {
      /**
       * Optional catch-all dynamic segment matching zero or more path parts.
       *
       * Renders as: `[[...name]]`
       */
      kind: 'optional-catch-all';
      /**
       * Parameter name used in the route file and as a prop key.
       */
      name: string;
    };

/**
 * Strategy for selecting the runtime handler factory variant using trait rules.
 */
export type RuntimeTraitHandlerFactoryVariantStrategy = {
  /**
   * Discriminator for runtime-trait strategy.
   */
  kind: 'runtime-traits';
  /**
   * Fallback variant when no trait rules match.
   */
  defaultVariant: string;
  /**
   * Ordered trait-to-variant mapping rules.
   */
  rules: Array<{
    /**
     * Runtime trait to check for.
     */
    trait: string;
    /**
     * Variant to use when the trait is present.
     */
    variant: string;
  }>;
} & HandlerFactoryVariantDescriptor;

/**
 * Custom strategy for selecting the runtime handler factory variant.
 */
export type CustomHandlerFactoryVariantStrategy = {
  /**
   * Discriminator for custom strategy.
   */
  kind: 'custom';
  /**
   * Function that inspects registry entries and returns a variant subpath.
   */
  resolveVariant: HandlerFactoryVariantResolver;
  /**
   * All possible variant subpaths this resolver may return.
   *
   * Used for eager validation of resolvable variant imports.
   */
  variants: Array<string>;
};

/**
 * Strategy for selecting the runtime handler factory variant.
 *
 * Variants:
 * - {@link RuntimeTraitHandlerFactoryVariantStrategy}: Declarative trait-based matching.
 * - {@link CustomHandlerFactoryVariantStrategy}: Custom resolver function.
 */
export type HandlerFactoryVariantStrategy =
  | RuntimeTraitHandlerFactoryVariantStrategy
  | CustomHandlerFactoryVariantStrategy;

/**
 * Runtime handler factory binding for one target.
 */
export type RuntimeHandlerFactoryBinding = {
  /**
   * Base import path for the handler factory module.
   */
  importBase: RouteHandlerModuleReference;
  /**
   * Strategy for selecting the specific factory variant.
   */
  variantStrategy: HandlerFactoryVariantStrategy;
};

/**
 * Binding that owns registry loading and runtime factory selection.
 */
export type RouteHandlerBinding = {
  /**
   * Import path for the handler registry module.
   */
  registryImport: RouteHandlerModuleReference;
  /**
   * Runtime factory binding configuration.
   */
  runtimeFactory: RuntimeHandlerFactoryBinding;
};

/**
 * Map of named bindings exported by a site-owned handler package.
 */
export type RouteHandlerBindingMap = Record<string, RouteHandlerBinding>;

/**
 * Base configuration for one route handler target.
 *
 * A target is an independently analyzed route space (e.g., 'docs' or 'blog').
 */
export type TargetConfigBase = {
  /**
   * Stable identifier for cache separation and lookup scoping.
   */
  targetId?: string;
  /**
   * Output format for generated handlers.
   */
  emitFormat?: EmitFormat;
  /**
   * Locale detection strategy for content files.
   */
  contentLocaleMode?: ContentLocaleMode;
  /**
   * Dynamic route parameter descriptor for the handler page.
   */
  handlerRouteParam?: DynamicRouteParam;
  /**
   * Binding that provides registry and factory configuration.
   */
  handlerBinding: RouteHandlerBinding;
  /**
   * Import path for the base static props module.
   */
  baseStaticPropsImport?: RouteHandlerModuleReference;
  /**
   * Base path prefix for public routes in this target.
   */
  routeBasePath?: string;
  /**
   * Target-local path overrides.
   */
  paths?: Partial<RouteHandlerTargetPaths>;
};

/**
 * User-facing target configuration.
 */
export type RouteHandlersTargetConfig = TargetConfigBase;

/**
 * Complete route handlers configuration.
 *
 * Supports single target (direct properties) or multi-target (via `targets`).
 */
export type RouteHandlersConfig = Partial<TargetConfigBase> & {
  /**
   * App-level configuration shared by all targets.
   */
  app?: RouteHandlersAppConfig;
  /**
   * Multiple target configurations.
   */
  targets?: Array<RouteHandlersTargetConfig>;
};

/**
 * Input for the route handlers entrypoint.
 */
export type RouteHandlersEntrypointInput = {
  /**
   * Application root directory.
   */
  rootDir?: string;
  /**
   * Path to the Next.js configuration file.
   */
  nextConfigPath?: string;
  /**
   * Route handlers configuration.
   */
  routeHandlersConfig?: RouteHandlersConfig;
};

/**
 * Options for creating a catch-all route handler preset.
 */
export type CreateCatchAllRouteHandlersPresetOptions = Pick<
  TargetConfigBase,
  'targetId' | 'contentLocaleMode' | 'emitFormat' | 'handlerBinding'
> & {
  /**
   * Route segment for the catch-all target (e.g., 'docs').
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
 * Resolved target configuration base (internal type).
 */
type ResolvedTargetConfigBase = Omit<
  Required<TargetConfigBase>,
  'handlerBinding' | 'baseStaticPropsImport' | 'paths'
> & {
  /**
   * Resolver function for selecting the factory variant.
   */
  resolveHandlerFactoryVariant: HandlerFactoryVariantResolver;
  /**
   * Resolved import path for the runtime handler factory.
   */
  runtimeHandlerFactoryImportBase: ResolvedRouteHandlerModuleReference;
  /**
   * Resolved import path for the base static props module.
   */
  baseStaticPropsImport: ResolvedRouteHandlerModuleReference;
  /**
   * Resolved filesystem paths for the target.
   */
  paths: RouteHandlerNextPaths;
};

/**
 * Resolved base configuration with app settings.
 */
export type ResolvedRouteHandlersConfigBase = ResolvedTargetConfigBase & {
  /**
   * Resolved app-level configuration.
   */
  app: ResolvedRouteHandlersAppConfig;
};

/**
 * Fully resolved target configuration used by the Next integration layer.
 */
export type ResolvedRouteHandlersConfig = ResolvedRouteHandlersConfigBase & {
  /**
   * Locale configuration from the Next.js config.
   */
  localeConfig: LocaleConfig;
};

/**
 * Result of the route handler pipeline with Next-specific additions.
 */
export type RouteHandlerNextResult = RouteHandlerPipelineResult & {
  /**
   * Rewrite rules for Next.js routing.
   */
  rewrites: Array<RewriteRecord>;
};

/**
 * API for looking up heavy route membership at page runtime.
 */
export type RouteHandlerHeavyRouteLookup = {
  /**
   * Target identifier for this lookup.
   */
  targetId: string;
  /**
   * Set of path keys classified as heavy routes.
   */
  heavyRoutePathKeys: ReadonlySet<string>;
  /**
   * Check if a specific route is classified as heavy.
   */
  isHeavyRoute: (locale: string, slugArray: Array<string>) => boolean;
};

/**
 * Persistent cache record for route handler results.
 */
export type PipelineCacheRecord = {
  /**
   * Cache format version.
   */
  version: number;
  /**
   * Content fingerprint for cache validation.
   */
  fingerprint: string;
  /**
   * Output format of cached results.
   */
  emitFormat: EmitFormat;
  /**
   * ISO timestamp when the cache entry was generated.
   */
  generatedAt: string;
  /**
   * Cached pipeline result.
   */
  result: RouteHandlerNextResult;
};
