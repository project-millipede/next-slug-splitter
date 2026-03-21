export type {
  AbsoluteFileModuleReference,
  AppConfigBase,
  AppRelativeModuleReference,
  ComponentImportSpec,
  DynamicRouteParam,
  ModuleReference,
  PackageModuleReference,
  ResolvedModuleReference,
  ResolvedRouteHandlerCommandPreparation,
  ResolvedRouteHandlerPreparation,
  ResolvedRouteHandlerTscProjectPreparation,
  RouteHandlerDevelopmentRoutingMode,
  RewriteRecord,
  RouteHandlerBinding,
  RouteHandlerBindingMap,
  RouteHandlerCommandPreparation,
  RouteHandlerGeneratorComponent,
  RouteHandlerGeneratorPlan,
  RouteHandlerPreparation,
  RouteHandlerProcessor,
  RouteHandlerProcessorCacheConfig,
  RouteHandlerRewrite,
  RouteHandlerRewritePhaseConfig,
  RouteHandlerRewritePhases,
  RouteHandlerRouteContext,
  RouteHandlerTargetPaths,
  RouteHandlerTscProjectPreparation,
  RouteHandlersAppConfig,
  RouteHandlersConfig,
  RouteHandlersRoutingPolicy,
  RouteHandlersTargetConfig,
  RuntimeHandlerFactoryBinding,
  TargetConfigBase
} from './types';

export {
  absoluteFileModule,
  appRelativeModule,
  packageModule
} from '../module-reference';
export { defineRouteHandlerProcessor } from '../core/processor';
export { createCatchAllRouteHandlersPreset } from './config/presets';
export { createRouteHandlersAdapterPath } from './integration/adapter-entry';
export { withSlugSplitter } from './integration/with-slug-splitter';
export type {
  NextConfigExport,
  WithSlugSplitterOptions
} from './integration/with-slug-splitter';
