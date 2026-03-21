import path from 'node:path';

import fileEntryCache, { type FileEntryCache } from 'file-entry-cache';

import {
  readPersistedRoutePlanRecord,
  type PersistedRoutePlanRecord
} from '../../runtime/route-plan-record';
import {
  isObjectRecord,
  readObjectProperty
} from '../../../utils/type-guards-custom';
import { isString } from '../../../utils/type-guards';

import type { LocalizedRoutePath } from '../../../core/types';
import type { ResolvedRouteHandlersConfig } from '../../types';

const LAZY_SINGLE_ROUTE_CACHE_DIRECTORY = path.join(
  '.next',
  'cache',
  'route-handlers-lazy-single-routes'
);
const LAZY_SINGLE_ROUTE_CACHE_RECORD_VERSION = 1;

/**
 * Persisted lazy single-route cache entry stored in `file-entry-cache`
 * descriptor metadata.
 *
 * @remarks
 * This wraps the shared one-file route-plan record with the target static
 * identity that produced it. That lets the lazy single-route cache reuse one
 * file confidently only when:
 * - the file contents are unchanged
 * - the non-content target environment is unchanged
 */
type LazySingleRouteCacheRecord = {
  version: number;
  targetIdentity: string;
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
  if (!isObjectRecord(value)) {
    return null;
  }

  const targetIdentity = readObjectProperty(value, 'targetIdentity');
  const routePlanRecord = readPersistedRoutePlanRecord(
    readObjectProperty(value, 'routePlanRecord')
  );

  if (
    readObjectProperty(value, 'version') !== LAZY_SINGLE_ROUTE_CACHE_RECORD_VERSION ||
    !isString(targetIdentity) ||
    routePlanRecord == null
  ) {
    return null;
  }

  return {
    version: LAZY_SINGLE_ROUTE_CACHE_RECORD_VERSION,
    targetIdentity,
    routePlanRecord
  };
};

/**
 * Try to reuse the cached single-route analysis for one file.
 *
 * @param input - Cache-read input.
 * @param input.config - Fully resolved target config.
 * @param input.targetIdentity - Current non-content target identity.
 * @param input.routePath - Localized route file to check.
 * @returns Cached route-plan record when reusable, otherwise `null`.
 *
 * @remarks
 * Reuse is allowed only when all three checks pass:
 * - the file still exists
 * - the file's content checksum is unchanged
 * - the cached record was produced under the same target static identity
 */
export const readLazySingleRouteCachedPlanRecord = ({
  config,
  targetIdentity,
  routePath
}: {
  config: ResolvedRouteHandlersConfig;
  targetIdentity: string;
  routePath: LocalizedRoutePath;
}): PersistedRoutePlanRecord | null => {
  const fileCache = createLazySingleRouteFileCache({
    rootDir: config.app.rootDir,
    targetId: config.targetId
  });
  const analysis = fileCache.analyzeFiles([routePath.filePath]);

  if (
    analysis.changedFiles.length > 0 ||
    analysis.notFoundFiles.length > 0
  ) {
    // Content changed or checksum data is unavailable, so the route must be
    // re-analyzed before the cache can be trusted again.
    return null;
  }

  const descriptor = fileCache.getFileDescriptor(routePath.filePath);
  const cachedRecord = readLazySingleRouteCacheRecord(descriptor.meta.data);

  if (cachedRecord == null || cachedRecord.targetIdentity !== targetIdentity) {
    return null;
  }

  return cachedRecord.routePlanRecord;
};

/**
 * Persist the freshly computed one-file route-plan record for lazy reuse.
 *
 * @param input - Cache-write input.
 * @param input.config - Fully resolved target config.
 * @param input.targetIdentity - Current non-content target identity.
 * @param input.routePath - Localized route file being cached.
 * @param input.routePlanRecord - Freshly computed one-file plan record.
 */
export const writeLazySingleRouteCachedPlanRecord = ({
  config,
  targetIdentity,
  routePath,
  routePlanRecord
}: {
  config: ResolvedRouteHandlersConfig;
  targetIdentity: string;
  routePath: LocalizedRoutePath;
  routePlanRecord: PersistedRoutePlanRecord;
}): void => {
  const fileCache = createLazySingleRouteFileCache({
    rootDir: config.app.rootDir,
    targetId: config.targetId
  });
  const descriptor = fileCache.getFileDescriptor(routePath.filePath);

  // The descriptor metadata is the persistence slot owned by this cache layer.
  // Writing both target identity and route-plan record keeps the cache
  // self-contained and cheaply reusable on the next request.
  descriptor.meta.data = {
    version: LAZY_SINGLE_ROUTE_CACHE_RECORD_VERSION,
    targetIdentity,
    routePlanRecord
  } satisfies LazySingleRouteCacheRecord;

  fileCache.reconcile();
};
