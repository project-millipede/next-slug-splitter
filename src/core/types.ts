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
  heavyPaths: Array<HeavyRouteCandidate>;
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
   * Opaque metadata preserved on the emitted runtime entry.
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
   * Component instructions selected for the generated handler.
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
   * registry lookups, metadata assembly, or other route-local preparation
   * before returning the final plan.
   */
  resolve: (input: ProcessorResolveInput) =>
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
 * Single emitted component entry used during handler generation.
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
   * Opaque metadata emitted alongside the component reference.
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
