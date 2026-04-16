/**
 * Pipeline execution phase.
 *
 * Variants:
 * - 'analyze': Discover and classify routes without emitting files.
 * - 'generate': Full analysis plus emission of handler files.
 */
import type {
  ModuleReference,
  ResolvedModuleReference
} from '../module-reference';
import type { PluggableList } from 'unified';
import type { JsonObject } from '../utils/type-guards-json';

export type PipelineMode = 'analyze' | 'generate';

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
 * MDX compile plugins forwarded into route analysis builds.
 *
 * Values are passed through to the underlying MDX compiler as-is so sites can
 * align analysis with their application MDX pipeline.
 */
export type RouteHandlerMdxCompileOptions = {
  /**
   * Remark plugins applied before recma analysis runs.
   */
  remarkPlugins?: PluggableList;

  /**
   * Recma plugins applied before the internal capture plugin runs.
   */
  recmaPlugins?: PluggableList;
};

/**
 * Output format for generated route handler files.
 *
 * Variants:
 * - 'js': Emit JavaScript files with .js extension.
 * - 'ts': Emit TypeScript files with .tsx extension.
 */
export type EmitFormat = 'js' | 'ts';

/**
 * Locale detection strategy for content file discovery.
 *
 * Variants:
 * - 'filename': Extract locale from filename prefix (e.g., `en.page.mdx`).
 * - 'default-locale': All files use the default locale.
 */
export type ContentLocaleMode = 'filename' | 'default-locale';

/**
 * Minimal identity of a localized content route.
 */
export type RouteIdentity = {
  /**
   * Locale code for the route (e.g., 'en', 'de').
   */
  locale: string;

  /**
   * Ordered path segments forming the route slug.
   *
   * Example: ['guides', 'getting-started'] for route `/guides/getting-started`.
   */
  slugArray: Array<string>;
};

/**
 * Localized route with its resolved filesystem location.
 */
export type LocalizedRoutePath = RouteIdentity & {
  /**
   * Absolute path to the source content file.
   */
  filePath: string;
};

/**
 * Route classified as requiring a generated handler.
 */
export type HeavyRouteCandidate = RouteIdentity & {
  /**
   * Target identifier for multi-target cache separation.
   */
  targetId?: string;

  /**
   * Stable identifier for the handler (used in filenames and diagnostics).
   */
  handlerId: string;

  /**
   * Relative path where the generated handler should be written.
   */
  handlerRelativePath: string;

  /**
   * Loadable component keys referenced by this route's content.
   */
  usedLoadableComponentKeys: Array<string>;
};

/**
 * Result of executing the route handler pipeline.
 */
export type RouteHandlerPipelineResult = {
  /**
   * Total number of routes analyzed.
   */
  analyzedCount: number;

  /**
   * Number of routes classified as heavy (requiring generated handlers).
   */
  heavyCount: number;

  /**
   * Heavy route candidates selected for handler generation.
   */
  heavyPaths: Array<PlannedHeavyRoute>;
};

/**
 * Filesystem paths required by the pipeline.
 */
export type RouteHandlerPaths = {
  /**
   * Application root directory.
   */
  rootDir: string;

  /**
   * Directory containing content page files to scan.
   */
  contentPagesDir: string;

  /**
   * Output directory for generated handler files.
   */
  handlersDir: string;
};

/**
 * Structural locale identity used by route planning, lookup, and rewrite
 * generation.
 *
 * @remarks
 * These values do not have to map directly to public URL prefixes in every
 * setup. Single-locale applications are normalized internally to a private
 * reserved locale identity; app code should not invent synthetic locale values
 * just to represent "single locale" mode.
 */
export type LocaleConfig = {
  /**
   * Complete set of locale identifiers the system should recognize.
   *
   * Examples:
   * - `['en', 'de']` for a multi-locale app
   * - a private internal single-locale identity created by the library
   */
  locales: Array<string>;

  /**
   * Locale identifier used when a request or route does not specify one
   * explicitly.
   *
   * This value must be included in `locales`.
   */
  defaultLocale: string;
};

/**
 * Kind of ES module import.
 *
 * Variants:
 * - 'default': Default export import.
 * - 'named': Named export import.
 */
export type ComponentImportKind = 'default' | 'named';

/**
 * Import metadata for one loadable component entry.
 */
export type ComponentImportSpec = {
  /**
   * Module reference identifying the component source.
   */
  source: ModuleReference;

  /**
   * Kind of import (default or named).
   */
  kind: ComponentImportKind;

  /**
   * Name of the exported symbol being imported.
   */
  importedName: string;
};

/**
 * Route-level factory binding value forwarded into `createHandlerPage(...)`.
 *
 * Bindings can be either one imported value or an ordered list of imported
 * values. The library preserves the shape and does not interpret binding
 * semantics.
 */
export type FactoryBindingValue =
  | ComponentImportSpec
  | readonly ComponentImportSpec[];

/**
 * Route-level factory bindings forwarded into `createHandlerPage(...)`.
 */
export type FactoryBindings = Readonly<Record<string, FactoryBindingValue>>;

/**
 * Config-facing module reference alias used across the public route-handler
 * contract.
 */
export type RouteHandlerModuleReference = ModuleReference;

/**
 * Resolved module reference alias used after app-root normalization.
 */
export type ResolvedRouteHandlerModuleReference = ResolvedModuleReference;

/**
 * Input for constructing a {@link RouteHandlerRouteContext}.
 *
 * Accepts the raw `routeBasePath` instead of the computed `routePath`,
 * which is derived automatically via `toRoutePath`.
 */
export type CreateRouteContextInput = {
  filePath: string;
  handlerId: string;
  handlerRelativePath: string;
  locale: string;
  routeBasePath: string;
  slugArray: Array<string>;
  targetId?: string;
};

/**
 * Route-local context exposed to processors.
 */
export type RouteHandlerRouteContext = {
  /**
   * Stable identifier for the owning target.
   */
  targetId?: string;

  /**
   * Locale of the source route.
   */
  locale: string;

  /**
   * Ordered slug segments of the source route.
   */
  slugArray: readonly string[];

  /**
   * Public route path for the source page.
   */
  routePath: string;

  /**
   * Absolute source file path for the route.
   */
  filePath: string;

  /**
   * Stable generated handler identifier.
   */
  handlerId: string;

  /**
   * Relative output path for the generated handler page.
   */
  handlerRelativePath: string;
};

/**
 * Input passed to one processor resolve run.
 */
export type ProcessorResolveInput = {
  /**
   * Route context for the current source page.
   */
  route: RouteHandlerRouteContext;

  /**
   * Captured component keys referenced by the source page.
   */
  capturedComponentKeys: readonly string[];
};

/**
 * Generic processor-facing component instruction.
 *
 * One entry represents one captured component key after the app-owned
 * processor has resolved how that key should be emitted into the generated
 * handler.
 *
 * The processor is also where per-component runtime metadata must be decided.
 * The library does not perform any later metadata lookup by key or module
 * import, so whatever metadata belongs to the component must travel on this
 * same entry object.
 */
export type RouteHandlerGeneratorComponent<TMeta = JsonObject> = {
  /**
   * Captured key represented by this component plan entry.
   */
  key: string;

  /**
   * Import specification for the component.
   */
  componentImport: ComponentImportSpec;

  /**
   * Inline metadata preserved on the emitted runtime entry.
   *
   * This value is chosen inside `RouteHandlerProcessor.resolve(...)` while the
   * processor is already iterating or branching over `capturedComponentKeys`.
   * In practice, that means metadata is decided at the same moment the
   * processor decides which `componentImport` belongs to this key.
   *
   * The library validates this value as a JSON object and then emits its
   * fields directly into the generated entry object next to `component`, for
   * example:
   * `{ component: SomeComponent, runtimeTraits: ["selection"] }`.
   *
   * Inlining serves two purposes:
   * 1. generated handlers stay self-contained and do not need extra metadata
   *    imports or follow-up registry resolution at runtime;
   * 2. metadata stays explicitly tied to the resolved component entry instead
   *    of being matched again later by naming convention or key lookup.
   *
   * Prefer small, stable, per-component runtime hints here. Omit the field
   * when no metadata is needed; the planner normalizes that case to an empty
   * object.
   */
  metadata?: TMeta;
};

/**
 * Generic route-local generation plan returned by processor resolve.
 */
export type RouteHandlerGeneratorPlan<TMeta = JsonObject> = {
  /**
   * Runtime handler factory module reference for this route.
   */
  factoryImport: ModuleReference;

  /**
   * Optional route-level imported bindings forwarded into the generated
   * `createHandlerPage(...)` call unchanged.
   */
  factoryBindings?: FactoryBindings;

  /**
   * Component instructions selected for the generated handler.
   *
   * Each entry must fully describe one captured component key:
   * - which component import to emit
   * - which inline metadata fields, if any, should travel with that component
   *
   * The library preserves the order of `capturedComponentKeys` when it
   * normalizes this array into the final generated route plan.
   */
  components: readonly RouteHandlerGeneratorComponent<TMeta>[];
};

/**
 * Generic app-owned processor contract.
 *
 * A processor is a route-local transformer that the library calls once per
 * heavy route.
 */
export type RouteHandlerProcessor<TMeta = JsonObject> = {
  /**
   * Produce the generation plan for one heavy route.
   *
   * Receives the route context and captured component keys. Returns which
   * components to import, from where, and which factory module the generated
   * handler page should use.
   *
   * Processor implementations can still use private local helpers to stage
   * metadata assembly or other route-local preparation before returning the
   * final plan, but the final returned component entries must already contain
   * any metadata that should appear on the emitted runtime entry objects.
   */
  resolve: (
    input: ProcessorResolveInput
  ) =>
    | RouteHandlerGeneratorPlan<TMeta>
    | Promise<RouteHandlerGeneratorPlan<TMeta>>;
};

/**
 * Resolved import metadata for one loadable component entry.
 *
 * Relative module references have been normalized to absolute form.
 */
export type ResolvedComponentImportSpec = {
  /**
   * Resolved module reference identifying the component source.
   */
  source: ResolvedModuleReference;

  /**
   * Kind of import (default or named).
   */
  kind: ComponentImportKind;

  /**
   * Name of the exported symbol being imported.
   */
  importedName: string;
};

/**
 * Resolved route-level factory binding value forwarded into
 * `createHandlerPage(...)`.
 */
export type ResolvedFactoryBindingValue =
  | ResolvedComponentImportSpec
  | readonly ResolvedComponentImportSpec[];

/**
 * Resolved route-level factory bindings forwarded into `createHandlerPage(...)`.
 */
export type ResolvedFactoryBindings = Readonly<
  Record<string, ResolvedFactoryBindingValue>
>;

/**
 * Single emitted component entry used during handler generation.
 *
 * This is the normalized form of one `RouteHandlerGeneratorComponent` after
 * module references have been resolved against the app root. The metadata is
 * still carried inline and is emitted directly into the generated handler's
 * `loadableRegistrySubset`.
 */
export type LoadableComponentEntry = {
  /**
   * Unique key identifying this entry.
   */
  key: string;

  /**
   * Resolved import metadata for the component.
   */
  componentImport: ResolvedComponentImportSpec;

  /**
   * Inline JSON metadata emitted alongside the component reference.
   */
  metadata: JsonObject;
};

/**
 * Route selected for generation after processor validation succeeds.
 */
export type PlannedHeavyRoute = HeavyRouteCandidate & {
  /**
   * Resolved runtime handler factory module reference for this route.
   */
  factoryImport: ResolvedModuleReference;

  /**
   * Optional resolved route-level bindings forwarded into `createHandlerPage`.
   */
  factoryBindings?: ResolvedFactoryBindings;

  /**
   * Fully normalized component entries selected for the route.
   */
  componentEntries: Array<LoadableComponentEntry>;
};

/**
 * Resolved processor module reference owned by the app.
 */
export type ModuleRouteHandlerProcessorConfig = {
  /**
   * Resolved module reference pointing at the processor module.
   */
  processorImport: ResolvedModuleReference;
};

/**
 * Resolved processor configuration used by the planner.
 */
export type ResolvedRouteHandlerProcessorConfig =
  ModuleRouteHandlerProcessorConfig;
