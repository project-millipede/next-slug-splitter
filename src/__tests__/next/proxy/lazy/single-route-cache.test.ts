import { beforeEach, describe, expect, it, vi } from 'vitest';

const createFileEntryCacheMock = vi.hoisted(() => vi.fn());

vi.mock('file-entry-cache', () => ({
  default: {
    create: createFileEntryCacheMock,
    createFromFile: vi.fn()
  }
}));

import { createRouteHandlerLazySingleRouteCacheManager } from '../../../../next/proxy/lazy/single-route-cache-manager';

import type { RouteHandlerPlannerConfig } from '../../../../next/types';

type MockFileDescriptor = {
  meta: {
    data?: unknown;
  };
};

type MockFileEntryCache = {
  analyzeFiles: ReturnType<typeof vi.fn>;
  getFileDescriptor: ReturnType<typeof vi.fn>;
  reconcile: ReturnType<typeof vi.fn>;
  cache: {
    persistInterval: number;
    startAutoPersist: ReturnType<typeof vi.fn>;
    stopAutoPersist: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  };
  descriptor: MockFileDescriptor;
};

/**
 * Create a minimal `FileEntryCache` test double.
 *
 * @returns Mock `FileEntryCache` instance with shared descriptor state.
 */
const createMockFileEntryCache = (): MockFileEntryCache => {
  const descriptor: MockFileDescriptor = {
    meta: {}
  };

  return {
    analyzeFiles: vi.fn(() => ({
      changedFiles: [],
      notFoundFiles: [],
      notChangedFiles: []
    })),
    getFileDescriptor: vi.fn(() => descriptor),
    reconcile: vi.fn(),
    cache: {
      persistInterval: 0,
      startAutoPersist: vi.fn(),
      stopAutoPersist: vi.fn(),
      destroy: vi.fn()
    },
    descriptor
  };
};

/**
 * Build the minimal planner config needed by the lazy cache manager.
 *
 * @param targetId - Stable target identifier.
 * @returns Minimal planner config shape for cache-manager tests.
 */
const createPlannerConfig = (targetId: string): RouteHandlerPlannerConfig =>
  ({
    targetId,
    paths: {
      rootDir: '/app'
    }
  }) as RouteHandlerPlannerConfig;

const routePath = {
  filePath: '/app/content/post.mdx',
  locale: 'en',
  slugArray: ['post']
};
const routePlanRecord = {
  version: 4,
  plannedHeavyRoute: null
};

describe('lazy single-route cache manager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reuses one FileEntryCache instance per target and starts auto-persist at 5000ms', () => {
    const firstTargetFileCache = createMockFileEntryCache();

    createFileEntryCacheMock.mockReturnValue(firstTargetFileCache);

    const lazySingleRouteCacheManager =
      createRouteHandlerLazySingleRouteCacheManager();
    const plannerConfig = createPlannerConfig('docs');

    lazySingleRouteCacheManager.writeCachedRoutePlanRecord(
      plannerConfig,
      routePath,
      routePlanRecord,
      'bootstrap-1'
    );
    lazySingleRouteCacheManager.readCachedRoutePlanRecord(
      plannerConfig,
      routePath,
      'bootstrap-1'
    );

    expect(createFileEntryCacheMock).toHaveBeenCalledTimes(1);
    expect(firstTargetFileCache.cache.persistInterval).toBe(5000);
    expect(firstTargetFileCache.cache.startAutoPersist).toHaveBeenCalledTimes(1);
  });

  it('does not reconcile on write and flushes all retained caches on flushAll', () => {
    const targetFileCache = createMockFileEntryCache();

    createFileEntryCacheMock.mockReturnValue(targetFileCache);

    const lazySingleRouteCacheManager =
      createRouteHandlerLazySingleRouteCacheManager();

    lazySingleRouteCacheManager.writeCachedRoutePlanRecord(
      createPlannerConfig('docs'),
      routePath,
      routePlanRecord,
      'bootstrap-1'
    );

    expect(targetFileCache.reconcile).not.toHaveBeenCalled();

    lazySingleRouteCacheManager.flushAll();

    expect(targetFileCache.reconcile).toHaveBeenCalledTimes(1);
  });

  it('closes retained caches by reconciling and stopping auto-persist without destroying the cache file', () => {
    const firstTargetFileCache = createMockFileEntryCache();
    const secondTargetFileCache = createMockFileEntryCache();

    createFileEntryCacheMock
      .mockReturnValueOnce(firstTargetFileCache)
      .mockReturnValueOnce(secondTargetFileCache);

    const lazySingleRouteCacheManager =
      createRouteHandlerLazySingleRouteCacheManager();

    lazySingleRouteCacheManager.writeCachedRoutePlanRecord(
      createPlannerConfig('docs'),
      routePath,
      routePlanRecord,
      'bootstrap-1'
    );
    lazySingleRouteCacheManager.writeCachedRoutePlanRecord(
      createPlannerConfig('blog'),
      {
        ...routePath,
        filePath: '/app/content/blog/post.mdx'
      },
      routePlanRecord,
      'bootstrap-1'
    );

    lazySingleRouteCacheManager.close();

    expect(firstTargetFileCache.reconcile).toHaveBeenCalledTimes(1);
    expect(secondTargetFileCache.reconcile).toHaveBeenCalledTimes(1);
    expect(firstTargetFileCache.cache.stopAutoPersist).toHaveBeenCalledTimes(1);
    expect(secondTargetFileCache.cache.stopAutoPersist).toHaveBeenCalledTimes(1);
    expect(firstTargetFileCache.cache.destroy).not.toHaveBeenCalled();
    expect(secondTargetFileCache.cache.destroy).not.toHaveBeenCalled();
  });
});
