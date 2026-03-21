import { beforeEach, describe, expect, it, vi } from 'vitest';

const analyzeRouteHandlerLazyMatchedRouteMock = vi.hoisted(() => vi.fn());
const emitRouteHandlerLazySingleHandlerMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../next/proxy/lazy/single-route-analysis', () => ({
  analyzeRouteHandlerLazyMatchedRoute: analyzeRouteHandlerLazyMatchedRouteMock
}));

vi.mock('../../../../next/proxy/lazy/single-handler-emission', () => ({
  emitRouteHandlerLazySingleHandler: emitRouteHandlerLazySingleHandlerMock
}));

import { prepareRouteHandlerLazyMatchedRoute } from '../../../../next/proxy/lazy/cold-request-dedupe';

describe('proxy lazy cold-request dedupe', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deduplicates concurrent preparation of the same matched route file', async () => {
    let resolveAnalysis!: (value: {
      kind: 'heavy';
      source: 'fresh';
      config: {
        routeBasePath: '/blog';
      };
      routePath: {
        locale: 'en';
        slugArray: ['post'];
        filePath: '/tmp/app/blog/src/pages/post.mdx';
      };
      plannedHeavyRoute: {
        locale: 'en';
        slugArray: ['post'];
        handlerId: 'en-post';
        handlerRelativePath: 'post/en';
        usedLoadableComponentKeys: ['CustomComponent'];
        factoryVariant: 'none';
        componentEntries: [];
      };
    }) => void;

    const analysisPromise = new Promise<any>(resolve => {
      resolveAnalysis = resolve;
    });

    analyzeRouteHandlerLazyMatchedRouteMock.mockReturnValue(analysisPromise);
    emitRouteHandlerLazySingleHandlerMock.mockResolvedValue({
      status: 'written',
      renderedPage: {
        relativePath: 'post/en.tsx',
        pageFilePath: '/tmp/app/pages/blog/_handlers/post/en.tsx',
        pageSource: '// emitted',
        outputHash: 'hash'
      }
    });

    const resolution = {
      kind: 'matched-route-file' as const,
      pathname: '/blog/post',
      config: {
        targetId: 'blog',
        routeBasePath: '/blog',
        contentLocaleMode: 'default-locale' as const,
        emitFormat: 'ts' as const,
        localeConfig: {
          locales: ['en'],
          defaultLocale: 'en'
        },
        paths: {
          contentPagesDir: '/tmp/app/blog/src/pages',
          handlersDir: '/tmp/app/pages/blog/_handlers'
        }
      },
      identity: {
        pathname: '/blog/post',
        locale: 'en',
        slugArray: ['post']
      },
      routePath: {
        locale: 'en',
        slugArray: ['post'],
        filePath: '/tmp/app/blog/src/pages/post.mdx'
      }
    };

    const firstPromise = prepareRouteHandlerLazyMatchedRoute({
      resolution
    });
    const secondPromise = prepareRouteHandlerLazyMatchedRoute({
      resolution
    });

    expect(analyzeRouteHandlerLazyMatchedRouteMock).toHaveBeenCalledTimes(1);
    expect(emitRouteHandlerLazySingleHandlerMock).not.toHaveBeenCalled();

    resolveAnalysis({
      kind: 'heavy',
      source: 'fresh',
      config: {
        routeBasePath: '/blog'
      },
      routePath: {
        locale: 'en',
        slugArray: ['post'],
        filePath: '/tmp/app/blog/src/pages/post.mdx'
      },
      plannedHeavyRoute: {
        locale: 'en',
        slugArray: ['post'],
        handlerId: 'en-post',
        handlerRelativePath: 'post/en',
        usedLoadableComponentKeys: ['CustomComponent'],
        factoryVariant: 'none',
        componentEntries: []
      }
    });

    const [firstResult, secondResult] = await Promise.all([
      firstPromise,
      secondPromise
    ]);

    expect(firstResult).toEqual({
      kind: 'heavy',
      analysisResult: {
        kind: 'heavy',
        source: 'fresh',
        config: {
          routeBasePath: '/blog'
        },
        routePath: {
          locale: 'en',
          slugArray: ['post'],
          filePath: '/tmp/app/blog/src/pages/post.mdx'
        },
        plannedHeavyRoute: {
          locale: 'en',
          slugArray: ['post'],
          handlerId: 'en-post',
          handlerRelativePath: 'post/en',
          usedLoadableComponentKeys: ['CustomComponent'],
          factoryVariant: 'none',
          componentEntries: []
        }
      }
    });
    expect(secondResult).toEqual(firstResult);
    expect(emitRouteHandlerLazySingleHandlerMock).toHaveBeenCalledTimes(1);
  });

  it('does not emit when the shared one-file analysis result is light', async () => {
    analyzeRouteHandlerLazyMatchedRouteMock.mockResolvedValue({
      kind: 'light',
      source: 'fresh',
      config: {
        routeBasePath: '/docs'
      },
      routePath: {
        locale: 'en',
        slugArray: ['guide'],
        filePath: '/tmp/app/docs/src/pages/guide.mdx'
      }
    });

    const result = await prepareRouteHandlerLazyMatchedRoute({
      resolution: {
        kind: 'matched-route-file',
        pathname: '/docs/guide',
        config: {
          targetId: 'docs',
          routeBasePath: '/docs',
          contentLocaleMode: 'default-locale',
          emitFormat: 'ts',
          localeConfig: {
            locales: ['en'],
            defaultLocale: 'en'
          },
          paths: {
            contentPagesDir: '/tmp/app/docs/src/pages',
            handlersDir: '/tmp/app/pages/docs/_handlers'
          }
        },
        identity: {
          pathname: '/docs/guide',
          locale: 'en',
          slugArray: ['guide']
        },
        routePath: {
          locale: 'en',
          slugArray: ['guide'],
          filePath: '/tmp/app/docs/src/pages/guide.mdx'
        }
      }
    });

    expect(result).toEqual({
      kind: 'light',
      analysisResult: {
        kind: 'light',
        source: 'fresh',
        config: {
          routeBasePath: '/docs'
        },
        routePath: {
          locale: 'en',
          slugArray: ['guide'],
          filePath: '/tmp/app/docs/src/pages/guide.mdx'
        }
      }
    });
    expect(emitRouteHandlerLazySingleHandlerMock).not.toHaveBeenCalled();
  });

  it('deduplicates concurrent localized pathnames that resolve to the same target and source file', async () => {
    let resolveAnalysis!: (value: {
      kind: 'heavy';
      source: 'fresh';
      config: {
        routeBasePath: '/blog';
      };
      routePath: {
        locale: 'en';
        slugArray: ['post'];
        filePath: '/tmp/app/blog/src/pages/post.mdx';
      };
      plannedHeavyRoute: {
        locale: 'en';
        slugArray: ['post'];
        handlerId: 'en-post';
        handlerRelativePath: 'post/en';
        usedLoadableComponentKeys: ['CustomComponent'];
        factoryVariant: 'none';
        componentEntries: [];
      };
    }) => void;

    const analysisPromise = new Promise<any>(resolve => {
      resolveAnalysis = resolve;
    });

    analyzeRouteHandlerLazyMatchedRouteMock.mockReturnValue(analysisPromise);
    emitRouteHandlerLazySingleHandlerMock.mockResolvedValue({
      status: 'written',
      renderedPage: {
        relativePath: 'post/en.tsx',
        pageFilePath: '/tmp/app/pages/blog/_handlers/post/en.tsx',
        pageSource: '// emitted',
        outputHash: 'hash'
      }
    });

    const sharedResolutionShape = {
      kind: 'matched-route-file' as const,
      config: {
        targetId: 'blog',
        routeBasePath: '/blog',
        contentLocaleMode: 'default-locale' as const,
        emitFormat: 'ts' as const,
        localeConfig: {
          locales: ['en', 'de'],
          defaultLocale: 'en'
        },
        paths: {
          contentPagesDir: '/tmp/app/blog/src/pages',
          handlersDir: '/tmp/app/pages/blog/_handlers'
        }
      },
      routePath: {
        locale: 'en' as const,
        slugArray: ['post'],
        filePath: '/tmp/app/blog/src/pages/post.mdx'
      }
    };

    const firstPromise = prepareRouteHandlerLazyMatchedRoute({
      resolution: {
        ...sharedResolutionShape,
        pathname: '/blog/post',
        identity: {
          pathname: '/blog/post',
          locale: 'en',
          slugArray: ['post']
        }
      }
    });
    const secondPromise = prepareRouteHandlerLazyMatchedRoute({
      resolution: {
        ...sharedResolutionShape,
        pathname: '/en/blog/post',
        identity: {
          pathname: '/en/blog/post',
          locale: 'en',
          slugArray: ['post']
        }
      }
    });

    expect(analyzeRouteHandlerLazyMatchedRouteMock).toHaveBeenCalledTimes(1);

    resolveAnalysis({
      kind: 'heavy',
      source: 'fresh',
      config: {
        routeBasePath: '/blog'
      },
      routePath: {
        locale: 'en',
        slugArray: ['post'],
        filePath: '/tmp/app/blog/src/pages/post.mdx'
      },
      plannedHeavyRoute: {
        locale: 'en',
        slugArray: ['post'],
        handlerId: 'en-post',
        handlerRelativePath: 'post/en',
        usedLoadableComponentKeys: ['CustomComponent'],
        factoryVariant: 'none',
        componentEntries: []
      }
    });

    const [firstResult, secondResult] = await Promise.all([
      firstPromise,
      secondPromise
    ]);

    expect(firstResult).toEqual({
      kind: 'heavy',
      analysisResult: {
        kind: 'heavy',
        source: 'fresh',
        config: {
          routeBasePath: '/blog'
        },
        routePath: {
          locale: 'en',
          slugArray: ['post'],
          filePath: '/tmp/app/blog/src/pages/post.mdx'
        },
        plannedHeavyRoute: {
          locale: 'en',
          slugArray: ['post'],
          handlerId: 'en-post',
          handlerRelativePath: 'post/en',
          usedLoadableComponentKeys: ['CustomComponent'],
          factoryVariant: 'none',
          componentEntries: []
        }
      }
    });
    expect(secondResult).toEqual(firstResult);
    expect(emitRouteHandlerLazySingleHandlerMock).toHaveBeenCalledTimes(1);
  });
});
