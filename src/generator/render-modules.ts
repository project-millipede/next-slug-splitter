/**
 * Prepares semantic emit input for route-handler source generation.
 *
 * @remarks
 * This file stays syntax-agnostic. It decides aliases, groups imports,
 * resolves runtime variants, and shapes registry data for the syntax emitter.
 * Direct source rendering remains delegated to the emitter layer.
 */
import { sortStringArray } from '../core/discovery';
import { createGeneratorError } from '../utils/errors';

import type { HandlerRegistryEmitEntry } from './emitters';
import type { HandlerComponentImportRecord } from './import-block';

import { renderHandlerPageSource } from './emitters';

import type {
  EmitFormat,
  NestedExpansionMap,
  RegistryEntry,
  RegistryImportKind
} from '../core/types';

/**
 * Component import record before alias resolution.
 */
type PendingComponentImportRecord = Omit<
  HandlerComponentImportRecord,
  'alias'
> & {
  /**
   * Registry entry keys that map to this import.
   */
  entryKeys: Set<string>;
};

/**
 * Nested map of pending imports indexed by kind, source, and imported name.
 */
type PendingComponentImportsByKind = Map<
  RegistryImportKind,
  Map<string, Map<string, PendingComponentImportRecord>>
>;

const isSafeIdentifier = (value: string): boolean =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);

/**
 * Builds a usable identifier candidate from an arbitrary registry key or import
 * source segment.
 *
 * @param value - Raw value that should influence the generated identifier.
 * @param fallback - Fallback prefix when no usable identifier characters exist.
 * @returns A best-effort identifier candidate.
 */
const toIdentifierCandidate = (
  value: string,
  fallback = 'Component'
): string => {
  if (isSafeIdentifier(value)) return value;

  const parts = value.match(/[A-Za-z0-9_$]+/g) ?? [];
  let candidate = '';
  for (const part of parts) {
    const leadingCharacter = part.slice(0, 1).toUpperCase();
    candidate += `${leadingCharacter}${part.slice(1)}`;
  }

  if (candidate.length === 0) {
    candidate = fallback;
  }

  if (!/^[A-Za-z_$]/.test(candidate)) {
    candidate = `${fallback}${candidate}`;
  }

  return candidate;
};

/**
 * Derives a fallback local-name candidate from an import source path.
 *
 * @param source - Import source path or module specifier.
 * @returns Identifier candidate derived from the last non-empty path segment.
 */
const getSourceLocalNameCandidate = (source: string): string => {
  const sourceSegments: Array<string> = [];
  for (const sourceSegment of source.split('/')) {
    if (sourceSegment.length > 0) {
      sourceSegments.push(sourceSegment);
    }
  }
  const baseSegment = sourceSegments[sourceSegments.length - 1] ?? 'Component';
  return toIdentifierCandidate(baseSegment);
};

/**
 * Resolves a stable local identifier for one pending import record.
 *
 * @param importRecord - Pending import record that may map to multiple registry
 * keys.
 * @param usedLocalNames - Local names already claimed in the current module.
 * @returns A collision-free local identifier.
 */
const resolveComponentLocalName = (
  importRecord: PendingComponentImportRecord,
  usedLocalNames: Set<string>
): string => {
  const candidates: Array<string> = [];

  if (
    importRecord.kind === 'named' &&
    isSafeIdentifier(importRecord.importedName)
  ) {
    candidates.push(importRecord.importedName);
  }

  for (const entryKey of sortStringArray([...importRecord.entryKeys])) {
    candidates.push(toIdentifierCandidate(entryKey));
  }

  candidates.push(getSourceLocalNameCandidate(importRecord.source));

  const seenCandidates = new Set<string>();
  for (const candidate of candidates) {
    if (candidate.length === 0 || seenCandidates.has(candidate)) {
      continue;
    }

    seenCandidates.add(candidate);
    if (!usedLocalNames.has(candidate)) {
      return candidate;
    }
  }

  const [primaryCandidate] = candidates;
  const fallbackBase = primaryCandidate ?? 'Component';
  let suffix = 2;
  let fallback = `${fallbackBase}${suffix}`;
  while (usedLocalNames.has(fallback)) {
    suffix += 1;
    fallback = `${fallbackBase}${suffix}`;
  }

  return fallback;
};

/**
 * Compare two pending component import records in emitted import order.
 *
 * @param left - Left pending import record.
 * @param right - Right pending import record.
 * @returns A stable ordering based on source, imported name, and import kind.
 */
const comparePendingComponentImportRecords = (
  left: PendingComponentImportRecord,
  right: PendingComponentImportRecord
): number => {
  const sourceComparison = left.source.localeCompare(right.source);
  if (sourceComparison !== 0) {
    return sourceComparison;
  }

  const importedNameComparison = left.importedName.localeCompare(
    right.importedName
  );
  if (importedNameComparison !== 0) {
    return importedNameComparison;
  }

  return left.kind.localeCompare(right.kind);
};

/**
 * Get the nested source bucket for one import kind, creating it when missing.
 *
 * @param importsByKind - Top-level import bucket indexed by import kind.
 * @param kind - Import kind for the current component import record.
 * @returns The nested source bucket for the requested import kind.
 */
const getOrCreateSourceImportMap = (
  importsByKind: PendingComponentImportsByKind,
  kind: RegistryImportKind
): Map<string, Map<string, PendingComponentImportRecord>> => {
  const existingSourceImportMap = importsByKind.get(kind);
  if (existingSourceImportMap) {
    return existingSourceImportMap;
  }

  const sourceImportMap = new Map<
    string,
    Map<string, PendingComponentImportRecord>
  >();
  importsByKind.set(kind, sourceImportMap);
  return sourceImportMap;
};

/**
 * Get the nested imported-name bucket for one source module, creating it when
 * missing.
 *
 * @param sourceImportMap - Source bucket already scoped to one import kind.
 * @param source - Source module specifier.
 * @returns The nested imported-name bucket for the requested source.
 */
const getOrCreateImportedNameMap = (
  sourceImportMap: Map<string, Map<string, PendingComponentImportRecord>>,
  source: string
): Map<string, PendingComponentImportRecord> => {
  const existingImportedNameMap = sourceImportMap.get(source);
  if (existingImportedNameMap) {
    return existingImportedNameMap;
  }

  const importedNameMap = new Map<string, PendingComponentImportRecord>();
  sourceImportMap.set(source, importedNameMap);
  return importedNameMap;
};

/**
 * Flatten structured pending import buckets into the ordered list consumed by
 * the emitter.
 *
 * @param importsByKind - Pending import buckets indexed by import kind, source,
 * and imported name.
 * @returns Pending import records sorted in emitted import order.
 */
const flattenPendingComponentImportRecords = (
  importsByKind: PendingComponentImportsByKind
): Array<PendingComponentImportRecord> => {
  const importRecords: Array<PendingComponentImportRecord> = [];

  for (const sourceImportMap of importsByKind.values()) {
    for (const importedNameMap of sourceImportMap.values()) {
      for (const importRecord of importedNameMap.values()) {
        importRecords.push(importRecord);
      }
    }
  }

  return importRecords.sort(comparePendingComponentImportRecords);
};

/**
 * Collapses selected registry entries into normalized component import records
 * and a lookup from entry key to emitted local alias.
 *
 * @param selectedRegistryEntries - Registry entries selected for one handler.
 * @returns Grouped component imports and alias lookup data.
 */
const buildHandlerImports = (
  selectedRegistryEntries: Array<RegistryEntry>
): {
  componentImports: Array<HandlerComponentImportRecord>;
  componentAliasByKey: Map<string, string>;
} => {
  const importsByKind: PendingComponentImportsByKind = new Map();
  const componentAliasByKey = new Map<string, string>();

  for (const entry of selectedRegistryEntries) {
    const componentImport = entry.componentImport;
    const sourceImportMap = getOrCreateSourceImportMap(
      importsByKind,
      componentImport.kind
    );
    const importedNameMap = getOrCreateImportedNameMap(
      sourceImportMap,
      componentImport.source
    );

    let importRecord = importedNameMap.get(componentImport.importedName);
    if (importRecord == null) {
      importRecord = {
        source: componentImport.source,
        kind: componentImport.kind,
        importedName: componentImport.importedName,
        entryKeys: new Set<string>()
      };
      importedNameMap.set(componentImport.importedName, importRecord);
    }

    importRecord.entryKeys.add(entry.key);
  }

  const sortedImportRecords =
    flattenPendingComponentImportRecords(importsByKind);

  const usedLocalNames = new Set<string>();
  const componentImports = sortedImportRecords.map(importRecord => {
    const alias = resolveComponentLocalName(importRecord, usedLocalNames);
    usedLocalNames.add(alias);

    for (const entryKey of sortStringArray([...importRecord.entryKeys])) {
      componentAliasByKey.set(entryKey, alias);
    }

    return {
      alias,
      source: importRecord.source,
      kind: importRecord.kind,
      importedName: importRecord.importedName
    };
  });

  return {
    componentImports,
    componentAliasByKey
  };
};

/**
 * Converts one registry entry into its emit-ready representation.
 *
 * @param entry - Registry entry being emitted.
 * @param componentAliasByKey - Alias lookup for already prepared component
 * imports.
 * @returns Emit-ready registry entry record.
 */
const buildRegistryEmitEntries = (
  entry: RegistryEntry,
  componentAliasByKey: Map<string, string>
): HandlerRegistryEmitEntry => {
  const componentAlias = componentAliasByKey.get(entry.key);
  if (componentAlias == null) {
    throw createGeneratorError(
      `Missing component alias for key "${entry.key}".`
    );
  }

  return {
    key: entry.key,
    componentAlias,
    runtimeTraits: entry.runtimeTraits
  };
};

/**
 * Fully prepared render config for one generated handler module.
 */
export type PreparedHandlerRenderConfig = {
  /**
   * Final runtime handler factory import specifier written into the generated
   * module.
   */
  runtimeHandlerFactoryImport: string;
  /**
   * Final base static props import specifier written into the generated
   * module.
   */
  baseStaticPropsImport: string;
  /**
   * Base path for public routes in this target.
   */
  routeBasePath: string;
  /**
   * Output format for the generated file.
   */
  emitFormat: EmitFormat;
};

/**
 * Input for rendering handler source modules.
 */
type HandlerSourceInput = {
  /**
   * Locale of the source route.
   */
  locale: string;
  /**
   * Slug path segments for the source route.
   */
  slugArray: Array<string>;
  /**
   * Stable identifier for the handler.
   */
  handlerId: string;
  /**
   * Loadable component keys used by this route.
   */
  usedLoadableComponentKeys: Array<string>;
  /**
   * Registry entries selected for this handler.
   */
  selectedRegistryEntries: Array<RegistryEntry>;
  /**
   * Nested dependency map for loadable components.
   */
  nestedDependencyMap: NestedExpansionMap;
  /**
   * Fully prepared render config for the generated module.
   */
  renderConfig: PreparedHandlerRenderConfig;
};

/**
 * Generated handler source artifacts.
 */
type HandlerSources = {
  /**
   * Complete source text for the generated handler page.
   */
  pageSource: string;
};

/**
 * Resolves the final semantic inputs required to emit one generated route
 * handler module and delegates actual source rendering to `emitters.ts`.
 *
 * @param input - Semantic handler source input.
 * @returns Emitted handler source artifacts.
 */
export const renderRouteHandlerModules = ({
  locale,
  slugArray,
  handlerId,
  usedLoadableComponentKeys,
  selectedRegistryEntries,
  nestedDependencyMap,
  renderConfig
}: HandlerSourceInput): HandlerSources => {
  const { componentImports, componentAliasByKey } = buildHandlerImports(
    selectedRegistryEntries
  );
  const registryEntries = selectedRegistryEntries.map(entry =>
    buildRegistryEmitEntries(entry, componentAliasByKey)
  );

  const pageSource = renderHandlerPageSource({
    sourceLocale: locale,
    sourceSlugArray: slugArray,
    handlerId,
    usedLoadableComponentKeys,
    runtimeHandlerFactoryImport: renderConfig.runtimeHandlerFactoryImport,
    baseStaticPropsImport: renderConfig.baseStaticPropsImport,
    routeBasePath: renderConfig.routeBasePath,
    componentImports,
    nestedDependencyMap,
    registryEntries,
    emitFormat: renderConfig.emitFormat
  });

  return {
    pageSource
  };
};

/**
 * Expands the set of required loadable keys by walking nested component
 * dependencies.
 *
 * @param input - Closure expansion input.
 * @returns Sorted loadable keys required for the handler after nested expansion.
 */
export const expandLoadableKeyClosure = ({
  baseLoadableKeys,
  nestedDependencyMap,
  availableLoadableKeys
}: {
  baseLoadableKeys: Array<string>;
  nestedDependencyMap: NestedExpansionMap;
  availableLoadableKeys: Set<string>;
}): Array<string> => {
  const expanded = new Set(baseLoadableKeys);
  const queue = [...baseLoadableKeys];

  while (queue.length > 0) {
    const componentName = queue.shift();
    if (componentName == null || componentName.length === 0) continue;

    const nestedTargets = nestedDependencyMap[componentName] ?? [];
    for (const nestedTarget of nestedTargets) {
      if (!availableLoadableKeys.has(nestedTarget)) continue;
      if (expanded.has(nestedTarget)) continue;
      expanded.add(nestedTarget);
      queue.push(nestedTarget);
    }
  }

  return sortStringArray([...expanded]);
};

/**
 * Filters the global nested dependency map down to the subset relevant for one
 * handler.
 *
 * @param input - Handler-specific nested dependency selection input.
 * @returns Nested dependency map scoped to the emitted handler.
 */
export const buildHandlerNestedDependencyMap = ({
  handlerLoadableKeys,
  nestedDependencyMap
}: {
  handlerLoadableKeys: Array<string>;
  nestedDependencyMap: NestedExpansionMap;
}): NestedExpansionMap => {
  const selectedKeys = new Set(handlerLoadableKeys);
  const filteredMap: NestedExpansionMap = {};

  for (const key of sortStringArray(handlerLoadableKeys)) {
    const nestedTargets = nestedDependencyMap[key] ?? [];
    const selectedTargets = sortStringArray(
      nestedTargets.filter(target => selectedKeys.has(target))
    );

    if (selectedTargets.length > 0) {
      filteredMap[key] = selectedTargets;
    }
  }

  return filteredMap;
};
