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
import { JsonObject, JsonPrimitive } from '../utils/type-guards-json';

export type PipelineMode = 'analyze' | 'generate';

/** @deprecated Use JsonPrimitive instead */
export type SerializableMetadataPrimitive = JsonPrimitive;

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
  heavyPaths: Array<HeavyRouteCandidate>;
};

/**
 * Complete plan produced by the pipeline analysis phase.
 */
export type RouteHandlerPlan = {
  /**
   * Total number of routes analyzed.
   */
  analyzedCount: number;

  /**
   * Heavy routes selected for handler generation with their resolved
   * route-local generation plans.
   */
  heavyRoutes: Array<PlannedHeavyRoute>;
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
 * Configuration options for the route handler pipeline.
 */
export type RouteHandlerPipelineOptions = {
  /**
   * Locale configuration for route discovery.
   */
  localeConfig: LocaleConfig;

  /**
   * Strategy for detecting locale from content files.
   */
  contentLocaleMode?: ContentLocaleMode;

  /**
   * Execution phase ('analyze' or 'generate').
   */
  mode?: PipelineMode;

  /**
   * Output format for generated files.
   */
  emitFormat?: EmitFormat;

  /**
   * Resolved runtime handler factory import base.
   */
  runtimeHandlerFactoryImportBase: ResolvedModuleReference;

  /**
   * Resolved base static props module reference.
   */
  baseStaticPropsImport: ResolvedModuleReference;

  /**
   * Resolved import path for components used in MDX content.
   */
  componentsImport: ResolvedModuleReference;

  /**
   * Resolved processor binding that transforms captured component keys into
   * route-local generation plans.
   */
  processorConfig: ResolvedRouteHandlerProcessorConfig;

  /**
   * MDX compile plugins forwarded into the capture build.
   */
  mdxCompileOptions?: RouteHandlerMdxCompileOptions;

  /**
   * Base path prefix for public routes in this target.
   */
  routeBasePath: string;

  /**
   * Filesystem paths required by the pipeline.
   */
  paths: RouteHandlerPaths;
};

/**
 * Locale configuration for the application.
 */
export type LocaleConfig = {
  /**
   * Available locale codes.
   */
  locales: Array<string>;

  /**
   * Default locale used when no specific locale is detected.
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
   * Module source path or package specifier.
   */
  source: string;

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
 * Config-facing module reference alias used across the public route-handler
 * contract.
 */
export type RouteHandlerModuleReference = ModuleReference;

/**
 * Resolved module reference alias used after app-root normalization.
 */
export type ResolvedRouteHandlerModuleReference = ResolvedModuleReference;

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
 * Input passed to one processor ingress run.
 */
export type ProcessorIngressInput = {
  /**
   * Route context for the current source page.
   */
  route: RouteHandlerRouteContext;

  /**
   * Captured component keys referenced by the source page.
   */
  capturedKeys: readonly string[];
};

/**
 * Default helpers exposed to processor egress.
 */
export type ProcessorEgressDefaults = {
  /**
   * Build the default named component import for one captured key.
   */
  namedComponent: (key: string) => ComponentImportSpec;
};

/**
 * Generic processor-facing component instruction.
 */
export type RouteHandlerGeneratorComponent<TMeta = JsonObject> = {
  /**
   * Captured key represented by this component plan entry.
   */
  key: string;

  /**
   * Optional import override for the component.
   */
  componentImport?: ComponentImportSpec;

  /**
   * Opaque metadata preserved on the emitted runtime entry.
   */
  metadata?: TMeta;
};

/**
 * Generic route-local generation plan returned by processor egress.
 */
export type RouteHandlerGeneratorPlan<TMeta = JsonObject> = {
  /**
   * Runtime handler factory variant selected for this route.
   */
  factoryVariant: string;

  /**
   * Component instructions selected for the generated handler.
   */
  components: readonly RouteHandlerGeneratorComponent<TMeta>[];
};

/**
 * Optional processor cache hints used by the Next integration layer.
 */
export type RouteHandlerProcessorCacheConfig = {
  /**
   * Additional module references that should participate in cache invalidation.
   */
  inputImports?: readonly ModuleReference[];

  /**
   * Optional app-owned cache identity for external or generated data.
   */
  getIdentity?: (input: { targetId?: string }) => string | Promise<string>;
};

/**
 * Generic app-owned processor contract.
 */
export type RouteHandlerProcessor<TResolved = unknown, TMeta = JsonObject> = {
  /**
   * Optional cache hints for the Next integration layer.
   */
  cache?: RouteHandlerProcessorCacheConfig;

  /**
   * Build any private processor state from the captured keys and route context.
   */
  ingress: (input: ProcessorIngressInput) => TResolved | Promise<TResolved>;

  /**
   * Convert the resolved processor state into a route-local generation plan.
   */
  egress: (input: {
    route: RouteHandlerRouteContext;
    capturedKeys: readonly string[];
    resolved: TResolved;
    defaults: ProcessorEgressDefaults;
  }) =>
    | RouteHandlerGeneratorPlan<TMeta>
    | Promise<RouteHandlerGeneratorPlan<TMeta>>;
};

/**
 * Single emitted component entry used during handler generation.
 */
export type LoadableComponentEntry = {
  /**
   * Unique key identifying this entry.
   */
  key: string;

  /**
   * Import metadata for the component.
   */
  componentImport: ComponentImportSpec;

  /**
   * Opaque metadata emitted alongside the component reference.
   */
  metadata: JsonObject;
};

/**
 * Route selected for generation after processor validation succeeds.
 */
export type PlannedHeavyRoute = HeavyRouteCandidate & {
  /**
   * Runtime handler factory variant selected for this route.
   */
  factoryVariant: string;

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
   * Discriminator for module-backed processors.
   */
  kind: 'module';

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

/**
 * Alias for heavy route candidate used in analysis contexts.
 */
export type RouteAnalysisRecord = HeavyRouteCandidate;
