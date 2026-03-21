import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isArrayOf, isString } from '../../../utils/type-guards';
import {
  isObjectRecordOf,
  isStringArray,
  readObjectProperty
} from '../../../utils/type-guards-custom';

import type { LocalizedRoutePath } from '../../../core/types';

const ROUTE_HANDLER_LAZY_DISCOVERY_SNAPSHOT_RECORD_VERSION = 1;
const ROUTE_HANDLER_LAZY_DISCOVERY_SNAPSHOT_RECORD_PATH = path.join(
  '.next',
  'cache',
  'route-handlers-lazy-discovery.json'
);

/**
 * Persistable semantic record for one lazily discovered heavy-route rewrite.
 *
 * @remarks
 * This type is shared by:
 * - the in-memory request-time snapshot layer
 * - the persisted snapshot-store contract
 *
 * The fields are intentionally limited to the minimum identity needed to:
 * - reuse a previously discovered heavy request path
 * - validate it later against the one-file lazy route cache
 * - remove the previously emitted lazy output if the discovery becomes stale
 */
export type RouteHandlerLazyDiscoverySnapshotEntry = {
  version: 1;
  pathname: string;
  targetId: string;
  routePath: LocalizedRoutePath;
  handlersDir: string;
  pageFilePath: string;
};

type PersistedRouteHandlerLazyDiscoverySnapshotRecord = {
  version: number;
  entries: Array<RouteHandlerLazyDiscoverySnapshotEntry>;
};

/**
 * Resolve the persisted snapshot file path for one app root.
 *
 * @param input - Path-resolution input.
 * @param input.rootDir - Application root directory.
 * @returns Absolute JSON file path.
 */
const resolveRouteHandlerLazyDiscoverySnapshotRecordPath = ({
  rootDir
}: {
  rootDir: string;
}): string =>
  path.join(rootDir, ROUTE_HANDLER_LAZY_DISCOVERY_SNAPSHOT_RECORD_PATH);

/**
 * Runtime validator for one localized route path.
 *
 * @param value - Candidate persisted value.
 * @returns `true` when the value matches the expected route-path shape.
 */
const isLocalizedRoutePath = (value: unknown): value is LocalizedRoutePath => {
  if (!isObjectRecordOf<LocalizedRoutePath>(value)) {
    return false;
  }

  return (
    isString(readObjectProperty(value, 'locale')) &&
    isStringArray(readObjectProperty(value, 'slugArray')) &&
    isString(readObjectProperty(value, 'filePath'))
  );
};

/**
 * Runtime validator for one persisted lazy discovery snapshot entry.
 *
 * @param value - Candidate persisted value.
 * @returns `true` when the value matches the expected entry shape.
 */
const isRouteHandlerLazyDiscoverySnapshotEntry = (
  value: unknown
): value is RouteHandlerLazyDiscoverySnapshotEntry => {
  if (!isObjectRecordOf<RouteHandlerLazyDiscoverySnapshotEntry>(value)) {
    return false;
  }

  return (
    readObjectProperty(value, 'version') ===
      ROUTE_HANDLER_LAZY_DISCOVERY_SNAPSHOT_RECORD_VERSION &&
    isString(readObjectProperty(value, 'pathname')) &&
    isString(readObjectProperty(value, 'targetId')) &&
    isLocalizedRoutePath(readObjectProperty(value, 'routePath')) &&
    isString(readObjectProperty(value, 'handlersDir')) &&
    isString(readObjectProperty(value, 'pageFilePath'))
  );
};

/**
 * Runtime validator for the persisted lazy discovery snapshot record.
 *
 * @param value - Candidate parsed JSON value.
 * @returns `true` when the value matches the expected record shape.
 */
const isPersistedRouteHandlerLazyDiscoverySnapshotRecord = (
  value: unknown
): value is PersistedRouteHandlerLazyDiscoverySnapshotRecord => {
  if (
    !isObjectRecordOf<PersistedRouteHandlerLazyDiscoverySnapshotRecord>(value)
  ) {
    return false;
  }

  return (
    readObjectProperty(value, 'version') ===
      ROUTE_HANDLER_LAZY_DISCOVERY_SNAPSHOT_RECORD_VERSION &&
    isArrayOf(isRouteHandlerLazyDiscoverySnapshotEntry)(
      readObjectProperty(value, 'entries')
    )
  );
};

/**
 * Read the persisted lazy discovery snapshot entries for one app root.
 *
 * @param input - Read input.
 * @param input.rootDir - Application root directory.
 * @returns Persisted entries keyed by exact public pathname.
 *
 * @remarks
 * Invalid or missing persisted data is treated as an empty snapshot. The
 * request-time lazy path can always repopulate it opportunistically, so the
 * storage contract is intentionally self-healing rather than strict.
 */
export const readPersistedRouteHandlerLazyDiscoverySnapshotEntries = async ({
  rootDir
}: {
  rootDir: string;
}): Promise<Map<string, RouteHandlerLazyDiscoverySnapshotEntry>> => {
  const recordPath = resolveRouteHandlerLazyDiscoverySnapshotRecordPath({
    rootDir
  });

  try {
    const raw = await readFile(recordPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!isPersistedRouteHandlerLazyDiscoverySnapshotRecord(parsed)) {
      return new Map();
    }

    return new Map(
      parsed.entries.map(entry => [entry.pathname, entry] as const)
    );
  } catch {
    return new Map();
  }
};

/**
 * Persist the current lazy discovery snapshot entries for one app root.
 *
 * @param input - Write input.
 * @param input.rootDir - Application root directory.
 * @param input.entries - Entries keyed by exact public pathname.
 *
 * @remarks
 * An empty snapshot removes the persisted file entirely. That keeps the cache
 * directory easier to inspect and communicates that there is no longer any
 * reusable lazy discovery state for the app.
 */
export const writePersistedRouteHandlerLazyDiscoverySnapshotEntries = async ({
  rootDir,
  entries
}: {
  rootDir: string;
  entries: ReadonlyMap<string, RouteHandlerLazyDiscoverySnapshotEntry>;
}): Promise<void> => {
  const recordPath = resolveRouteHandlerLazyDiscoverySnapshotRecordPath({
    rootDir
  });

  if (entries.size === 0) {
    await rm(recordPath, {
      force: true
    });
    return;
  }

  const record: PersistedRouteHandlerLazyDiscoverySnapshotRecord = {
    version: ROUTE_HANDLER_LAZY_DISCOVERY_SNAPSHOT_RECORD_VERSION,
    entries: [...entries.values()].sort((left, right) =>
      left.pathname.localeCompare(right.pathname)
    )
  };

  await mkdir(path.dirname(recordPath), {
    recursive: true
  });
  await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
};
