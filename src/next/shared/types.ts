import type {
  ComponentImportSpec,
  ContentLocaleMode,
  DynamicRouteParam,
  DynamicRouteParamKind,
  EmitFormat,
  FactoryBindings,
  FactoryBindingValue,
  LocaleConfig,
  ProcessorResolveInput,
  ResolvedRouteHandlerProcessorConfig,
  RouteHandlerGeneratorComponent,
  RouteHandlerGeneratorPlan,
  RouteHandlerMdxCompileOptions,
  RouteHandlerProcessor,
  RouteHandlerRouteContext,
  RouteHandlerModuleReference,
  RouteHandlerPaths,
  RouteHandlerPipelineResult
} from '../../core/types';
export type {
  AbsoluteModuleReference,
  RelativeModuleReference,
  ModuleReference,
  PackageModuleReference,
  ResolvedModuleReference
} from '../../module-reference';

/**
 * Public rewrite entry emitted by the route handler pipeline.
 *
 * Represents one concrete rewrite that should be merged into the owning
 * Next.js config.
 */
export type RouteHandlerRewrite = {
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
   * - `"/content/generated-handlers/example/en"`
   * - `"/de/content/generated-handlers/example/de"`
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

export type { FactoryBindings, FactoryBindingValue };

/**
 * Fully populated rewrite buckets organized by Next.js rewrite phase.
 *
 * The generic parameter allows callers to preserve richer rewrite record
 * shapes while still using the shared phase structure.
 */
export type RouteHandlerRewritePhases<
  TRewrite extends RouteHandlerRewrite = RouteHandlerRewrite
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
  TRewrite extends RouteHandlerRewrite = RouteHandlerRewrite
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
 * Excludes `rootDir` as that is resolved at the app level.
 *
 * Current contract:
 * 1. Catch-all preset helpers derive the canonical `generated-handlers` leaf.
 * 2. Manual target configs may still set `paths.handlersDir` directly.
 * 3. Direct `paths.handlersDir` values must already include that final
 *    segment themselves.
 */
export type RouteHandlerTargetPaths = Omit<RouteHandlerNextPaths, 'rootDir'>;

/**
 * App-level inputs shared by all configured targets.
 */
export type AppConfigBase = {
  /**
   * Application root directory.
   */
  rootDir?: string;
};

/**
 * Optional app-owned TypeScript preparation executed before route planning.
 */
export type RouteHandlerPreparation = {
  /**
   * App-owned tsconfig project file compiled before processor loading.
   */
  tsconfigPath: RouteHandlerModuleReference;
};

/**
 * App-owned preparation input accepted at the app-config boundary.
 *
 * Accepts either one prepare step or an ordered list of prepare steps.
 */
export type RouteHandlerPreparationsInput =
  | RouteHandlerPreparation
  | Array<RouteHandlerPreparation>;

/**
 * Development-only routing mode for the Next adapter entrypoint.
 *
 * @remarks
 * The library currently has two routing executors in development:
 * - `proxy`: request-time lazy routing through a generated root `proxy.ts`
 * - `rewrites`: the historical eager rewrite-generation path
 *
 * Production and build still stay on rewrites regardless of this setting.
 */
export type RouteHandlerDevelopmentRoutingMode = 'proxy' | 'rewrites';

/**
 * Optional development-only worker prewarm mode.
 *
 * @remarks
 * This controls only whether the long-lived lazy worker session should be
 * bootstrapped earlier during Next startup. It does not change request-time
 * routing strategy, heavy-route discovery, or handler emission semantics.
 */
export type RouteHandlerWorkerPrewarmMode = 'off' | 'instrumentation';

/**
 * Router family selected for one route-handlers config.
 */
export type RouteHandlerRouterKind = 'pages' | 'app';

/**
 * User-facing app-level routing policy.
 *
 * @remarks
 * This policy exists so routing mode can be decided once, very high in the
 * integration chain, instead of leaking strategy conditionals into many deeper
 * modules.
 */
export type RouteHandlersRoutingPolicy = {
  /**
   * Development-server routing mode.
   *
   * Defaults to `'proxy'` when omitted.
   */
  development?: RouteHandlerDevelopmentRoutingMode;
  /**
   * Optional startup prewarm strategy for the dev-only proxy worker.
   *
   * Defaults to `'off'` when omitted.
   */
  workerPrewarm?: RouteHandlerWorkerPrewarmMode;
};

/**
 * Fully resolved app-level routing policy.
 */
export type ResolvedRouteHandlersRoutingPolicy = {
  /**
   * Development-server routing mode after defaults are applied.
   */
  development: RouteHandlerDevelopmentRoutingMode;
  /**
   * Startup prewarm strategy after defaults are applied.
   */
  workerPrewarm: RouteHandlerWorkerPrewarmMode;
};

/**
 * Resolved app-owned TypeScript preparation.
 */
export type ResolvedRouteHandlerPreparation = {
  /** Absolute path to the resolved tsconfig project file. */
  tsconfigPath: string;
};

/**
 * User-facing app configuration.
 */
export type RouteHandlersAppConfig = AppConfigBase & {
  /**
   * Optional app-owned TypeScript preparation step or steps executed before
   * processor loading.
   */
  prepare?: RouteHandlerPreparationsInput;
  /**
   * Optional high-level routing policy for development mode.
   */
  routing?: RouteHandlersRoutingPolicy;
};

/**
 * Fully resolved app-level configuration.
 */
export type ResolvedRouteHandlersAppConfig = Required<AppConfigBase> & {
  /**
   * Resolved app-level routing policy.
   */
  routing: ResolvedRouteHandlersRoutingPolicy;
};

// DynamicRouteParamKind and DynamicRouteParam are defined in core/types.ts
// and re-exported here for public API consumers.
export type {
  DynamicRouteParamKind,
  DynamicRouteParam
} from '../../core/types';

// ---------------------------------------------------------------------------
// Route-param value resolution
// ---------------------------------------------------------------------------
//
// Each resolver corresponds to a {@link DynamicRouteParamKind} variant and
// converts a fixed slug array into the value shape Next.js expects in
// `params`.  See the variant comments on {@link DynamicRouteParam} for the
// routing semantics — the resolvers here only handle the value transform.
// ---------------------------------------------------------------------------

/**
 * Resolver for kind `'single'`.
 *
 * Extracts the sole segment via destructuring.
 */
function extractSingleSegment([segment]: string[]): string {
  return segment;
}

/**
 * Resolver for kind `'catch-all'`.
 *
 * Returns a shallow copy of all segments.
 */
function copySegments(segments: string[]): string[] {
  return Array.from(segments);
}

/**
 * Resolver for kind `'optional-catch-all'`.
 *
 * Returns `undefined` when no segments are present (param key absent
 * from `params`), otherwise a shallow copy.
 */
function copySegmentsIfPresent(segments: string[]): string[] | undefined {
  if (segments.length === 0) return undefined;
  return Array.from(segments);
}

/**
 * Resolver map keyed by {@link DynamicRouteParamKind}.
 *
 * The `Record` type ensures every variant is covered.
 */
const routeParamResolvers: Record<
  DynamicRouteParamKind,
  (segments: string[]) => string | string[] | undefined
> = {
  single: extractSingleSegment,
  'catch-all': copySegments,
  'optional-catch-all': copySegmentsIfPresent
};

/**
 * Resolve a fixed slug array into the `params` value shape for the
 * given {@link DynamicRouteParam}.
 *
 * Single source of truth for the slug -> param-value transformation used by
 * router-specific emitted handler contracts.
 */
export const resolveRouteParamValue = (
  param: DynamicRouteParam,
  slug: string[]
): string | string[] | undefined => routeParamResolvers[param.kind](slug);

/**
 * Runtime handler factory binding for one target.
 */
export type RuntimeHandlerFactoryBinding = {
  /**
   * Base import path for the handler factory module.
   */
  importBase: RouteHandlerModuleReference;
};

/**
 * Public alias for processor route context.
 */
export type {
  ComponentImportSpec,
  ProcessorResolveInput,
  ResolvedRouteHandlerProcessorConfig,
  RouteHandlerGeneratorComponent,
  RouteHandlerGeneratorPlan,
  RouteHandlerProcessor,
  RouteHandlerRouteContext
};

/**
 * Processor-first binding for runtime factory and component imports.
 */
export type ProcessorRouteHandlerBinding = {
  /**
   * App-owned processor module used to transform captured keys into a
   * route-local generation plan.
   */
  processorImport: RouteHandlerModuleReference;
};

export type RouteHandlerBinding = ProcessorRouteHandlerBinding;

/**
 * Map of named bindings exported by a site-owned handler package.
 */
export type RouteHandlerBindingMap = Record<string, RouteHandlerBinding>;

/**
 * Router-agnostic configuration for one route handler target.
 *
 * A target is an independently analyzed route space (e.g., 'docs' or 'blog').
 */
export type RouteHandlersTargetConfigBase = {
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
   * Binding that provides the processor module for route planning.
   */
  handlerBinding: RouteHandlerBinding;
  /**
   * MDX compile plugins forwarded into analysis builds for this target.
   */
  mdxCompileOptions?: RouteHandlerMdxCompileOptions;
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
 * Router-agnostic route handlers configuration container.
 *
 * Supports single target (direct properties) or multi-target (via `targets`).
 */
export type RouteHandlersConfigBase<
  TTarget extends object = RouteHandlersTargetConfigBase
> = Partial<TTarget> & {
  /**
   * Router family the config targets.
   */
  routerKind: RouteHandlerRouterKind;
  /**
   * App-level configuration shared by all targets.
   */
  app?: RouteHandlersAppConfig;
  /**
   * Multiple target configurations.
   */
  targets?: Array<TTarget>;
};

/**
 * Input for the route handlers entrypoint.
 */
export type RouteHandlersEntrypointInput<TConfig = unknown> = {
  /**
   * Application root directory.
   */
  rootDir?: string;
  /**
   * Route handlers configuration.
   */
  routeHandlersConfig?: TConfig;
};

/**
 * Runtime/executable attachments for one resolved target config.
 *
 * @remarks
 * These values are intentionally separated from the structural target config
 * because they may carry live executable data that should not be treated as a
 * manifest-safe persisted contract.
 */
export type ResolvedRouteHandlersRuntimeAttachments = {
  /**
   * MDX compile plugins forwarded into the capture build.
   */
  mdxCompileOptions: RouteHandlerMdxCompileOptions;
};

/**
 * Resolved structural target configuration shared across router contracts.
 */
type ResolvedTargetStructuralConfigBase = Omit<
  Required<RouteHandlersTargetConfigBase>,
  'handlerBinding' | 'paths' | 'mdxCompileOptions'
> & {
  /**
   * Resolved router family for the owning config.
   */
  routerKind: RouteHandlerRouterKind;
  /**
   * Resolved processor configuration used during planning.
   */
  processorConfig: ResolvedRouteHandlerProcessorConfig;
  /**
   * Resolved filesystem paths for the target.
   */
  paths: RouteHandlerNextPaths;
};

/**
 * Resolved target configuration shared across router contracts.
 */
export type ResolvedRouteHandlersTargetConfigBase =
  ResolvedTargetStructuralConfigBase & {
    /**
     * Runtime/executable attachments that are not part of the structural target
     * contract.
     */
    runtime: ResolvedRouteHandlersRuntimeAttachments;
  };

/**
 * Resolved base configuration with app settings.
 */
export type ResolvedRouteHandlersConfigBase =
  ResolvedRouteHandlersTargetConfigBase & {
    /**
     * Resolved app-level configuration.
     */
    app: ResolvedRouteHandlersAppConfig;
  };

/**
 * Shared helper for resolved target configs that already have normalized
 * locale semantics attached.
 */
export type ResolvedRouteHandlersConfigWithLocale<
  TResolvedConfigBase extends ResolvedRouteHandlersConfigBase =
    ResolvedRouteHandlersConfigBase
> = TResolvedConfigBase & {
  /**
   * Normalized locale configuration for the current router path.
   */
  localeConfig: LocaleConfig;
};

export type RouteHandlerRewriteBuckets = {
  /**
   * Baseline rewrite rules for Next.js routing.
   *
   * Canonical locale-less paths (default locale) and explicit `/<locale>/...`
   * paths (non-default locales), without the default-locale-prefixed extras.
   */
  rewrites: Array<RouteHandlerRewrite>;

  /**
   * Rewrite rules contributed specifically by default-locale-prefixed paths.
   *
   * These are the extra `/<defaultLocale>/...` rewrites emitted in addition to
   * the baseline route rewrite for heavy routes that belong to the default
   * locale.
   */
  rewritesOfDefaultLocale: Array<RouteHandlerRewrite>;
};

/**
 * Result of the route handler pipeline with Next-specific additions.
 */
export type RouteHandlerNextResult = {
  /**
   * Target identifier that produced this result.
   */
  targetId: string;
} & RouteHandlerPipelineResult &
  RouteHandlerRewriteBuckets;

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
