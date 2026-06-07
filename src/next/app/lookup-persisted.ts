import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isNonEmptyString } from '../../utils/type-guards-extended';
import { isObjectRecord, readObjectProperty } from '../shared/config/shared';

const APP_ROUTE_LOOKUP_SNAPSHOT_VERSION = 1;
const DEFAULT_APP_ROUTE_LOOKUP_SNAPSHOT_PATH = path.join(
  '.next',
  'cache',
  'route-handlers-app-lookup.json'
);

/**
 * Persisted App Router page-time metadata for one configured target.
 */
export type PersistedAppRouteLookupTarget = {
  /**
   * Stable target identifier used to scope metadata in multi-target apps.
   */
  targetId: string;

  /**
   * Dynamic route param name used by page-time App static-param filtering.
   *
   * This is derived from `handlerRouteParam.name` during adapter execution.
   */
  handlerRouteParamName: string;

  /**
   * Physical App Router dynamic segment name that carries the locale.
   */
  localeRouteParamName?: string;

  /**
   * Optional resolved page-data compiler module path used by App Router route
   * contracts to delegate isolated compilation without reloading config.
   *
   * This remains optional because App targets may still load page props
   * directly inside the route contract without calling
   * `runAppPageDataCompiler(...)`.
   */
  pageDataCompilerModulePath?: string;
};

/**
 * Persisted App Router page-time metadata snapshot written by the adapter.
 */
export type PersistedAppRouteLookupSnapshot = {
  /**
   * Schema version for the persisted App snapshot format.
   */
  version: number;

  /**
   * Per-target App Router metadata used by page-time execution.
   */
  targets: Array<PersistedAppRouteLookupTarget>;
};

/**
 * Validate one parsed App target snapshot candidate.
 *
 * @param value Unknown parsed JSON value.
 * @returns `true` when the value matches the persisted App target shape.
 */
const isPersistedAppRouteLookupTarget = (
  value: unknown
): value is PersistedAppRouteLookupTarget => {
  if (!isObjectRecord(value)) {
    return false;
  }

  const targetId = readObjectProperty(value, 'targetId');
  const handlerRouteParamName = readObjectProperty(
    value,
    'handlerRouteParamName'
  );
  const localeRouteParamName = readObjectProperty(
    value,
    'localeRouteParamName'
  );
  const pageDataCompilerModulePath = readObjectProperty(
    value,
    'pageDataCompilerModulePath'
  );
  const localeRouteParamNameIsValid =
    localeRouteParamName === undefined ||
    isNonEmptyString(localeRouteParamName);

  const pageDataCompilerModulePathIsValid =
    pageDataCompilerModulePath === undefined ||
    isNonEmptyString(pageDataCompilerModulePath);

  return (
    isNonEmptyString(targetId) &&
    isNonEmptyString(handlerRouteParamName) &&
    localeRouteParamNameIsValid &&
    pageDataCompilerModulePathIsValid
  );
};

/**
 * Normalize one persisted App target entry.
 *
 * 1. Required identity fields are always written.
 * 2. Optional fields are written only when the target actually provides them.
 * 3. Each branch represents one valid optional-field combination:
 *    both App locale metadata and page-data compiler metadata, only App locale
 *    metadata, only page-data compiler metadata, or neither.
 * 4. Returning explicit object shapes keeps the persisted JSON stable without
 *    mutating a partially built snapshot object.
 *
 * @example
 * // Locale-aware target with a page-data compiler
 * { targetId: 'docs', handlerRouteParamName: 'slug', localeRouteParamName:
 * 'locale', pageDataCompilerModulePath: '/repo/dist/content-compiler.js' }
 *
 * @example
 * // Single-locale target without a page-data compiler
 * { targetId: 'docs', handlerRouteParamName: 'slug' }
 *
 * @param target App target snapshot entry to normalize.
 * @returns A snapshot entry containing only persisted App lookup fields.
 */
const normalizePersistedAppRouteLookupTarget = ({
  targetId,
  handlerRouteParamName,
  localeRouteParamName,
  pageDataCompilerModulePath
}: PersistedAppRouteLookupTarget): PersistedAppRouteLookupTarget => {
  if (localeRouteParamName != null && pageDataCompilerModulePath != null) {
    return {
      targetId,
      handlerRouteParamName,
      localeRouteParamName,
      pageDataCompilerModulePath
    };
  }

  if (localeRouteParamName != null) {
    return {
      targetId,
      handlerRouteParamName,
      localeRouteParamName
    };
  }

  if (pageDataCompilerModulePath != null) {
    return {
      targetId,
      handlerRouteParamName,
      pageDataCompilerModulePath
    };
  }

  return {
    targetId,
    handlerRouteParamName
  };
};

/**
 * Resolve the on-disk App lookup snapshot path for one app root.
 *
 * @param rootDir Application root directory.
 * @returns Absolute path to the App lookup snapshot file.
 */
export const resolveAppRouteLookupSnapshotPath = (rootDir: string): string =>
  path.resolve(rootDir, DEFAULT_APP_ROUTE_LOOKUP_SNAPSHOT_PATH);

/**
 * Create the persisted App lookup snapshot written by adapter/bootstrap flows.
 *
 * @param targets Per-target App metadata written for page-time execution.
 * @returns A normalized persisted App lookup snapshot.
 */
export const createAppRouteLookupSnapshot = (
  targets: Array<PersistedAppRouteLookupTarget>
): PersistedAppRouteLookupSnapshot => ({
  version: APP_ROUTE_LOOKUP_SNAPSHOT_VERSION,
  targets: targets
    .map(normalizePersistedAppRouteLookupTarget)
    .sort((left, right) => left.targetId.localeCompare(right.targetId))
});

/**
 * Serialize the persisted App lookup snapshot to JSON.
 *
 * @param snapshot Snapshot to serialize.
 * @returns Stable human-readable JSON written to disk.
 */
export const serializeAppRouteLookupSnapshot = (
  snapshot: PersistedAppRouteLookupSnapshot
): string =>
  JSON.stringify(
    {
      version: APP_ROUTE_LOOKUP_SNAPSHOT_VERSION,
      targets: snapshot.targets.map(normalizePersistedAppRouteLookupTarget)
    },
    null,
    2
  ) + '\n';

/**
 * Parse and validate a persisted App lookup snapshot.
 *
 * @param raw Raw JSON snapshot contents.
 * @returns The validated snapshot, or `null` when the payload is invalid.
 */
export const parseAppRouteLookupSnapshot = (
  raw: string
): PersistedAppRouteLookupSnapshot | null => {
  try {
    const parsed = JSON.parse(raw);

    if (!isObjectRecord(parsed)) {
      return null;
    }

    if (
      readObjectProperty(parsed, 'version') !==
      APP_ROUTE_LOOKUP_SNAPSHOT_VERSION
    ) {
      return null;
    }

    const targets = readObjectProperty(parsed, 'targets');

    if (
      !Array.isArray(targets) ||
      !targets.every(isPersistedAppRouteLookupTarget)
    ) {
      return null;
    }

    return {
      version: APP_ROUTE_LOOKUP_SNAPSHOT_VERSION,
      targets: targets.map(normalizePersistedAppRouteLookupTarget)
    };
  } catch {
    return null;
  }
};

/**
 * Read the persisted App lookup snapshot from disk.
 *
 * @param rootDir Application root directory.
 * @returns The parsed snapshot, or `null` when the file is missing or invalid.
 */
export const readAppRouteLookupSnapshot = async (
  rootDir: string
): Promise<PersistedAppRouteLookupSnapshot | null> => {
  const snapshotPath = resolveAppRouteLookupSnapshotPath(rootDir);

  try {
    return parseAppRouteLookupSnapshot(await readFile(snapshotPath, 'utf8'));
  } catch {
    return null;
  }
};

/**
 * Write the persisted App lookup snapshot to disk.
 *
 * @param rootDir Application root directory.
 * @param snapshot Snapshot to write.
 * @returns A promise that settles after the snapshot file is updated.
 */
export const writeAppRouteLookupSnapshot = async (
  rootDir: string,
  snapshot: PersistedAppRouteLookupSnapshot
): Promise<void> => {
  const snapshotPath = resolveAppRouteLookupSnapshotPath(rootDir);

  await mkdir(path.dirname(snapshotPath), {
    recursive: true
  });
  await writeFile(
    snapshotPath,
    serializeAppRouteLookupSnapshot(snapshot),
    'utf8'
  );
};
