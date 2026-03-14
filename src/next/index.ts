export type {
  AbsoluteFileModuleReference,
  AppConfigBase,
  AppRelativeModuleReference,
  CustomHandlerFactoryVariantStrategy,
  DynamicRouteParam,
  HandlerFactoryVariantStrategy,
  ModuleReference,
  PackageModuleReference, ResolvedModuleReference, RewriteRecord, RouteHandlerBinding,
  RouteHandlerBindingMap,
  RouteHandlerRewrite,
  RouteHandlerRewritePhaseConfig,
  RouteHandlerRewritePhases, RouteHandlerTargetPaths, RouteHandlersAppConfig,
  RouteHandlersConfig,
  RouteHandlersTargetConfig, RuntimeHandlerFactoryBinding,
  RuntimeTraitHandlerFactoryVariantStrategy,
  TargetConfigBase
} from './types';

export {
  absoluteFileModule,
  appRelativeModule,
  packageModule
} from '../module-reference';
export {
  createRouteHandlersAdapterPath,
  withSlugSplitter
} from './integration/index';
export type {
  NextConfigExport,
  WithSlugSplitterOptions
} from './integration/index';
