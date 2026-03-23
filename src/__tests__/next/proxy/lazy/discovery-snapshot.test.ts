import { beforeEach, describe, expect, it, vi } from 'vitest';

const existsSyncMock = vi.hoisted(() => vi.fn());
const computeTargetStaticCacheIdentityMock = vi.hoisted(() => vi.fn());
const readLazySingleRouteCachedPlanRecordMock = vi.hoisted(() => vi.fn());
const resolveRouteHandlerHeavyRewriteDestinationMock = vi.hoisted(() =>
  vi.fn()
);
const removeRouteHandlerLazyOutputAtKnownLocationMock = vi.hoisted(() =>
  vi.fn()
);
const readPersistedRouteHandlerLazyDiscoverySnapshotEntriesMock = vi.hoisted(
  () => vi.fn()
);
const writePersistedRouteHandlerLazyDiscoverySnapshotEntriesMock = vi.hoisted(
  () => vi.fn()
);

vi.mock('../../../../next/cache', () => ({
  computeTargetStaticCacheIdentity: computeTargetStaticCacheIdentityMock
}));

vi.mock('../../../../next/proxy/lazy/single-route-cache', () => ({
  readLazySingleRouteCachedPlanRecord: readLazySingleRouteCachedPlanRecordMock
}));

vi.mock('../../../../next/proxy/lazy/single-route-rewrite', () => ({
  resolveRouteHandlerHeavyRewriteDestination:
    resolveRouteHandlerHeavyRewriteDestinationMock
}));

vi.mock('../../../../next/proxy/lazy/stale-output-cleanup', () => ({
  removeRouteHandlerLazyOutputAtKnownLocation:
    removeRouteHandlerLazyOutputAtKnownLocationMock
}));

vi.mock('../../../../next/proxy/lazy/discovery-snapshot-store', () => ({
  readPersistedRouteHandlerLazyDiscoverySnapshotEntries:
    readPersistedRouteHandlerLazyDiscoverySnapshotEntriesMock,
  writePersistedRouteHandlerLazyDiscoverySnapshotEntries:
    writePersistedRouteHandlerLazyDiscoverySnapshotEntriesMock
}));

vi.mock('node:fs', () => ({
  existsSync: existsSyncMock
}));

import {
  invalidateRouteHandlerLazyDiscoverySnapshot,
  publishRouteHandlerLazyDiscoverySnapshotEntry,
  reconcileRouteHandlerLazyDiscoverySnapshotStartupState,
  readRouteHandlerLazyDiscoverySnapshotRewrite
} from '../../../../next/proxy/lazy/discovery-snapshot';

describe('proxy lazy discovery snapshot', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    readPersistedRouteHandlerLazyDiscoverySnapshotEntriesMock.mockResolvedValue(
      new Map()
    );
    writePersistedRouteHandlerLazyDiscoverySnapshotEntriesMock.mockResolvedValue(
      undefined
    );
    await invalidateRouteHandlerLazyDiscoverySnapshot();
    vi.clearAllMocks();
    readPersistedRouteHandlerLazyDiscoverySnapshotEntriesMock.mockResolvedValue(
      new Map()
    );
    writePersistedRouteHandlerLazyDiscoverySnapshotEntriesMock.mockResolvedValue(
      undefined
    );
    computeTargetStaticCacheIdentityMock.mockResolvedValue('target-identity');
    existsSyncMock.mockReturnValue(true);
    resolveRouteHandlerHeavyRewriteDestinationMock.mockReturnValue(
      '/en/blog/_handlers/application-extensibility'
    );
    removeRouteHandlerLazyOutputAtKnownLocationMock.mockResolvedValue('missing');
  });

  it('reuses a validated published lazy discovery', async () => {
    await publishRouteHandlerLazyDiscoverySnapshotEntry({
      pathname: '/blog/application-extensibility',
      analysisResult: {
        kind: 'heavy',
        source: 'fresh',
        config: {
          targetId: 'blog',
          routeBasePath: '/blog',
          emitFormat: 'ts',
          app: {
            rootDir: '/tmp/app'
          },
          paths: {
            handlersDir: '/tmp/app/pages/blog/_handlers'
          }
        } as never,
        routePath: {
          locale: 'en',
          slugArray: ['application-extensibility'],
          filePath: '/tmp/blog/application-extensibility.mdx'
        },
        plannedHeavyRoute: {
          locale: 'en',
          slugArray: ['application-extensibility'],
          handlerId: 'en-application-extensibility',
          handlerRelativePath: 'application-extensibility/en',
          usedLoadableComponentKeys: ['CustomComponent'],
          factoryVariant: 'none',
          componentEntries: []
        }
      }
    });
    readLazySingleRouteCachedPlanRecordMock.mockReturnValue({
      version: 1,
      plannedHeavyRoute: {
        locale: 'en',
        slugArray: ['application-extensibility'],
        handlerId: 'en-application-extensibility',
        handlerRelativePath: 'application-extensibility/en',
        usedLoadableComponentKeys: ['CustomComponent'],
        factoryVariant: 'none',
        componentEntries: []
      }
    });

    const rewriteDestination = await readRouteHandlerLazyDiscoverySnapshotRewrite(
      {
        pathname: '/blog/application-extensibility',
        routingState: {
          rewriteBySourcePath: new Map(),
          targetRouteBasePaths: ['/blog'],
          resolvedConfigsByTargetId: new Map([
            [
              'blog',
              {
                targetId: 'blog',
                routeBasePath: '/blog',
                app: {
                  rootDir: '/tmp/app'
                }
              } as never
            ]
          ])
        }
      }
    );

    expect(rewriteDestination).toBe('/en/blog/_handlers/application-extensibility');
    expect(computeTargetStaticCacheIdentityMock).toHaveBeenCalledTimes(1);
    expect(readLazySingleRouteCachedPlanRecordMock).toHaveBeenCalledTimes(1);
    expect(resolveRouteHandlerHeavyRewriteDestinationMock).toHaveBeenCalledTimes(
      1
    );
    expect(
      writePersistedRouteHandlerLazyDiscoverySnapshotEntriesMock
    ).toHaveBeenCalledTimes(1);
  });

  it('reuses a persisted lazy discovery after process-local state is gone', async () => {
    readPersistedRouteHandlerLazyDiscoverySnapshotEntriesMock.mockResolvedValue(
      new Map([
        [
          '/blog/application-extensibility',
          {
            version: 1,
            pathname: '/blog/application-extensibility',
            targetId: 'blog',
            routePath: {
              locale: 'en',
              slugArray: ['application-extensibility'],
              filePath: '/tmp/blog/application-extensibility.mdx'
            },
            handlersDir: '/tmp/app/pages/blog/_handlers',
            pageFilePath:
              '/tmp/app/pages/blog/_handlers/application-extensibility/en.tsx'
          }
        ]
      ])
    );
    readLazySingleRouteCachedPlanRecordMock.mockReturnValue({
      version: 1,
      plannedHeavyRoute: {
        locale: 'en',
        slugArray: ['application-extensibility'],
        handlerId: 'en-application-extensibility',
        handlerRelativePath: 'application-extensibility/en',
        usedLoadableComponentKeys: ['CustomComponent'],
        factoryVariant: 'none',
        componentEntries: []
      }
    });

    const rewriteDestination = await readRouteHandlerLazyDiscoverySnapshotRewrite(
      {
        pathname: '/blog/application-extensibility',
        routingState: {
          rewriteBySourcePath: new Map(),
          targetRouteBasePaths: ['/blog'],
          resolvedConfigsByTargetId: new Map([
            [
              'blog',
              {
                targetId: 'blog',
                routeBasePath: '/blog',
                app: {
                  rootDir: '/tmp/app'
                }
              } as never
            ]
          ])
        }
      }
    );

    expect(rewriteDestination).toBe('/en/blog/_handlers/application-extensibility');
    expect(
      readPersistedRouteHandlerLazyDiscoverySnapshotEntriesMock
    ).toHaveBeenCalledTimes(1);
  });

  it('drops a persisted discovery when the one-file lazy cache can no longer be reused', async () => {
    readPersistedRouteHandlerLazyDiscoverySnapshotEntriesMock.mockResolvedValue(
      new Map([
        [
          '/blog/application-extensibility',
          {
            version: 1,
            pathname: '/blog/application-extensibility',
            targetId: 'blog',
            routePath: {
              locale: 'en',
              slugArray: ['application-extensibility'],
              filePath: '/tmp/blog/application-extensibility.mdx'
            },
            handlersDir: '/tmp/app/pages/blog/_handlers',
            pageFilePath:
              '/tmp/app/pages/blog/_handlers/application-extensibility/en.tsx'
          }
        ]
      ])
    );
    readLazySingleRouteCachedPlanRecordMock.mockReturnValue(null);

    const firstRead = await readRouteHandlerLazyDiscoverySnapshotRewrite({
      pathname: '/blog/application-extensibility',
      routingState: {
        rewriteBySourcePath: new Map(),
        targetRouteBasePaths: ['/blog'],
        resolvedConfigsByTargetId: new Map([
          [
            'blog',
            {
              targetId: 'blog',
              routeBasePath: '/blog',
              app: {
                rootDir: '/tmp/app'
              }
            } as never
          ]
        ])
      }
    });
    const secondRead = await readRouteHandlerLazyDiscoverySnapshotRewrite({
      pathname: '/blog/application-extensibility',
      routingState: {
        rewriteBySourcePath: new Map(),
        targetRouteBasePaths: ['/blog'],
        resolvedConfigsByTargetId: new Map([
          [
            'blog',
            {
              targetId: 'blog',
              routeBasePath: '/blog',
              app: {
                rootDir: '/tmp/app'
              }
            } as never
          ]
        ])
      }
    });

    expect(firstRead).toBeNull();
    expect(secondRead).toBeNull();
    expect(
      readPersistedRouteHandlerLazyDiscoverySnapshotEntriesMock
    ).toHaveBeenCalledTimes(1);
    expect(computeTargetStaticCacheIdentityMock).toHaveBeenCalledTimes(1);
    expect(readLazySingleRouteCachedPlanRecordMock).toHaveBeenCalledTimes(1);
    expect(removeRouteHandlerLazyOutputAtKnownLocationMock).toHaveBeenCalledTimes(
      1
    );
    expect(
      writePersistedRouteHandlerLazyDiscoverySnapshotEntriesMock
    ).toHaveBeenCalledTimes(1);
  });

  it('drops the snapshot entry when the owning target is no longer present', async () => {
    await publishRouteHandlerLazyDiscoverySnapshotEntry({
      pathname: '/blog/application-extensibility',
      analysisResult: {
        kind: 'heavy',
        source: 'fresh',
        config: {
          targetId: 'blog',
          routeBasePath: '/blog',
          emitFormat: 'ts',
          app: {
            rootDir: '/tmp/app'
          },
          paths: {
            handlersDir: '/tmp/app/pages/blog/_handlers'
          }
        } as never,
        routePath: {
          locale: 'en',
          slugArray: ['application-extensibility'],
          filePath: '/tmp/blog/application-extensibility.mdx'
        },
        plannedHeavyRoute: {
          locale: 'en',
          slugArray: ['application-extensibility'],
          handlerId: 'en-application-extensibility',
          handlerRelativePath: 'application-extensibility/en',
          usedLoadableComponentKeys: ['CustomComponent'],
          factoryVariant: 'none',
          componentEntries: []
        }
      }
    });

    const firstRead = await readRouteHandlerLazyDiscoverySnapshotRewrite({
      pathname: '/blog/application-extensibility',
      routingState: {
        rewriteBySourcePath: new Map(),
        targetRouteBasePaths: ['/blog'],
        resolvedConfigsByTargetId: new Map()
      }
    });
    const secondRead = await readRouteHandlerLazyDiscoverySnapshotRewrite({
      pathname: '/blog/application-extensibility',
      routingState: {
        rewriteBySourcePath: new Map(),
        targetRouteBasePaths: ['/blog'],
        resolvedConfigsByTargetId: new Map()
      }
    });

    expect(firstRead).toBeNull();
    expect(secondRead).toBeNull();
    expect(computeTargetStaticCacheIdentityMock).not.toHaveBeenCalled();
    expect(readLazySingleRouteCachedPlanRecordMock).not.toHaveBeenCalled();
    expect(removeRouteHandlerLazyOutputAtKnownLocationMock).toHaveBeenCalledTimes(
      1
    );
  });

  it('drops the snapshot entry when the lazy cache no longer reports a heavy route', async () => {
    await publishRouteHandlerLazyDiscoverySnapshotEntry({
      pathname: '/blog/application-extensibility',
      analysisResult: {
        kind: 'heavy',
        source: 'fresh',
        config: {
          targetId: 'blog',
          routeBasePath: '/blog',
          emitFormat: 'ts',
          app: {
            rootDir: '/tmp/app'
          },
          paths: {
            handlersDir: '/tmp/app/pages/blog/_handlers'
          }
        } as never,
        routePath: {
          locale: 'en',
          slugArray: ['application-extensibility'],
          filePath: '/tmp/blog/application-extensibility.mdx'
        },
        plannedHeavyRoute: {
          locale: 'en',
          slugArray: ['application-extensibility'],
          handlerId: 'en-application-extensibility',
          handlerRelativePath: 'application-extensibility/en',
          usedLoadableComponentKeys: ['CustomComponent'],
          factoryVariant: 'none',
          componentEntries: []
        }
      }
    });
    readLazySingleRouteCachedPlanRecordMock.mockReturnValue({
      version: 1,
      plannedHeavyRoute: null
    });

    const firstRead = await readRouteHandlerLazyDiscoverySnapshotRewrite({
      pathname: '/blog/application-extensibility',
      routingState: {
        rewriteBySourcePath: new Map(),
        targetRouteBasePaths: ['/blog'],
        resolvedConfigsByTargetId: new Map([
          [
              'blog',
              {
                targetId: 'blog',
                routeBasePath: '/blog',
                app: {
                  rootDir: '/tmp/app'
                }
              } as never
            ]
          ])
      }
    });
    const secondRead = await readRouteHandlerLazyDiscoverySnapshotRewrite({
      pathname: '/blog/application-extensibility',
      routingState: {
        rewriteBySourcePath: new Map(),
        targetRouteBasePaths: ['/blog'],
        resolvedConfigsByTargetId: new Map([
          [
              'blog',
              {
                targetId: 'blog',
                routeBasePath: '/blog',
                app: {
                  rootDir: '/tmp/app'
                }
              } as never
            ]
          ])
      }
    });

    expect(firstRead).toBeNull();
    expect(secondRead).toBeNull();
    expect(readLazySingleRouteCachedPlanRecordMock).toHaveBeenCalledTimes(1);
    expect(removeRouteHandlerLazyOutputAtKnownLocationMock).toHaveBeenCalledTimes(
      1
    );
  });

  it('reconciles persisted startup state and removes orphaned outputs for vanished targets', async () => {
    readPersistedRouteHandlerLazyDiscoverySnapshotEntriesMock.mockResolvedValue(
      new Map([
        [
          '/blog/application-extensibility',
          {
            version: 1,
            pathname: '/blog/application-extensibility',
            targetId: 'blog',
            routePath: {
              locale: 'en',
              slugArray: ['application-extensibility'],
              filePath: '/tmp/blog/application-extensibility.mdx'
            },
            handlersDir: '/tmp/app/pages/blog/_handlers',
            pageFilePath:
              '/tmp/app/pages/blog/_handlers/application-extensibility/en.tsx'
          }
        ]
      ])
    );

    await reconcileRouteHandlerLazyDiscoverySnapshotStartupState({
      resolvedConfigs: [
        {
          targetId: 'docs',
          app: {
            rootDir: '/tmp/app'
          },
          paths: {
            handlersDir: '/tmp/app/pages/docs/_handlers'
          }
        } as never
      ]
    });

    expect(removeRouteHandlerLazyOutputAtKnownLocationMock).toHaveBeenCalledTimes(
      1
    );
    expect(
      writePersistedRouteHandlerLazyDiscoverySnapshotEntriesMock
    ).toHaveBeenCalledTimes(1);
  });
});
