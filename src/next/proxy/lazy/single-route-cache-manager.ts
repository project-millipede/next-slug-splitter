import { type FileEntryCache } from 'file-entry-cache';

import type { LocalizedRoutePath } from '../../../core/types';
import type { PersistedRouteCaptureRecord } from '../../runtime/target/route-plan-record';
import type { RouteHandlerPlannerConfig } from '../../types';

import {
  createRouteHandlerLazySingleRouteFileCache,
  enableRouteHandlerLazySingleRouteFileCacheAutoPersist,
  writeRouteHandlerLazySingleRouteCacheRecordToDescriptor
} from './single-route-cache';
import { readPersistedRouteCaptureRecord } from '../../runtime/target/route-plan-record';

/**
 * File-entry descriptor used during Stage 1 lazy cache validation.
 */
type RouteHandlerLazyDependencyFileDescriptor =
  ReturnType<FileEntryCache['getFileDescriptor']>;

/**
 * Read one dependency descriptor and return it only when the cached file state
 * remains reusable.
 *
 * @remarks
 * Stage 1 validity trusts cached `usedLoadableComponentKeys` only when the
 * root entry file and every persisted transitive MDX module path remain
 * unchanged. Any changed or missing dependency invalidates the cached Stage 1
 * record and forces a fresh capture path.
 *
 * @param targetFileCache - Retained target-scoped file-entry cache.
 * @param dependencyFilePath - Absolute dependency file path to validate.
 * @returns Reusable descriptor when the dependency is unchanged and still
 * present, otherwise `null`.
 */
const readReusableRouteHandlerLazyDependencyFileDescriptor = (
  targetFileCache: FileEntryCache,
  dependencyFilePath: string
): RouteHandlerLazyDependencyFileDescriptor | null => {
  const dependencyFileDescriptor = targetFileCache.getFileDescriptor(
    dependencyFilePath
  );

  if (dependencyFileDescriptor.changed) {
    return null;
  }

  if (dependencyFileDescriptor.notFound) {
    return null;
  }

  return dependencyFileDescriptor;
};

/**
 * Validate the persisted transitive MDX module paths for one cached Stage 1
 * record.
 *
 * @param targetFileCache - Retained target-scoped file-entry cache.
 * @param transitiveModulePaths - Persisted non-root transitive MDX module
 * paths.
 * @returns `true` when every transitive module path remains unchanged and
 * present, otherwise `false`.
 */
const areRouteHandlerLazyTransitiveModulePathsReusable = (
  targetFileCache: FileEntryCache,
  transitiveModulePaths: Array<string>
): boolean => {
  for (const transitiveModulePath of transitiveModulePaths) {
    const reusableDependencyFileDescriptor =
      readReusableRouteHandlerLazyDependencyFileDescriptor(
        targetFileCache,
        transitiveModulePath
      );

    if (reusableDependencyFileDescriptor == null) {
      return false;
    }
  }

  return true;
};

/**
 * Generation-scoped lifecycle wrapper for RAM-first lazy single-route caches.
 *
 * @remarks
 * The worker owns one instance of this object for one bootstrap generation.
 * It retains one `FileEntryCache` per target in memory so repeated lazy misses
 * can reuse file metadata state and only flush that state explicitly on worker
 * shutdown.
 */
export type RouteHandlerLazySingleRouteCacheManager = {
  /**
   * Read one reusable persisted Stage 1 route-capture record from the
   * retained target cache.
   */
  readCachedRouteCaptureRecord: (
    config: RouteHandlerPlannerConfig,
    routePath: LocalizedRoutePath
  ) => PersistedRouteCaptureRecord | null;
  /**
   * Persist one freshly captured Stage 1 route-capture record into the
   * retained target cache without forcing an immediate reconcile.
   */
  writeCachedRouteCaptureRecord: (
    config: RouteHandlerPlannerConfig,
    routePath: LocalizedRoutePath,
    routeCaptureRecord: PersistedRouteCaptureRecord
  ) => void;
  /**
   * Reconcile every retained target cache to disk.
   */
  flushAll: () => void;
  /**
   * Reconcile and stop all retained target caches, then release in-memory
   * references for the current generation.
   */
  close: () => void;
};

/**
 * Create a generation-scoped lazy single-route cache manager.
 *
 * @returns Fresh worker-owned cache manager for the current bootstrap
 * generation.
 */
export const createRouteHandlerLazySingleRouteCacheManager =
  (): RouteHandlerLazySingleRouteCacheManager => {
    const targetFileCaches = new Map<string, FileEntryCache>();
    let isClosed = false;

    /**
     * Ensure the cache manager has not already been closed.
     *
     * @returns `void` when the manager is still open.
     */
    const assertRouteHandlerLazySingleRouteCacheManagerIsOpen = (): void => {
      if (isClosed) {
        throw new Error(
          'next-slug-splitter lazy single-route cache manager is closed.'
        );
      }
    };

    /**
     * Resolve the retained `FileEntryCache` for one target, creating it on
     * first use.
     *
     * @param config - Fully resolved target config whose cache should be
     * reused.
     * @returns Retained target-scoped `FileEntryCache`.
     */
    const resolveTargetFileCache = (
      config: RouteHandlerPlannerConfig
    ): FileEntryCache => {
      assertRouteHandlerLazySingleRouteCacheManagerIsOpen();

      const existingTargetFileCache = targetFileCaches.get(config.targetId);

      if (existingTargetFileCache != null) {
        return existingTargetFileCache;
      }

      const createdTargetFileCache = createRouteHandlerLazySingleRouteFileCache(
        config.paths.rootDir,
        config.targetId
      );

      enableRouteHandlerLazySingleRouteFileCacheAutoPersist(
        createdTargetFileCache
      );
      targetFileCaches.set(config.targetId, createdTargetFileCache);
      return createdTargetFileCache;
    };

    /**
     * Read one cached Stage 1 route-capture record from the retained target
     * cache.
     *
     * @param config - Fully resolved target config for the route's target.
     * @param routePath - Localized route file whose cached record should be
     * checked.
     * @returns Cached Stage 1 route-capture record when reusable, otherwise
     * `null`.
     */
    const readCachedRouteCaptureRecord = (
      config: RouteHandlerPlannerConfig,
      routePath: LocalizedRoutePath
    ): PersistedRouteCaptureRecord | null => {
      const targetFileCache = resolveTargetFileCache(config);
      const entryFileDescriptor =
        readReusableRouteHandlerLazyDependencyFileDescriptor(
          targetFileCache,
          routePath.filePath
        );

      if (entryFileDescriptor == null) {
        // The root entry file is always validated separately from persisted
        // transitive module paths. If the root changed or disappeared, the
        // cached Stage 1 record cannot be trusted.
        return null;
      }

      // Descriptor metadata already stores the persisted Stage 1 capture
      // record directly, so read and validate that value without an extra alias.
      const cachedRouteCaptureRecord = readPersistedRouteCaptureRecord(
        entryFileDescriptor.meta.data
      );

      if (cachedRouteCaptureRecord == null) {
        return null;
      }

      if (
        !areRouteHandlerLazyTransitiveModulePathsReusable(
          targetFileCache,
          cachedRouteCaptureRecord.transitiveModulePaths
        )
      ) {
        return null;
      }

      return cachedRouteCaptureRecord;
    };

    /**
     * Persist one freshly captured Stage 1 route-capture record into the
     * retained target cache without forcing an immediate reconcile.
     *
     * @param config - Fully resolved target config for the route's target.
     * @param routePath - Localized route file whose cache entry should be
     * updated.
     * @param routeCaptureRecord - Freshly captured Stage 1 route-capture
     * record for `routePath`.
     * @returns `void` after the in-memory descriptor metadata has been updated.
     */
    const writeCachedRouteCaptureRecord = (
      config: RouteHandlerPlannerConfig,
      routePath: LocalizedRoutePath,
      routeCaptureRecord: PersistedRouteCaptureRecord
    ): void => {
      const targetFileCache = resolveTargetFileCache(config);
      const targetFileDescriptor = targetFileCache.getFileDescriptor(
        routePath.filePath
      );

      for (const transitiveModulePath of routeCaptureRecord.transitiveModulePaths) {
        // `file-entry-cache` only tracks files it has actually seen. Seeding
        // each transitive path on write ensures the next read can compare that
        // dependency's current file state against persisted cached metadata
        // instead of treating the first read as a synthetic change.
        targetFileCache.getFileDescriptor(transitiveModulePath);
      }

      writeRouteHandlerLazySingleRouteCacheRecordToDescriptor(
        targetFileDescriptor,
        routeCaptureRecord
      );
    };

    /**
     * Reconcile every retained target cache to disk.
     *
     * @returns `void` after all retained target caches have been reconciled.
     */
    const flushAll = (): void => {
      assertRouteHandlerLazySingleRouteCacheManagerIsOpen();

      for (const targetFileCache of targetFileCaches.values()) {
        targetFileCache.reconcile();
      }
    };

    /**
     * Close the cache manager for the current worker generation.
     *
     * @returns `void` after all retained caches have been reconciled, auto-
     * persist has been stopped, and the in-memory cache map has been cleared.
     */
    const close = (): void => {
      if (isClosed) {
        return;
      }

      for (const targetFileCache of targetFileCaches.values()) {
        targetFileCache.reconcile();
        targetFileCache.cache.stopAutoPersist();
      }

      targetFileCaches.clear();
      isClosed = true;
    };

    return {
      readCachedRouteCaptureRecord,
      writeCachedRouteCaptureRecord,
      flushAll,
      close
    };
  };
