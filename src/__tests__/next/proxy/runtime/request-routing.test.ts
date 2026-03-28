import { beforeEach, describe, expect, it, test, vi } from 'vitest';
import { NextResponse } from 'next/server.js';

vi.mock(import('../../../../next/proxy/runtime/routing-state'), () => ({
  getRouteHandlerProxyRoutingState: vi.fn()
}));

vi.mock(import('../../../../next/proxy/worker/client'), () => ({
  resolveRouteHandlerProxyLazyMissWithWorker: vi.fn()
}));

import * as proxyRoutingState from '../../../../next/proxy/runtime/routing-state';
import * as proxyWorkerClient from '../../../../next/proxy/worker/client';
import { handleRouteHandlerProxyRequest } from '../../../../next/proxy/runtime/request-routing';

import type {
  RouteHandlerProxyRoutingState
} from '../../../../next/proxy/runtime/types';
import type { NextRequest } from 'next/server.js';
import type {
  RouteHandlerProxyWorkerResponse
} from '../../../../next/proxy/worker/types';

const createProxyRequest = (
  url: string,
  options: {
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
    nextUrlPathname?: string;
  } = {}
): NextRequest =>
  ({
    url,
    headers: new Headers(options.headers),
    nextUrl: Object.assign(new URL(url), {
      pathname: options.nextUrlPathname ?? new URL(url).pathname
    }),
    cookies: {
      get: (name: string) => {
        const value = options.cookies?.[name];

        return value == null ? undefined : { name, value };
      }
    }
  }) as NextRequest;

const createRoutingState = ({
  rewrites = [],
  targetRouteBasePaths = [],
  hasConfiguredTargets = true,
  bootstrapGenerationToken = 'bootstrap-1'
}: {
  rewrites?: Array<[string, string]>;
  targetRouteBasePaths?: Array<string>;
  hasConfiguredTargets?: boolean;
  bootstrapGenerationToken?: string;
} = {}): RouteHandlerProxyRoutingState => ({
  rewriteBySourcePath: new Map(rewrites),
  targetRouteBasePaths,
  hasConfiguredTargets,
  bootstrapGenerationToken
});

describe('proxy request routing', () => {
  const getRouteHandlerProxyRoutingStateMock = vi.mocked(
    proxyRoutingState.getRouteHandlerProxyRoutingState
  );
  const resolveRouteHandlerProxyLazyMissWithWorkerMock = vi.mocked(
    proxyWorkerClient.resolveRouteHandlerProxyLazyMissWithWorker
  );

  beforeEach(() => {
    getRouteHandlerProxyRoutingStateMock.mockReset();
    resolveRouteHandlerProxyLazyMissWithWorkerMock.mockReset();
    resolveRouteHandlerProxyLazyMissWithWorkerMock.mockResolvedValue({
      kind: 'pass-through',
      reason: 'no-target'
    });
  });

  it('passes through when the routing state has no heavy-route rewrite for the pathname', async () => {
    getRouteHandlerProxyRoutingStateMock.mockResolvedValue(
      createRoutingState({
        targetRouteBasePaths: ['/docs']
      })
    );

    const response = await handleRouteHandlerProxyRequest({
      request: createProxyRequest('https://example.com/docs/getting-started'),
      options: {
        localeConfig: {
          locales: ['en'],
          defaultLocale: 'en'
        }
      }
    });

    expect(response.headers.get('x-next-slug-splitter-synthetic-proxy')).toBe(
      'pass-through'
    );
    expect(
      response.headers.get('x-next-slug-splitter-synthetic-proxy-target')
    ).toBe('/docs');
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(resolveRouteHandlerProxyLazyMissWithWorkerMock).toHaveBeenCalledWith({
      pathname: '/docs/getting-started',
      localeConfig: {
        locales: ['en'],
        defaultLocale: 'en'
      },
      bootstrapGenerationToken: 'bootstrap-1',
      configRegistration: {}
    });
  });

  it('falls back to the worker-only path when the thin Proxy runtime cannot load routing state in-process', async () => {
    getRouteHandlerProxyRoutingStateMock.mockRejectedValue(
      new Error('Cannot find module as expression is too dynamic')
    );
    resolveRouteHandlerProxyLazyMissWithWorkerMock.mockResolvedValue({
      kind: 'heavy',
      source: 'fresh',
      rewriteDestination: '/en/docs/_handlers/getting-started/en',
      routeBasePath: '/docs'
    });

    const response = await handleRouteHandlerProxyRequest({
      request: createProxyRequest('https://example.com/docs/getting-started'),
      options: {
        localeConfig: {
          locales: ['en'],
          defaultLocale: 'en'
        }
      }
    });

    expect(resolveRouteHandlerProxyLazyMissWithWorkerMock).toHaveBeenCalledWith({
      pathname: '/docs/getting-started',
      localeConfig: {
        locales: ['en'],
        defaultLocale: 'en'
      },
      bootstrapGenerationToken: 'route-handler-proxy-worker-only-fallback',
      configRegistration: {}
    });
    expect(response.headers.get('x-next-slug-splitter-synthetic-proxy')).toBe(
      'rewrite'
    );
    expect(
      response.headers.get('x-next-slug-splitter-synthetic-proxy-target')
    ).toBe('/docs');
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://example.com/en/docs/_handlers/getting-started/en'
    );
  });

  describe('routing-state rewrites', () => {
    type Scenario = {
      id: string;
      description: string;
      requestUrl: string;
      headers?: Record<string, string>;
      localeConfig: {
        locales: Array<string>;
        defaultLocale: string;
      };
      rewrites: Array<[string, string]>;
      targetRouteBasePaths: Array<string>;
      expectedTarget: string;
      expectedRewrite: string;
    };

    const scenarios: ReadonlyArray<Scenario> = [
      {
        id: 'State-Rewrite',
        description: 'rewrites when the routing state marks the pathname as heavy',
        requestUrl: 'https://example.com/blog/application-extensibility?view=full',
        localeConfig: {
          locales: ['en'],
          defaultLocale: 'en'
        },
        rewrites: [
          [
            '/blog/application-extensibility',
            '/en/blog/_handlers/application-extensibility'
          ]
        ],
        targetRouteBasePaths: ['/blog'],
        expectedTarget: '/blog',
        expectedRewrite:
          'https://example.com/en/blog/_handlers/application-extensibility?view=full'
      },
      {
        id: 'State-Data-Rewrite',
        description: 'rewrites a header-marked data request even when Proxy receives a page-shaped localized URL',
        requestUrl:
          'https://example.com/de/docs/ai/reverse?slug=ai&slug=reverse',
        headers: {
          'x-nextjs-data': '1'
        },
        localeConfig: {
          locales: ['en', 'de'],
          defaultLocale: 'en'
        },
        rewrites: [
          ['/de/docs/ai/reverse', '/de/docs/_handlers/ai/reverse/de']
        ],
        targetRouteBasePaths: ['/docs'],
        expectedTarget: '/docs',
        expectedRewrite:
          'https://example.com/de/docs/_handlers/ai/reverse/de?slug=ai&slug=reverse'
      }
    ];

    test.for(scenarios)('[$id] $description', async ({
      requestUrl,
      headers,
      localeConfig,
      rewrites,
      targetRouteBasePaths,
      expectedTarget,
      expectedRewrite
    }) => {
      getRouteHandlerProxyRoutingStateMock.mockResolvedValue(
        createRoutingState({
          rewrites,
          targetRouteBasePaths
        })
      );

      const response = await handleRouteHandlerProxyRequest({
        request: createProxyRequest(requestUrl, {
          headers
        }),
        options: {
          localeConfig
        }
      });

      expect(response.headers.get('x-next-slug-splitter-synthetic-proxy')).toBe(
        'rewrite'
      );
      expect(
        response.headers.get('x-next-slug-splitter-synthetic-proxy-target')
      ).toBe(expectedTarget);
      expect(response.headers.get('x-middleware-rewrite')).toBe(expectedRewrite);
      expect(resolveRouteHandlerProxyLazyMissWithWorkerMock).not.toHaveBeenCalled();
    });
  });

  describe('worker outcomes', () => {
    type Scenario = {
      id: string;
      description: string;
      requestUrl: string;
      headers?: Record<string, string>;
      localeConfig: {
        locales: Array<string>;
        defaultLocale: string;
      };
      targetRouteBasePaths: Array<string>;
      workerResult: RouteHandlerProxyWorkerResponse;
      expectedMode: 'rewrite' | 'pass-through';
      expectedTarget?: string;
      expectedRewrite: string | null;
        expectedWorkerArgs: {
          pathname: string;
          localeConfig: {
            locales: Array<string>;
            defaultLocale: string;
          };
          bootstrapGenerationToken: string;
          configRegistration: Record<string, never>;
        };
    };

    const scenarios: ReadonlyArray<Scenario> = [
      {
        id: 'Discovery-Rewrite',
        description: 'rewrites from a worker-side discovered heavy route before re-entering the cold path again',
        requestUrl: 'https://example.com/blog/application-extensibility?view=full',
        localeConfig: {
          locales: ['en'],
          defaultLocale: 'en'
        },
        targetRouteBasePaths: ['/blog'],
        workerResult: {
          kind: 'heavy',
          source: 'discovery',
          rewriteDestination: '/en/blog/_handlers/application-extensibility',
          routeBasePath: '/blog'
        },
        expectedMode: 'rewrite',
        expectedTarget: '/blog',
        expectedRewrite:
          'https://example.com/en/blog/_handlers/application-extensibility?view=full',
        expectedWorkerArgs: {
          pathname: '/blog/application-extensibility',
          localeConfig: {
            locales: ['en'],
            defaultLocale: 'en'
          },
          bootstrapGenerationToken: 'bootstrap-1',
          configRegistration: {}
        }
      },
      {
        id: 'Fresh-Rewrite',
        description: 'rewrites immediately when a cold heavy request had to write a brand-new handler file',
        requestUrl: 'https://example.com/blog/application-extensibility?view=full',
        localeConfig: {
          locales: ['en'],
          defaultLocale: 'en'
        },
        targetRouteBasePaths: ['/blog'],
        workerResult: {
          kind: 'heavy',
          source: 'fresh',
          rewriteDestination: '/en/blog/_handlers/application-extensibility',
          routeBasePath: '/blog'
        },
        expectedMode: 'rewrite',
        expectedTarget: '/blog',
        expectedRewrite:
          'https://example.com/en/blog/_handlers/application-extensibility?view=full',
        expectedWorkerArgs: {
          pathname: '/blog/application-extensibility',
          localeConfig: {
            locales: ['en'],
            defaultLocale: 'en'
          },
          bootstrapGenerationToken: 'bootstrap-1',
          configRegistration: {}
        }
      },
      {
        id: 'Cache-Rewrite',
        description: 'still rewrites immediately when the heavy handler was already present before the request',
        requestUrl: 'https://example.com/blog/application-extensibility?view=full',
        localeConfig: {
          locales: ['en'],
          defaultLocale: 'en'
        },
        targetRouteBasePaths: ['/blog'],
        workerResult: {
          kind: 'heavy',
          source: 'cache',
          rewriteDestination: '/en/blog/_handlers/application-extensibility',
          routeBasePath: '/blog'
        },
        expectedMode: 'rewrite',
        expectedTarget: '/blog',
        expectedRewrite:
          'https://example.com/en/blog/_handlers/application-extensibility?view=full',
        expectedWorkerArgs: {
          pathname: '/blog/application-extensibility',
          localeConfig: {
            locales: ['en'],
            defaultLocale: 'en'
          },
          bootstrapGenerationToken: 'bootstrap-1',
          configRegistration: {}
        }
      },
      {
        id: 'Light-Pass-Through',
        description: 'removes stale lazy output when a matched route is now light',
        requestUrl: 'https://example.com/blog/application-extensibility',
        localeConfig: {
          locales: ['en'],
          defaultLocale: 'en'
        },
        targetRouteBasePaths: ['/blog'],
        workerResult: {
          kind: 'pass-through',
          reason: 'light'
        },
        expectedMode: 'pass-through',
        expectedTarget: '/blog',
        expectedRewrite: null,
        expectedWorkerArgs: {
          pathname: '/blog/application-extensibility',
          localeConfig: {
            locales: ['en'],
            defaultLocale: 'en'
          },
          bootstrapGenerationToken: 'bootstrap-1',
          configRegistration: {}
        }
      },
      {
        id: 'Missing-Route-File',
        description: 'removes stale lazy output when the pathname still belongs to a target but the route file is missing',
        requestUrl: 'https://example.com/docs/missing-page',
        localeConfig: {
          locales: ['en'],
          defaultLocale: 'en'
        },
        targetRouteBasePaths: ['/docs'],
        workerResult: {
          kind: 'pass-through',
          reason: 'missing-route-file'
        },
        expectedMode: 'pass-through',
        expectedTarget: '/docs',
        expectedRewrite: null,
        expectedWorkerArgs: {
          pathname: '/docs/missing-page',
          localeConfig: {
            locales: ['en'],
            defaultLocale: 'en'
          },
          bootstrapGenerationToken: 'bootstrap-1',
          configRegistration: {}
        }
      },
      {
        id: 'Missing-Rewrite',
        description: 'falls through without publishing a lazy discovery when one-file heavy analysis cannot resolve a rewrite destination',
        requestUrl: 'https://example.com/blog/application-extensibility',
        localeConfig: {
          locales: ['en'],
          defaultLocale: 'en'
        },
        targetRouteBasePaths: ['/blog'],
        workerResult: {
          kind: 'pass-through',
          reason: 'missing-rewrite-destination'
        },
        expectedMode: 'pass-through',
        expectedTarget: '/blog',
        expectedRewrite: null,
        expectedWorkerArgs: {
          pathname: '/blog/application-extensibility',
          localeConfig: {
            locales: ['en'],
            defaultLocale: 'en'
          },
          bootstrapGenerationToken: 'bootstrap-1',
          configRegistration: {}
        }
      },
      {
        id: 'Fresh-Page-Rewrite',
        description: 'rewrites immediately for a cold heavy page request',
        requestUrl:
          'https://example.com/en/docs/ai/reverse/hooks?slug=ai&slug=reverse&slug=hooks',
        localeConfig: {
          locales: ['en', 'de'],
          defaultLocale: 'en'
        },
        targetRouteBasePaths: ['/docs'],
        workerResult: {
          kind: 'heavy',
          source: 'fresh',
          rewriteDestination: '/en/docs/_handlers/ai/reverse/hooks/en',
          routeBasePath: '/docs'
        },
        expectedMode: 'rewrite',
        expectedTarget: '/docs',
        expectedRewrite:
          'https://example.com/en/docs/_handlers/ai/reverse/hooks/en?slug=ai&slug=reverse&slug=hooks',
        expectedWorkerArgs: {
          pathname: '/en/docs/ai/reverse/hooks',
          localeConfig: {
            locales: ['en', 'de'],
            defaultLocale: 'en'
          },
          bootstrapGenerationToken: 'bootstrap-1',
          configRegistration: {}
        }
      }
    ];

    test.for(scenarios)('[$id] $description', async ({
      requestUrl,
      headers,
      localeConfig,
      targetRouteBasePaths,
      workerResult,
      expectedMode,
      expectedTarget,
      expectedRewrite,
      expectedWorkerArgs
    }) => {
      getRouteHandlerProxyRoutingStateMock.mockResolvedValue(
        createRoutingState({
          targetRouteBasePaths
        })
      );
      resolveRouteHandlerProxyLazyMissWithWorkerMock.mockResolvedValue(
        workerResult
      );

      const response = await handleRouteHandlerProxyRequest({
        request: createProxyRequest(requestUrl, {
          headers
        }),
        options: {
          localeConfig
        }
      });

      expect(resolveRouteHandlerProxyLazyMissWithWorkerMock).toHaveBeenCalledTimes(
        1
      );
      expect(resolveRouteHandlerProxyLazyMissWithWorkerMock).toHaveBeenCalledWith(
        expectedWorkerArgs
      );
      expect(response.headers.get('x-next-slug-splitter-synthetic-proxy')).toBe(
        expectedMode
      );
      expect(
        response.headers.get('x-next-slug-splitter-synthetic-proxy-target')
      ).toBe(expectedTarget ?? null);
      expect(response.headers.get('x-middleware-rewrite')).toBe(
        expectedRewrite
      );
    });
  });

  it('materializes exactly one response mode per request', async () => {
    const nextSpy = vi.spyOn(NextResponse, 'next');
    const rewriteSpy = vi.spyOn(NextResponse, 'rewrite');

    getRouteHandlerProxyRoutingStateMock.mockResolvedValue(
      createRoutingState({
        targetRouteBasePaths: ['/docs']
      })
    );

    await handleRouteHandlerProxyRequest({
      request: createProxyRequest('https://example.com/docs/getting-started'),
      options: {
        localeConfig: {
          locales: ['en'],
          defaultLocale: 'en'
        }
      }
    });

    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(rewriteSpy).not.toHaveBeenCalled();

    nextSpy.mockClear();
    rewriteSpy.mockClear();

    getRouteHandlerProxyRoutingStateMock.mockResolvedValue(
      createRoutingState({
        rewrites: [
          [
            '/blog/application-extensibility',
            '/en/blog/_handlers/application-extensibility'
          ]
        ],
        targetRouteBasePaths: ['/blog']
      })
    );

    await handleRouteHandlerProxyRequest({
      request: createProxyRequest(
        'https://example.com/blog/application-extensibility?view=full'
      ),
      options: {
        localeConfig: {
          locales: ['en'],
          defaultLocale: 'en'
        }
      }
    });

    expect(rewriteSpy).toHaveBeenCalledTimes(1);
    expect(nextSpy).not.toHaveBeenCalled();
  });
});
