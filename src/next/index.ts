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
} from './pages/types';

export {
  absoluteModule,
  relativeModule,
  packageModule
} from '../module-reference';
export { defineRouteHandlerProcessor } from '../core/processor';
export { createCatchAllRouteHandlersPreset } from './pages/config/presets';
export { createRouteHandlersAdapterPath } from './integration/adapter-entry';
export { withSlugSplitter } from './integration/with-slug-splitter';
export type {
  NextConfigExport,
  WithSlugSplitterOptions
} from './integration/with-slug-splitter';
