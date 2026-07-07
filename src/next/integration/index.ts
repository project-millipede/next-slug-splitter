export {
  createRouteHandlersAdapterPath,
  resolveSlugSplitterAdapterEntry
} from './adapter-entry';
// Internal composition and registry surface: consumed by the adapter entry
// and tests, intentionally not re-exported from the published package entry.
export { composeNextAdapters } from './adapter-composition';
export {
  clearRegisteredNextAdapter,
  readRegisteredNextAdapter,
  registerNextAdapter
} from './adapter-registry';
export {
  resolveRegisteredSlugSplitterConfigRegistration,
  readRegisteredSlugSplitterConfigRootDir,
  readRegisteredSlugSplitterConfigPath,
  registerSlugSplitterConfigPath,
  resolveSlugSplitterConfigPath
} from './slug-splitter-config';
export {
  readProvidedOrRegisteredRouteHandlersConfig,
  readRegisteredRouteHandlersConfig,
  registerRouteHandlersConfig
} from './config-registry';
export {
  loadRegisteredSlugSplitterConfig,
  loadSlugSplitterConfigFromPath
} from './slug-splitter-config-loader';
export { withSlugSplitter } from './with-slug-splitter';
export type {
  NextConfigExport,
  WithSlugSplitterOptions
} from './with-slug-splitter';
