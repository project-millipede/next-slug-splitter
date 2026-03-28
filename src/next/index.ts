export type {
  ComponentImportSpec,
  DynamicRouteParam,
  DynamicRouteParamKind,
  RouteHandlerProcessor,
  RouteHandlersConfig
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
