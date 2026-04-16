import path from 'node:path';

import fileEntryCache, {
  type FileDescriptor,
  type FileEntryCache
} from 'file-entry-cache';

import type { PersistedRouteCaptureRecord } from './route-plan-record';

const LAZY_SINGLE_ROUTE_CACHE_DIRECTORY = path.join(
  '.next',
  'cache',
  'route-handlers-lazy-single-routes'
);
const LAZY_SINGLE_ROUTE_CACHE_PERSIST_INTERVAL_MS = 5000;

// Cache-policy note: this is the persisted Stage 1 capture cache used by the
// dev proxy path. It stores route-derived MDX capture facts only, not emitted
// handler artifacts and not full planned heavy-route payloads. Changes to MDX
// capture semantics are handled explicitly through app-level cleanup such as
// `clean:all`, not through an automatic fingerprint in this cache layer. See
// `docs/architecture/cache-policy.md`.

/**
 * Persisted Stage 1 lazy single-route cache entry stored in descriptor
 * metadata.
 */
export type RouteHandlerLazySingleRouteCacheRecord = PersistedRouteCaptureRecord;

/**
 * Create the `file-entry-cache` instance used by the lazy single-route cache.
 *
 * @remarks
 * Hashing aspects:
 * - checksums are used only for local content-change detection of one root
 *   route file and its persisted transitive MDX module paths
 * - this cache is not a security boundary or cross-system integrity contract
 * - the default `md5` algorithm from `file-entry-cache` / Node
 *   `crypto.createHash` is sufficient for this purpose
 *
 * @param rootDir - Application root directory.
 * @param targetId - Stable target identifier.
 * @returns Cache instance scoped to one target.
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
 * Persist one lazy single-route cache record into the provided descriptor.
 *
 * @param targetFileDescriptor - File-entry descriptor that owns the metadata
 * slot for one route file.
 * @param routeCaptureRecord - Freshly computed Stage 1 route-capture record
 * for the route file.
 * @returns `void` after descriptor metadata has been updated in memory.
 */
export const writeRouteHandlerLazySingleRouteCacheRecordToDescriptor = (
  targetFileDescriptor: FileDescriptor,
  routeCaptureRecord: PersistedRouteCaptureRecord
): void => {
  // The descriptor metadata is the persistence slot owned by this cache layer.
  // Writing only Stage 1 capture facts keeps the cache stable across normal
  // dev restarts while leaving heavy-route processor planning in memory.
  targetFileDescriptor.meta.data =
    routeCaptureRecord satisfies RouteHandlerLazySingleRouteCacheRecord;
};
