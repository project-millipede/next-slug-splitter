/**
 * Prepares semantic emit input for route-handler source generation.
 *
 * @remarks
 * This file stays syntax-agnostic. It decides aliases, groups imports,
 * resolves runtime variants, and shapes loadable-component data for the syntax
 * emitter.
 * Direct source rendering remains delegated to the emitter layer.
 */
import { sortStringArray } from '../../core/discovery';
import {
  getModuleReferenceValue,
  toEmittedImportSpecifier
} from '../../module-reference';
import { createGeneratorError } from '../../utils/errors';

import type { HandlerLoadableComponentEmitEntry } from './emitters';
import type { HandlerComponentImportRecord } from './import-block';

import { renderHandlerPageSource } from './emitters';

import type { ResolvedModuleReference } from '../../module-reference';

import type {
  ComponentImportKind,
  DynamicRouteParam,
  EmitFormat,
  LoadableComponentEntry,
  ResolvedComponentImportSpec,
  ResolvedFactoryBindings,
  ResolvedFactoryBindingValue
} from '../../core/types';

/**
 * Module import record before alias resolution.
 */
type PendingModuleImportRecord = {
  /**
   * Resolved module reference for the component source.
   */
  source: ResolvedModuleReference;

  /**
   * Kind of import (default or named).
   */
  kind: ComponentImportKind;

  /**
   * Name of the exported symbol being imported.
   */
  importedName: string;

  /**
   * Loadable component entry keys that map to this import.
   */
  entryKeys: Set<string>;
};

/**
 * Nested map of pending imports indexed by kind, source, and imported name.
 */
type PendingModuleImportsByKind = Map<
  ComponentImportKind,
  Map<string, Map<string, PendingModuleImportRecord>>
>;

const isSafeIdentifier = (value: string): boolean =>
  /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value);

const isResolvedFactoryBindingArray = (
  value: ResolvedFactoryBindingValue
): value is readonly ResolvedComponentImportSpec[] => Array.isArray(value);

/**
 * Builds a usable identifier candidate from an arbitrary component key or
 * import source segment.
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
 * @param importRecord - Pending import record that may map to multiple
 * loadable component keys.
 * @param usedLocalNames - Local names already claimed in the current module.
 * @returns A collision-free local identifier for the emitted module.
 */
const resolveImportLocalName = (
  importRecord: PendingModuleImportRecord,
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

  candidates.push(
    getSourceLocalNameCandidate(getModuleReferenceValue(importRecord.source))
  );

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
  let suffixNumber = 2;
  let fallback = `${fallbackBase}${suffixNumber}`;
  while (usedLocalNames.has(fallback)) {
    suffixNumber += 1;
    fallback = `${fallbackBase}${suffixNumber}`;
  }

  return fallback;
};

const resolveComponentLocalName = (
  importRecord: PendingModuleImportRecord,
  usedLocalNames: Set<string>
): string => resolveImportLocalName(importRecord, usedLocalNames);

/**
 * Compare two pending component import records in emitted import order.
 *
 * @param left - Left pending import record.
 * @param right - Right pending import record.
 * @returns A stable ordering based on source, imported name, and import kind.
 */
const comparePendingComponentImportRecords = (
  left: PendingModuleImportRecord,
  right: PendingModuleImportRecord
): number => {
  const sourceComparison = getModuleReferenceValue(left.source).localeCompare(getModuleReferenceValue(right.source));
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
  importsByKind: PendingModuleImportsByKind,
  kind: ComponentImportKind
): Map<string, Map<string, PendingModuleImportRecord>> => {
  const existingSourceImportMap = importsByKind.get(kind);
  if (existingSourceImportMap) {
    return existingSourceImportMap;
  }

  const sourceImportMap = new Map<string, Map<string, PendingModuleImportRecord>>();
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
  sourceImportMap: Map<string, Map<string, PendingModuleImportRecord>>,
  source: string
): Map<string, PendingModuleImportRecord> => {
  const existingImportedNameMap = sourceImportMap.get(source);
  if (existingImportedNameMap) {
    return existingImportedNameMap;
  }

  const importedNameMap = new Map<string, PendingModuleImportRecord>();
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
  importsByKind: PendingModuleImportsByKind
): Array<PendingModuleImportRecord> => {
  const importRecords: Array<PendingModuleImportRecord> = [];

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
 * Collapses selected component entries and optional route-level factory
 * bindings into emitted import records plus local-alias lookups.
 *
 * @param selectedComponentEntries - Loadable component entries selected for one handler.
 * @param pageFilePath - Absolute page file path used to relativize imports.
 * @param factoryBindings - Optional resolved route-level factory bindings.
 * @returns Emitted imports, component aliases, and factory-binding alias values.
 */
const buildHandlerImports = (
  selectedComponentEntries: Array<LoadableComponentEntry>,
  pageFilePath: string,
  factoryBindings?: ResolvedFactoryBindings
): {
  imports: Array<HandlerComponentImportRecord>;
  componentAliasByKey: Map<string, string>;
  factoryBindingValues: Record<string, string | Array<string>>;
} => {
  const componentImportsByKind: PendingModuleImportsByKind = new Map();
  const componentAliasByKey = new Map<string, string>();
  const factoryBindingValues: Record<string, string | Array<string>> = {};

  for (const entry of selectedComponentEntries) {
    const componentImport = entry.componentImport;
    const sourceImportMap = getOrCreateSourceImportMap(
      componentImportsByKind,
      componentImport.kind
    );
    const sourceKey = `${componentImport.source.kind}:${getModuleReferenceValue(componentImport.source)}`;
    const importedNameMap = getOrCreateImportedNameMap(
      sourceImportMap,
      sourceKey
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

  const sortedComponentImportRecords =
    flattenPendingComponentImportRecords(componentImportsByKind);

  const usedLocalNames = new Set<string>();
  const componentImports = sortedComponentImportRecords.map(importRecord => {
    const alias = resolveComponentLocalName(importRecord, usedLocalNames);
    usedLocalNames.add(alias);

    for (const entryKey of sortStringArray([...importRecord.entryKeys])) {
      componentAliasByKey.set(entryKey, alias);
    }

    return {
      alias,
      source: toEmittedImportSpecifier(pageFilePath, importRecord.source),
      kind: importRecord.kind,
      importedName: importRecord.importedName
    };
  });

  const factoryBindingImports: Array<HandlerComponentImportRecord> = [];

  const resolveFactoryBindingAlias = (
    bindingValue: ResolvedFactoryBindingValue
  ): string | Array<string> => {
    const resolveSingleBindingAlias = (
      importRecordValue: ResolvedComponentImportSpec
    ): string => {
      const importRecord: PendingModuleImportRecord = {
        source: importRecordValue.source,
        kind: importRecordValue.kind,
        importedName: importRecordValue.importedName,
        entryKeys: new Set<string>()
      };
      const alias = resolveImportLocalName(importRecord, usedLocalNames);
      usedLocalNames.add(alias);

      factoryBindingImports.push({
        alias,
        source: toEmittedImportSpecifier(pageFilePath, importRecordValue.source),
        kind: importRecordValue.kind,
        importedName: importRecordValue.importedName
      });

      return alias;
    };

    if (isResolvedFactoryBindingArray(bindingValue)) {
      return bindingValue.map(importRecordValue =>
        resolveSingleBindingAlias(importRecordValue)
      );
    }

    return resolveSingleBindingAlias(bindingValue);
  };

  for (const bindingKey of sortStringArray(Object.keys(factoryBindings ?? {}))) {
    const bindingValue = factoryBindings?.[bindingKey];
    if (bindingValue == null) {
      continue;
    }

    factoryBindingValues[bindingKey] = resolveFactoryBindingAlias(
      bindingValue
    );
  }

  const imports = [
    ...componentImports,
    ...factoryBindingImports
  ].sort((left, right) => {
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

    const kindComparison = left.kind.localeCompare(right.kind);
    if (kindComparison !== 0) {
      return kindComparison;
    }

    return left.alias.localeCompare(right.alias);
  });

  return {
    imports,
    componentAliasByKey,
    factoryBindingValues
  };
};

/**
 * Converts one loadable component entry into its emit-ready representation.
 *
 * @param entry - Loadable component entry being emitted.
 * @param componentAliasByKey - Alias lookup for already prepared component
 * imports.
 * @returns Emit-ready loadable component entry record.
 */
const buildComponentEmitEntry = (
  entry: LoadableComponentEntry,
  componentAliasByKey: Map<string, string>
): HandlerLoadableComponentEmitEntry => {
  const componentAlias = componentAliasByKey.get(entry.key);
  if (componentAlias == null) {
    throw createGeneratorError(
      `Missing component alias for key "${entry.key}".`
    );
  }

  return {
    key: entry.key,
    componentAlias,
    metadata: entry.metadata
  };
};

/**
 * Fully prepared render config for one generated handler module.
 */
export type PreparedHandlerRenderConfig = {
  /**
   * Absolute path of the generated handler page.
   */
  pageFilePath: string;
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
   * Dynamic route parameter descriptor for the handler page.
   */
  handlerRouteParam: DynamicRouteParam;
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
   * Optional resolved route-level factory bindings forwarded into emission.
   */
  factoryBindings?: ResolvedFactoryBindings;
  /**
   * Loadable component entries selected for this handler.
   */
  selectedComponentEntries: Array<LoadableComponentEntry>;
  /**
   * Fully prepared render config for the generated module.
   */
  renderConfig: PreparedHandlerRenderConfig;
};

/**
 * Resolves the final semantic inputs required to emit one generated route
 * handler module and delegates actual source rendering to `emitters.ts`.
 *
 * @param input - Semantic handler source input.
 * @returns Complete source text for the generated handler page.
 */
export const renderRouteHandlerModules = ({
  locale,
  slugArray,
  handlerId,
  usedLoadableComponentKeys,
  factoryBindings,
  selectedComponentEntries,
  renderConfig
}: HandlerSourceInput): string => {
  const {
    imports,
    componentAliasByKey,
    factoryBindingValues
  } = buildHandlerImports(
    selectedComponentEntries,
    renderConfig.pageFilePath,
    factoryBindings
  );
  const componentEntries = selectedComponentEntries.map(entry =>
    buildComponentEmitEntry(entry, componentAliasByKey)
  );

  return renderHandlerPageSource({
    sourceLocale: locale,
    sourceSlugArray: slugArray,
    handlerId,
    usedLoadableComponentKeys,
    runtimeHandlerFactoryImport: renderConfig.runtimeHandlerFactoryImport,
    baseStaticPropsImport: renderConfig.baseStaticPropsImport,
    handlerRouteParam: renderConfig.handlerRouteParam,
    routeBasePath: renderConfig.routeBasePath,
    componentImports: imports,
    componentEntries,
    factoryBindingValues,
    emitFormat: renderConfig.emitFormat
  });

};
