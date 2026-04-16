/**
 * Public runtime/value entrypoint for `next-slug-splitter/next`.
 *
 * Keep this surface focused on consumer-facing values that are safe to import
 * from route config, route contracts, and generated code.
 */
export type {
  ComponentImportSpec,
  DynamicRouteParam,
  DynamicRouteParamKind,
  FactoryBindings,
  FactoryBindingValue,
  ModuleReference,
  RouteHandlerGeneratorComponent,
  RouteHandlerGeneratorPlan,
  RouteHandlerProcessor
} from './shared/types';
export type {
  RouteHandlersConfig,
  RouteHandlersTargetConfig
} from './types';
export type {
  AppPageDataCompiler,
  AppPageDataCompilerCompileInput,
  AppRouteParams,
  AppRoutePageContract,
  AppRouteStaticParamValue,
  AppRouteHandlersConfig,
  AppRouteHandlersTargetConfig,
  GetAppRouteStaticParams,
  PagesRouteHandlersConfig,
  PagesRouteHandlersTargetConfig,
  RouteHandlerRouterKind
} from './types';

export {
  absoluteModule,
  relativeModule,
  packageModule
} from '../module-reference';
export { defineRouteHandlerProcessor } from '../core/processor';
export {
  runAppPageDataCompiler
} from './app/page-data-compiler-run';
export { createAppCatchAllRouteHandlersPreset } from './app/config/presets';
export { createCatchAllRouteHandlersPreset } from './pages/config/presets';
export { createRouteHandlersAdapterPath } from './integration/adapter-entry';
export { withSlugSplitter } from './integration/with-slug-splitter';
export type {
  NextConfigExport,
  WithSlugSplitterOptions
} from './integration/with-slug-splitter';
