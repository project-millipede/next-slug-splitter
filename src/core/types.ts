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

export type PipelineMode = 'analyze' | 'generate';

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
   * Heavy routes selected for handler generation.
   */
  heavyRoutes: Array<HeavyRouteCandidate>;

  /**
   * Resolved loadable-component snapshot used during analysis.
   */
  loadableComponents: LoadableComponentSnapshot;
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
   * Function that selects the handler factory variant based on loadable component entries.
   */
  resolveHandlerFactoryVariant: (
    entries: Array<LoadableComponentEntry>
  ) => string;

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
   * Optional resolved page-config source used to extract runtime traits and
   * scoped MDX transforms during planning.
   */
  pageConfigImport?: ResolvedModuleReference;

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
 * Single loadable component entry used during planning and emission.
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
   * Runtime traits associated with this entry.
   */
  runtimeTraits: Array<string>;
};

/**
 * Snapshot of the loadable components available for generated handlers.
 */
export type LoadableComponentSnapshot = {
  /**
   * Map of loadable component entries keyed by their unique key.
   */
  entriesByKey: Map<string, LoadableComponentEntry>;

  /**
   * Set of keys that are available for dynamic loading.
   */
  loadableKeys: Set<string>;
};

/**
 * Alias for heavy route candidate used in analysis contexts.
 */
export type RouteAnalysisRecord = HeavyRouteCandidate;
