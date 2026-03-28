import path from 'node:path';

import fileEntryCache, { type FileEntryCache } from 'file-entry-cache';

import {
  readPersistedRoutePlanRecord,
  type PersistedRoutePlanRecord
} from '../../runtime/target/route-plan-record';
import {
  isObjectRecordOf,
  readObjectProperty
} from '../../../utils/type-guards-custom';

import type { LocalizedRoutePath } from '../../../core/types';
import type { ResolvedRouteHandlersConfig } from '../../types';
import type { BootstrapGenerationToken } from '../runtime/types';

const LAZY_SINGLE_ROUTE_CACHE_DIRECTORY = path.join(
  '.next',
  'cache',
  'route-handlers-lazy-single-routes'
);
const LAZY_SINGLE_ROUTE_CACHE_RECORD_VERSION = 3;

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
type LazySingleRouteCacheRecord = {
  version: number;
  bootstrapGenerationToken: BootstrapGenerationToken;
  routePlanRecord: PersistedRoutePlanRecord;
};

/**
 * Create the `file-entry-cache` instance used by the lazy single-route cache.
 *
 * @param input - Cache-creation input.
 * @param input.rootDir - Application root directory.
 * @param input.targetId - Stable target identifier.
 * @returns Cache instance scoped to one target.
 */
const createLazySingleRouteFileCache = ({
  rootDir,
  targetId
}: {
  rootDir: string;
  targetId: string;
}): FileEntryCache =>
  fileEntryCache.create(
    `route-handlers-lazy-single-${targetId.replace(/[^a-zA-Z0-9_-]/g, '-')}`,
    path.resolve(rootDir, LAZY_SINGLE_ROUTE_CACHE_DIRECTORY),
    {
      cwd: rootDir,
      restrictAccessToCwd: false,
      useAbsolutePathAsKey: true,
      useCheckSum: true,
      useModifiedTime: true,
      hashAlgorithm: 'sha256'
    }
  );

/**
 * Read and validate one lazy single-route cache record.
 *
 * @param value - Candidate descriptor metadata value.
 * @returns Valid record when present, otherwise `null`.
 */
const readLazySingleRouteCacheRecord = (
  value: unknown
): LazySingleRouteCacheRecord | null => {
  if (!isObjectRecordOf<LazySingleRouteCacheRecord>(value)) {
    return null;
  }

  const routePlanRecord = readPersistedRoutePlanRecord(
    readObjectProperty(value, 'routePlanRecord')
  );

  if (
    readObjectProperty(value, 'version') !==
      LAZY_SINGLE_ROUTE_CACHE_RECORD_VERSION ||
    routePlanRecord == null
  ) {
    return null;
  }

  return {
    version: LAZY_SINGLE_ROUTE_CACHE_RECORD_VERSION,
    bootstrapGenerationToken: readObjectProperty(
      value,
      'bootstrapGenerationToken'
    ) as BootstrapGenerationToken,
    routePlanRecord
  };
};

/**
 * Try to reuse the cached single-route analysis for one file.
 *
 * @param input - Cache-read input.
 * @param input.config - Fully resolved target config for the route's target.
 * @param input.routePath - Localized route file whose cached record should be checked.
 * @returns Cached route-plan record when reusable, otherwise `null`.
 *
 * @remarks
 * Reuse is allowed only when all three checks pass:
 * - `routePath.filePath` still exists
 * - the content checksum for `routePath.filePath` is unchanged
 * - the cached record was written for the current bootstrap generation
 * - the stored descriptor metadata can still be decoded as a
 *   `LazySingleRouteCacheRecord` for the current cache version
 */
export const readLazySingleRouteCachedPlanRecord = ({
  config,
  routePath,
  bootstrapGenerationToken
}: {
  config: ResolvedRouteHandlersConfig;
  routePath: LocalizedRoutePath;
  bootstrapGenerationToken: BootstrapGenerationToken;
}): PersistedRoutePlanRecord | null => {
  const fileCache = createLazySingleRouteFileCache({
    rootDir: config.app.rootDir,
    targetId: config.targetId
  });
  const analysis = fileCache.analyzeFiles([routePath.filePath]);

  if (analysis.changedFiles.length > 0 || analysis.notFoundFiles.length > 0) {
    // Content changed or checksum data is unavailable, so the route must be
    // re-analyzed before the cache can be trusted again.
    return null;
  }

  const descriptor = fileCache.getFileDescriptor(routePath.filePath);
  const cachedRecord = readLazySingleRouteCacheRecord(descriptor.meta.data);

  if (
    cachedRecord == null ||
    cachedRecord.bootstrapGenerationToken !== bootstrapGenerationToken
  ) {
    return null;
  }

  return cachedRecord.routePlanRecord;
};

/**
 * Persist the freshly computed one-file route-plan record for lazy reuse.
 *
 * @param input - Cache-write input.
 * @param input.config - Fully resolved target config for the route's target.
 * @param input.routePath - Localized route file whose cache entry should be updated.
 * @param input.routePlanRecord - Freshly computed one-file route-plan record for `routePath`.
 */
export const writeLazySingleRouteCachedPlanRecord = ({
  config,
  routePath,
  routePlanRecord,
  bootstrapGenerationToken
}: {
  config: ResolvedRouteHandlersConfig;
  routePath: LocalizedRoutePath;
  routePlanRecord: PersistedRoutePlanRecord;
  bootstrapGenerationToken: BootstrapGenerationToken;
}): void => {
  const fileCache = createLazySingleRouteFileCache({
    rootDir: config.app.rootDir,
    targetId: config.targetId
  });
  const descriptor = fileCache.getFileDescriptor(routePath.filePath);
  // The descriptor metadata is the persistence slot owned by this cache layer.
  // Writing the one-file route-plan record keeps the cache
  // self-contained and cheaply reusable on the next request.
  descriptor.meta.data = {
    version: LAZY_SINGLE_ROUTE_CACHE_RECORD_VERSION,
    bootstrapGenerationToken,
    routePlanRecord
  } satisfies LazySingleRouteCacheRecord;

  fileCache.reconcile();
};
