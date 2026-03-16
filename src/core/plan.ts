import {
  loadPageConfigMetadata,
  type PageConfigMetadataEntry
} from './page-config-metadata';
import { createPipelineError } from '../utils/errors';
import { isDefined, isNonEmptyArray } from '../utils/type-guards-extended';
import type { ResolvedModuleReference } from '../module-reference';
import { classifyHeavyRoutes } from './analysis';
import { discoverLocalizedContentRoutes } from './discovery';

import type {
  LoadableComponentEntry,
  LoadableComponentSnapshot,
  LocaleConfig,
  RouteHandlerPipelineOptions,
  RouteHandlerPlan
} from './types';

/**
 * Validate and return the locale configuration required for route discovery.
 *
 * @param options - Pipeline options containing the candidate locale config.
 * @returns The validated locale config.
 * @throws If locales are missing or the default locale is not part of the set.
 */
const assertLocaleConfig = (
  options: RouteHandlerPipelineOptions
): LocaleConfig => {
  const localeConfig = options.localeConfig;

  if (!isDefined(localeConfig) || !isNonEmptyArray(localeConfig.locales)) {
    throw createPipelineError('localeConfig.locales must be configured.');
  }

  if (!localeConfig.locales.includes(localeConfig.defaultLocale)) {
    throw createPipelineError(
      `defaultLocale "${localeConfig.defaultLocale}" is not in localeConfig.locales.`
    );
  }

  return localeConfig;
};

/**
 * Build loadable component entries from captured component names and import source.
 *
 * @param componentNames - Component names captured from MDX files.
 * @param componentsImport - Import source for components.
 * @param pageConfigEntriesByKey - Optional extracted entries keyed by component key.
 * @returns Loadable component entries for the captured components.
 */
const buildLoadableComponentEntries = (
  componentNames: Array<string>,
  componentsImport: ResolvedModuleReference,
  pageConfigEntriesByKey: Map<string, PageConfigMetadataEntry>
): Array<LoadableComponentEntry> => {
  const importSource =
    componentsImport.kind === 'package'
      ? componentsImport.specifier
      : componentsImport.path;

  return componentNames.map(name => ({
    key: name,
    componentImport: {
      source: importSource,
      kind: 'named',
      importedName: name
    },
    runtimeTraits: pageConfigEntriesByKey.get(name)?.runtimeTraits ?? []
  }));
};

/**
 * Build the semantic route-handler plan without emitting files.
 *
 * @param options - Pipeline options describing the target route space.
 * @returns The analyzed route-handler plan containing heavy routes and the
 * resolved loadable-component snapshot.
 */
export const planRouteHandlers = async (
  options: RouteHandlerPipelineOptions
): Promise<RouteHandlerPlan> => {
  const localeConfig = assertLocaleConfig(options);
  const pageConfigMetadata = await loadPageConfigMetadata({
    rootDir: options.paths.rootDir,
    reference: options.pageConfigImport
  });

  const routePaths = await discoverLocalizedContentRoutes(
    options.paths.contentPagesDir,
    localeConfig,
    options.contentLocaleMode
  );

  // Analyze routes to get component names first
  const { analysisRecords, heavyRoutes } = await classifyHeavyRoutes({
    routePaths,
    mdxCompileOptions: options.mdxCompileOptions,
    includeLocaleInHandlerPath: options.contentLocaleMode !== 'default-locale'
  });

  // Collect all unique component names from heavy routes
  const allComponentNames = new Set<string>();
  for (const route of heavyRoutes) {
    for (const key of route.usedLoadableComponentKeys) {
      allComponentNames.add(key);
    }
  }

  const pageConfigEntries = pageConfigMetadata?.entries ?? [];
  const pageConfigEntriesByKey = new Map<string, PageConfigMetadataEntry>();
  for (const entry of pageConfigEntries) {
    pageConfigEntriesByKey.set(entry.key, entry);
  }

  // Build loadable component entries dynamically from componentsImport.
  const entries = buildLoadableComponentEntries(
    Array.from(allComponentNames),
    options.componentsImport,
    pageConfigEntriesByKey
  );

  const entriesByKey = new Map<string, LoadableComponentEntry>();
  for (const entry of entries) {
    entriesByKey.set(entry.key, entry);
  }

  const loadableComponents: LoadableComponentSnapshot = {
    entriesByKey,
    loadableKeys: new Set(entries.map(e => e.key))
  };

  return {
    analyzedCount: analysisRecords.length,
    heavyRoutes,
    loadableComponents
  };
};
