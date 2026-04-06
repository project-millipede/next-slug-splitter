import { type FileEntryCache } from 'file-entry-cache';

import type { LocalizedRoutePath } from '../../../core/types';
import type { PersistedRoutePlanRecord } from '../../runtime/target/route-plan-record';
import type { RouteHandlerPlannerConfig } from '../../types';
import type { BootstrapGenerationToken } from '../runtime/types';

import {
  createRouteHandlerLazySingleRouteFileCache,
  enableRouteHandlerLazySingleRouteFileCacheAutoPersist,
  readRouteHandlerLazySingleRouteCacheRecord,
  writeRouteHandlerLazySingleRouteCacheRecordToDescriptor
} from './single-route-cache';
import { debugRouteHandlerProxyWorker } from '../worker/debug-log';

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
   * Read one reusable one-file route-plan record from the retained target
   * cache.
   */
  readCachedRoutePlanRecord: (
    config: RouteHandlerPlannerConfig,
    routePath: LocalizedRoutePath,
    bootstrapGenerationToken: BootstrapGenerationToken
  ) => PersistedRoutePlanRecord | null;
  /**
   * Persist one freshly planned one-file route-plan record into the retained
   * target cache without forcing an immediate reconcile.
   */
  writeCachedRoutePlanRecord: (
    config: RouteHandlerPlannerConfig,
    routePath: LocalizedRoutePath,
    routePlanRecord: PersistedRoutePlanRecord,
    bootstrapGenerationToken: BootstrapGenerationToken
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
     * Read one cached route-plan record from the retained target cache.
     *
     * @param config - Fully resolved target config for the route's target.
     * @param routePath - Localized route file whose cached record should be
     * checked.
     * @param bootstrapGenerationToken - Current lazy-bootstrap generation
     * token.
     * @returns Cached route-plan record when reusable, otherwise `null`.
     */
    const readCachedRoutePlanRecord = (
      config: RouteHandlerPlannerConfig,
      routePath: LocalizedRoutePath,
      bootstrapGenerationToken: BootstrapGenerationToken
    ): PersistedRoutePlanRecord | null => {
      const targetFileCache = resolveTargetFileCache(config);
      // This validates only the root localized route file for the current
      // cache entry, such as the entry `en.mdx` file. Transitive imported MDX
      // files are not part of this freshness check yet.
      const fileAnalysis = targetFileCache.analyzeFiles([routePath.filePath]);

      debugRouteHandlerProxyWorker('routePath.filePath:', {
        pathname: routePath.filePath
      });

      if (
        fileAnalysis.changedFiles.length > 0 ||
        fileAnalysis.notFoundFiles.length > 0
      ) {
        // Content changed or checksum data is unavailable, so the route must
        // be re-analyzed before the cache can be trusted again.
        return null;
      }

      const targetFileDescriptor = targetFileCache.getFileDescriptor(
        routePath.filePath
      );
      const cachedRoutePlanRecord = readRouteHandlerLazySingleRouteCacheRecord(
        targetFileDescriptor.meta.data
      );

      if (
        cachedRoutePlanRecord == null ||
        cachedRoutePlanRecord.bootstrapGenerationToken !==
          bootstrapGenerationToken
      ) {
        return null;
      }

      return cachedRoutePlanRecord.routePlanRecord;
    };

    /**
     * Persist one freshly computed route-plan record into the retained target
     * cache without forcing an immediate reconcile.
     *
     * @param config - Fully resolved target config for the route's target.
     * @param routePath - Localized route file whose cache entry should be
     * updated.
     * @param routePlanRecord - Freshly computed one-file route-plan record for
     * `routePath`.
     * @param bootstrapGenerationToken - Current lazy-bootstrap generation
     * token.
     * @returns `void` after the in-memory descriptor metadata has been updated.
     */
    const writeCachedRoutePlanRecord = (
      config: RouteHandlerPlannerConfig,
      routePath: LocalizedRoutePath,
      routePlanRecord: PersistedRoutePlanRecord,
      bootstrapGenerationToken: BootstrapGenerationToken
    ): void => {
      const targetFileCache = resolveTargetFileCache(config);
      const targetFileDescriptor = targetFileCache.getFileDescriptor(
        routePath.filePath
      );

      writeRouteHandlerLazySingleRouteCacheRecordToDescriptor(
        targetFileDescriptor,
        routePlanRecord,
        bootstrapGenerationToken
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
      readCachedRoutePlanRecord,
      writeCachedRoutePlanRecord,
      flushAll,
      close
    };
  };
