import path from 'node:path';

import fileEntryCache, { type FileEntryCache } from 'file-entry-cache';
import { isString } from '../../../utils/type-guards';

import {
  readPersistedRoutePlanRecord,
  type PersistedRoutePlanRecord
} from '../../runtime/target/route-plan-record';
import {
  isObjectRecord,
  readObjectProperty
} from '../../../utils/type-guards-custom';

import type { BootstrapGenerationToken } from '../runtime/types';

const LAZY_SINGLE_ROUTE_CACHE_DIRECTORY = path.join(
  '.next',
  'cache',
  'route-handlers-lazy-single-routes'
);
const LAZY_SINGLE_ROUTE_CACHE_RECORD_VERSION = 3;
const LAZY_SINGLE_ROUTE_CACHE_PERSIST_INTERVAL_MS = 5000;

// Cache-policy note: this is the main persisted semantic cache still used by
// the dev proxy path. It stores one-file route-plan records, not emitted
// handler artifacts themselves. See `docs/architecture/cache-policy.md`.

/**
 * Persisted lazy single-route cache entry stored in `file-entry-cache`
 * descriptor metadata.
 *
 * @remarks
 * This is the data stored for one cached route file:
 * - `version` identifies the lazy-cache metadata format
 * - `routePlanRecord` stores the reusable one-file planning result
 */
export type RouteHandlerLazySingleRouteCacheRecord = {
  version: number;
  bootstrapGenerationToken: BootstrapGenerationToken;
  routePlanRecord: PersistedRoutePlanRecord;
};

/**
 * Create the `file-entry-cache` instance used by the lazy single-route cache.
 *
 * @param rootDir - Application root directory.
 * @param targetId - Stable target identifier.
 * @returns Cache instance scoped to one target.
 *
 * @remarks
 * Hashing aspects:
 * - checksums are used only for local content-change detection of one source
 *   route file
 * - this cache is not a security boundary or cross-system integrity contract
 * - the default `md5` algorithm from `file-entry-cache` / Node
 *   `crypto.createHash` is sufficient for this purpose
 */
export const createRouteHandlerLazySingleRouteFileCache = (
  rootDir: string,
  targetId: string
): FileEntryCache =>
  fileEntryCache.create(
    `route-handlers-lazy-single-${targetId.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
    path.resolve(rootDir, LAZY_SINGLE_ROUTE_CACHE_DIRECTORY),
    {
      cwd: rootDir,
      restrictAccessToCwd: false,
      useAbsolutePathAsKey: true,
      useCheckSum: true,
      useModifiedTime: true
    }
  );

/**
 * Enable periodic persistence for one retained target cache.
 *
 * @param targetFileCache - Target-scoped `FileEntryCache` whose underlying
 * cache should auto-persist.
 * @returns `void` after auto-persist has been configured and started.
 */
export const enableRouteHandlerLazySingleRouteFileCacheAutoPersist = (
  targetFileCache: FileEntryCache
): void => {
  targetFileCache.cache.persistInterval =
    LAZY_SINGLE_ROUTE_CACHE_PERSIST_INTERVAL_MS;
  targetFileCache.cache.startAutoPersist();
};

/**
 * Read and validate one lazy single-route cache record.
 *
 * @param value - Candidate descriptor metadata value.
 * @returns Valid record when present, otherwise `null`.
 */
export const readRouteHandlerLazySingleRouteCacheRecord = (
  value: unknown
): RouteHandlerLazySingleRouteCacheRecord | null => {
  // Reject non-record cache metadata early before reading persisted fields.
  if (!isObjectRecord(value)) {
    return null;
  }

  // The outer cache record must match the current metadata format version.
  const version = readObjectProperty(value, 'version');
  if (version !== LAZY_SINGLE_ROUTE_CACHE_RECORD_VERSION) {
    return null;
  }

  // Validate the generation token here so the returned record needs no cast.
  const bootstrapGenerationToken = readObjectProperty(
    value,
    'bootstrapGenerationToken'
  );
  if (!isString(bootstrapGenerationToken)) {
    return null;
  }

  // Delegate nested route-plan decoding to the dedicated persisted reader.
  const routePlanRecord = readPersistedRoutePlanRecord(
    readObjectProperty(value, 'routePlanRecord')
  );
  if (routePlanRecord == null) {
    return null;
  }

  return {
    version: LAZY_SINGLE_ROUTE_CACHE_RECORD_VERSION,
    bootstrapGenerationToken,
    routePlanRecord
  };
};

/**
 * Persist one lazy single-route cache record into the provided descriptor.
 *
 * @param targetFileDescriptor - File-entry descriptor that owns the metadata
 * slot for one route file.
 * @param routePlanRecord - Freshly computed one-file route-plan record for the
 * route file.
 * @param bootstrapGenerationToken - Current lazy-bootstrap generation token.
 * @returns `void` after descriptor metadata has been updated in memory.
 */
export const writeRouteHandlerLazySingleRouteCacheRecordToDescriptor = (
  targetFileDescriptor: ReturnType<FileEntryCache['getFileDescriptor']>,
  routePlanRecord: PersistedRoutePlanRecord,
  bootstrapGenerationToken: BootstrapGenerationToken
): void => {
  // The descriptor metadata is the persistence slot owned by this cache layer.
  // Writing the one-file route-plan record keeps the cache
  // self-contained and cheaply reusable on the next request.
  targetFileDescriptor.meta.data = {
    version: LAZY_SINGLE_ROUTE_CACHE_RECORD_VERSION,
    bootstrapGenerationToken,
    routePlanRecord
  } satisfies RouteHandlerLazySingleRouteCacheRecord;
};
