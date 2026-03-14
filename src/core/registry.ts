import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import esbuild from 'esbuild';
import { isArrayOf, isString } from '../utils/type-guards';
import {
  isObjectRecord,
  readObjectProperty
} from '../utils/type-guards-custom';
import {
  isNonEmptyArray,
  isNonEmptyString
} from '../utils/type-guards-extended';

import { createRegistryError } from '../utils/errors';
import { sortStringArray } from './discovery';

import type {
  NestedExpansionMap,
  RegistryEntry,
  RegistryImport,
  RegistrySnapshot,
  RouteHandlerRegistryManifest
} from './types';

/**
 * Raw manifest shape before validation and normalization.
 */
type RawRouteHandlerRegistryManifest = Omit<
  RouteHandlerRegistryManifest,
  'entries' | 'nestedDependencyMap'
> & {
  /**
   * Raw manifest entries before normalization.
   */
  entries: Array<Record<string, unknown>>;
  /**
   * Nested dependency map from the manifest.
   */
  nestedDependencyMap: NestedExpansionMap;
};

/**
 * Normalize runtime trait metadata into a sorted string list.
 *
 * @param value - Raw runtime trait value from the manifest.
 * @returns Sorted runtime trait names, or an empty array when the input is not
 * a string array.
 */
const normalizeRuntimeTraits = (value: unknown): Array<string> => {
  if (!isArrayOf(isString)(value)) {
    return [];
  }

  const runtimeTraits = value.filter(isNonEmptyString);
  return sortStringArray(runtimeTraits);
};

/**
 * Validate and normalize the import metadata for one manifest entry.
 *
 * @param entry - Registry manifest entry whose import metadata should be checked.
 * @returns Normalized import metadata for the entry.
 * @throws If the manifest entry omits or malforms required import fields.
 */
const assertImportMetadata = (
  entry: Record<string, unknown>
): RegistryImport => {
  const entryKey = readObjectProperty(entry, 'key');
  const key = isNonEmptyString(entryKey) ? entryKey : '<unknown>';
  const metadata = readObjectProperty(entry, 'import');
  if (!isObjectRecord(metadata)) {
    throw createRegistryError(`Entry "${key}" import metadata is invalid.`);
  }

  const source = readObjectProperty(metadata, 'source');
  if (!isNonEmptyString(source)) {
    throw createRegistryError(
      `Entry "${key}" import source must be a non-empty string.`
    );
  }

  const kind = readObjectProperty(metadata, 'kind');
  if (kind !== 'default' && kind !== 'named') {
    throw createRegistryError(
      `Entry "${key}" import kind must be "default" or "named".`
    );
  }

  const importedName = readObjectProperty(metadata, 'importedName');
  if (!isNonEmptyString(importedName)) {
    throw createRegistryError(
      `Entry "${key}" importedName must be a non-empty string.`
    );
  }

  return {
    source,
    kind,
    importedName
  };
};

/**
 * Normalize one raw registry manifest entry into the internal registry shape.
 *
 * @param entry - Raw manifest entry.
 * @returns Normalized registry entry used by the next-slug-splitter pipeline.
 */
const normalizeEntry = (entry: Record<string, unknown>): RegistryEntry => {
  const key = readObjectProperty(entry, 'key');
  if (!isNonEmptyString(key)) {
    throw createRegistryError('Registry manifest entry has invalid key.');
  }
  const importMeta = assertImportMetadata(entry);
  const runtimeTraits = readObjectProperty(entry, 'runtimeTraits');

  return {
    key,
    componentImport: importMeta,
    runtimeTraits: normalizeRuntimeTraits(runtimeTraits)
  };
};

/**
 * Normalize the manifest's nested expansion map.
 *
 * @param input - Raw nested expansion map value from the manifest.
 * @returns Normalized nested expansion map containing only non-empty string
 * arrays.
 */
const normalizeNestedExpansionMap = (input: unknown): NestedExpansionMap => {
  if (!isObjectRecord(input)) return {};

  const normalized: NestedExpansionMap = {};
  for (const [key, value] of Object.entries(input)) {
    if (!isArrayOf(isString)(value)) continue;
    const names = value;
    if (!isNonEmptyArray(names)) continue;
    normalized[key] = sortStringArray(names);
  }

  return normalized;
};

/**
 * Extract the route-handler registry manifest from a loaded module namespace.
 *
 * @param moduleValue - Imported module namespace or default export.
 * @returns The validated registry manifest.
 * @throws If the module does not expose a manifest in the supported export
 * positions.
 */
const resolveManifestFromModule = (
  moduleValue: unknown
): RawRouteHandlerRegistryManifest => {
  if (!isObjectRecord(moduleValue)) {
    throw createRegistryError(
      'Route handler registry module did not export an object.'
    );
  }

  let candidate = readObjectProperty(moduleValue, 'routeHandlerRegistryManifest');
  if (candidate == null) {
    candidate = readObjectProperty(moduleValue, 'default');
  }

  if (!isObjectRecord(candidate)) {
    throw createRegistryError(
      'Registry manifest export missing. Expected `routeHandlerRegistryManifest` or default export.'
    );
  }

  const rawEntries = readObjectProperty(candidate, 'entries');
  if (!isArrayOf(isObjectRecord)(rawEntries)) {
    throw createRegistryError('Registry manifest entries must be an array.');
  }
  const entries: Array<Record<string, unknown>> = rawEntries;

  return {
    entries,
    nestedDependencyMap: normalizeNestedExpansionMap(
      readObjectProperty(candidate, 'nestedDependencyMap')
    )
  };
};

/**
 * Load and normalize the route-handler registry snapshot used during analysis
 * and emission.
 *
 * @param buildtimeHandlerRegistryPath - Absolute buildtime registry module
 * path.
 * @param rootDir - Application root directory.
 * @returns Normalized registry snapshot for the current app target.
 */
export const loadRouteRegistrySnapshot = async (
  buildtimeHandlerRegistryPath: string,
  rootDir: string
): Promise<RegistrySnapshot> => {
  const moduleValue = await (async () => {
    if (!/\.tsx?$/.test(buildtimeHandlerRegistryPath)) {
      const moduleUrl = pathToFileURL(buildtimeHandlerRegistryPath).href;
      return import(moduleUrl);
    }

    // TypeScript registry sources are bundled to ESM first so the rest of the
    // loader path can treat them like regular runtime-importable modules.
    const bundled = await esbuild.build({
      absWorkingDir: rootDir,
      entryPoints: [buildtimeHandlerRegistryPath],
      bundle: true,
      write: false,
      platform: 'node',
      format: 'esm',
      target: 'node22'
    });

    const [compiledRegistryOutputFile] = bundled.outputFiles ?? [];
    if (compiledRegistryOutputFile == null) {
      throw createRegistryError(
        `Failed to compile buildtime handler registry path: ${buildtimeHandlerRegistryPath}`
      );
    }

    const tempDir = await mkdtemp(
      path.join(os.tmpdir(), 'route-handler-registry-')
    );
    const tempPath = path.join(tempDir, 'registry-manifest.mjs');
    await writeFile(tempPath, compiledRegistryOutputFile.text, 'utf8');

    try {
      const moduleUrl = pathToFileURL(tempPath).href;
      return await import(moduleUrl);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  })();

  const manifest = resolveManifestFromModule(moduleValue);

  const entriesByKey = new Map<string, RegistryEntry>();

  for (const rawEntry of manifest.entries) {
    const normalizedEntry = normalizeEntry(rawEntry);
    entriesByKey.set(normalizedEntry.key, normalizedEntry);
  }

  if (entriesByKey.size === 0) {
    throw createRegistryError('Registry manifest resolved zero entries.');
  }

  return {
    entriesByKey,
    loadableKeys: new Set(entriesByKey.keys()),
    nestedDependencyMap: manifest.nestedDependencyMap ?? {}
  };
};
