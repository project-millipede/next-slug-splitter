import { beforeEach, describe, expect, it, vi } from 'vitest';

const createFileEntryCacheMock = vi.hoisted(() => vi.fn());

vi.mock('file-entry-cache', () => ({
  default: {
    create: createFileEntryCacheMock,
    createFromFile: vi.fn()
  }
}));

import { createRouteHandlerLazySingleRouteCacheManager } from '../../../../next/proxy/lazy/single-route-cache-manager';

import type { RouteHandlerLazyPagesPlannerConfig } from '../../../../next/proxy/lazy/types';

type MockFileDescriptor = {
  changed: boolean;
  meta: {
    data?: unknown;
  };
  notFound: boolean;
};

type MockFileEntryCache = {
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
    changed: false,
    meta: {},
    notFound: false
  };

  return {
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
const createPlannerConfig = (
  targetId: string
): RouteHandlerLazyPagesPlannerConfig =>
  ({
    routerKind: 'pages',
    targetId,
    emitFormat: 'ts',
    contentLocaleMode: 'filename',
    handlerRouteParam: {
      name: 'slug',
      kind: 'catch-all'
    },
    routeBasePath: '/docs',
    processorConfig: {
      processorImport: {
        kind: 'package',
        specifier: '@test/processor'
      }
    },
    baseStaticPropsImport: {
      kind: 'package',
      specifier: '@test/base-static-props'
    },
    runtime: {
      mdxCompileOptions: {}
    },
    localeConfig: {
      locales: ['en'],
      defaultLocale: 'en'
    },
    paths: {
      rootDir: '/app',
      contentDir: '/app/content',
      generatedDir: '/app/pages/docs/generated-handlers'
    }
  }) satisfies RouteHandlerLazyPagesPlannerConfig;

const routePath = {
  filePath: '/app/content/post.mdx',
  locale: 'en',
  slugArray: ['post']
};
const routeCaptureRecord = {
  version: 5,
  usedLoadableComponentKeys: [],
  transitiveModulePaths: []
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

    lazySingleRouteCacheManager.writeCachedRouteCaptureRecord(
      plannerConfig,
      routePath,
      routeCaptureRecord
    );
    expect(
      lazySingleRouteCacheManager.readCachedRouteCaptureRecord(
        plannerConfig,
        routePath
      )
    ).toEqual(routeCaptureRecord);

    expect(createFileEntryCacheMock).toHaveBeenCalledTimes(1);
    expect(firstTargetFileCache.cache.persistInterval).toBe(5000);
    expect(firstTargetFileCache.cache.startAutoPersist).toHaveBeenCalledTimes(
      1
    );
  });

  it('does not reconcile on write and flushes all retained caches on flushAll', () => {
    const targetFileCache = createMockFileEntryCache();

    createFileEntryCacheMock.mockReturnValue(targetFileCache);

    const lazySingleRouteCacheManager =
      createRouteHandlerLazySingleRouteCacheManager();

    lazySingleRouteCacheManager.writeCachedRouteCaptureRecord(
      createPlannerConfig('docs'),
      routePath,
      routeCaptureRecord
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

    lazySingleRouteCacheManager.writeCachedRouteCaptureRecord(
      createPlannerConfig('docs'),
      routePath,
      routeCaptureRecord
    );
    lazySingleRouteCacheManager.writeCachedRouteCaptureRecord(
      createPlannerConfig('blog'),
      {
        ...routePath,
        filePath: '/app/content/blog/post.mdx'
      },
      routeCaptureRecord
    );

    lazySingleRouteCacheManager.close();

    expect(firstTargetFileCache.reconcile).toHaveBeenCalledTimes(1);
    expect(secondTargetFileCache.reconcile).toHaveBeenCalledTimes(1);
    expect(firstTargetFileCache.cache.stopAutoPersist).toHaveBeenCalledTimes(1);
    expect(secondTargetFileCache.cache.stopAutoPersist).toHaveBeenCalledTimes(
      1
    );
    expect(firstTargetFileCache.cache.destroy).not.toHaveBeenCalled();
    expect(secondTargetFileCache.cache.destroy).not.toHaveBeenCalled();
  });

  it('returns null when a persisted transitive module path changes', () => {
    const targetFileCache = createMockFileEntryCache();
    const changedTransitiveDescriptor: MockFileDescriptor = {
      changed: true,
      meta: {},
      notFound: false
    };

    targetFileCache.getFileDescriptor = vi.fn((filePath: string) => {
      if (filePath === '/app/content/shared/fragment.mdx') {
        return changedTransitiveDescriptor;
      }

      return targetFileCache.descriptor;
    });
    createFileEntryCacheMock.mockReturnValue(targetFileCache);

    const lazySingleRouteCacheManager =
      createRouteHandlerLazySingleRouteCacheManager();
    const plannerConfig = createPlannerConfig('docs');

    lazySingleRouteCacheManager.writeCachedRouteCaptureRecord(
      plannerConfig,
      routePath,
      {
        ...routeCaptureRecord,
        usedLoadableComponentKeys: ['CustomComponent'],
        transitiveModulePaths: ['/app/content/shared/fragment.mdx']
      }
    );

    expect(
      lazySingleRouteCacheManager.readCachedRouteCaptureRecord(
        plannerConfig,
        routePath
      )
    ).toBeNull();
  });
});
