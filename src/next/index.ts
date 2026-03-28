export type {
  AbsoluteModuleReference,
  AppConfigBase,
  RelativeModuleReference,
  ComponentImportSpec,
  DynamicRouteParam,
  DynamicRouteParamKind,
  ModuleReference,
  PackageModuleReference,
  ResolvedModuleReference,
  ResolvedRouteHandlerPreparation,
  ResolvedRouteHandlerTscProjectPreparation,
  RouteHandlerDevelopmentRoutingMode,
  RewriteRecord,
  RouteHandlerBinding,
  RouteHandlerBindingMap,
  RouteHandlerGeneratorComponent,
  RouteHandlerGeneratorPlan,
  RouteHandlerPreparation,
  RouteHandlerProcessor,
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
  absoluteModule,
  relativeModule,
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
