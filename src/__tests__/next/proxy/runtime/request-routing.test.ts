import { beforeEach, describe, expect, it, test, vi } from 'vitest';
import { NextResponse } from 'next/server.js';

vi.mock(import('../../../../next/proxy/runtime/routing-state'), () => ({
  getRouteHandlerProxyRoutingState: vi.fn()
}));

vi.mock(import('../../../../next/proxy/worker/host/client'), () => ({
  resolveRouteHandlerProxyLazyMissWithWorker: vi.fn()
}));

import * as proxyRoutingState from '../../../../next/proxy/runtime/routing-state';
import * as proxyWorkerClient from '../../../../next/proxy/worker/host/client';
import { handleRouteHandlerProxyRequest } from '../../../../next/proxy/runtime/request-routing';
import {
  TEST_MULTI_LOCALE_CONFIG,
  TEST_SINGLE_LOCALE_CONFIG
} from '../../../helpers/fixtures';

import type { LocaleConfig } from '../../../../core/types';
import type {
  RouteHandlerProxyConfigRegistration,
  RouteHandlerProxyRoutingState
} from '../../../../next/proxy/runtime/types';
import type { NextRequest } from 'next/server.js';
import type { RouteHandlerProxyWorkerResponse } from '../../../../next/proxy/worker/types';

const createProxyRequest = (
  url: string,
  options: {
    cookies?: Record<string, string>;
    headers?: Record<string, string>;
    method?: string;
    nextUrlPathname?: string;
  } = {}
): NextRequest =>
  ({
    url,
    method: options.method ?? 'GET',
    headers: new Headers({
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...options.headers
    }),
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
      subject: 'pass-through',
      payload: {
        reason: 'no-target'
      }
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
        localeConfig: TEST_SINGLE_LOCALE_CONFIG
      }
    });

    expect(response.headers.get('x-next-slug-splitter-synthetic-proxy')).toBe(
      'pass-through'
    );
    expect(
      response.headers.get('x-next-slug-splitter-synthetic-proxy-target')
    ).toBe('/docs');
    expect(response.headers.get('x-middleware-rewrite')).toBeNull();
    expect(resolveRouteHandlerProxyLazyMissWithWorkerMock).toHaveBeenCalledWith(
      {
        pathname: '/docs/getting-started',
        localeConfig: TEST_SINGLE_LOCALE_CONFIG,
        bootstrapGenerationToken: 'bootstrap-1',
        configRegistration: {}
      }
    );
  });

  it('falls back to the worker-only path when the thin Proxy runtime cannot load routing state in-process', async () => {
    getRouteHandlerProxyRoutingStateMock.mockRejectedValue(
      new Error('Cannot find module as expression is too dynamic')
    );
    resolveRouteHandlerProxyLazyMissWithWorkerMock.mockResolvedValue({
      subject: 'heavy',
      payload: {
        handlerSynchronizationStatus: 'created',
        rewriteDestination: '/en/docs/generated-handlers/getting-started/en',
        routeBasePath: '/docs'
      }
    });

    const response = await handleRouteHandlerProxyRequest({
      request: createProxyRequest('https://example.com/docs/getting-started'),
      options: {
        localeConfig: TEST_SINGLE_LOCALE_CONFIG
      }
    });

    expect(resolveRouteHandlerProxyLazyMissWithWorkerMock).toHaveBeenCalledWith(
      {
        pathname: '/docs/getting-started',
        localeConfig: TEST_SINGLE_LOCALE_CONFIG,
        bootstrapGenerationToken: 'route-handler-proxy-worker-only-fallback',
        configRegistration: {}
      }
    );
    expect(response.headers.get('x-next-slug-splitter-synthetic-proxy')).toBe(
      'rewrite'
    );
    expect(
      response.headers.get('x-next-slug-splitter-synthetic-proxy-target')
    ).toBe('/docs');
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://example.com/en/docs/generated-handlers/getting-started/en'
    );
  });

  describe('routing-state rewrites', () => {
    type Scenario = {
      id: string;
      description: string;
      requestUrl: string;
      headers?: Record<string, string>;
      localeConfig: LocaleConfig;
      rewrites: Array<[string, string]>;
      targetRouteBasePaths: Array<string>;
      expectedTarget: string;
      expectedRewrite: string;
    };

    const scenarios: ReadonlyArray<Scenario> = [
      {
        id: 'State-Rewrite',
        description:
          'rewrites when the routing state marks the pathname as heavy',
        requestUrl:
          'https://example.com/blog/application-extensibility?view=full',
        localeConfig: TEST_SINGLE_LOCALE_CONFIG,
        rewrites: [
          [
            '/blog/application-extensibility',
            '/en/blog/generated-handlers/application-extensibility'
          ]
        ],
        targetRouteBasePaths: ['/blog'],
        expectedTarget: '/blog',
        expectedRewrite:
          'https://example.com/en/blog/generated-handlers/application-extensibility?view=full'
      },
      {
        id: 'State-Data-Rewrite',
        description:
          'rewrites a header-marked data request even when Proxy receives a page-shaped localized URL',
        requestUrl:
          'https://example.com/de/docs/ai/reverse?slug=ai&slug=reverse',
        headers: {
          'x-nextjs-data': '1'
        },
        localeConfig: TEST_MULTI_LOCALE_CONFIG,
        rewrites: [
          ['/de/docs/ai/reverse', '/de/docs/generated-handlers/ai/reverse/de']
        ],
        targetRouteBasePaths: ['/docs'],
        expectedTarget: '/docs',
        expectedRewrite:
          'https://example.com/de/docs/generated-handlers/ai/reverse/de?slug=ai&slug=reverse'
      }
    ];

    test.for(scenarios)(
      '[$id] $description',
      async ({
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

        expect(
          response.headers.get('x-next-slug-splitter-synthetic-proxy')
        ).toBe('rewrite');
        expect(
          response.headers.get('x-next-slug-splitter-synthetic-proxy-target')
        ).toBe(expectedTarget);
        expect(response.headers.get('x-middleware-rewrite')).toBe(
          expectedRewrite
        );
        expect(
          resolveRouteHandlerProxyLazyMissWithWorkerMock
        ).not.toHaveBeenCalled();
      }
    );
  });

  describe('worker outcomes', () => {
    type Scenario = {
      id: string;
      description: string;
      requestUrl: string;
      headers?: Record<string, string>;
      localeConfig: LocaleConfig;
      targetRouteBasePaths: Array<string>;
      workerResult: RouteHandlerProxyWorkerResponse;
      expectedMode: 'rewrite' | 'pass-through' | 'redirect';
      expectedTarget?: string;
      expectedRewrite: string | null;
      expectedLocation?: string | null;
      expectedWorkerArgs: {
        pathname: string;
        localeConfig: LocaleConfig;
        bootstrapGenerationToken: string;
        configRegistration: RouteHandlerProxyConfigRegistration;
      };
    };

    const scenarios: ReadonlyArray<Scenario> = [
      {
        id: 'Created-Rewrite',
        description:
          'rewrites immediately when a cold heavy request created a brand-new handler file',
        requestUrl:
          'https://example.com/blog/application-extensibility?view=full',
        localeConfig: TEST_SINGLE_LOCALE_CONFIG,
        targetRouteBasePaths: ['/blog'],
        workerResult: {
          subject: 'heavy',
          payload: {
            handlerSynchronizationStatus: 'created',
            rewriteDestination:
              '/en/blog/generated-handlers/application-extensibility',
            routeBasePath: '/blog'
          }
        },
        expectedMode: 'rewrite',
        expectedTarget: '/blog',
        expectedRewrite:
          'https://example.com/en/blog/generated-handlers/application-extensibility?view=full',
        expectedLocation: null,
        expectedWorkerArgs: {
          pathname: '/blog/application-extensibility',
          localeConfig: TEST_SINGLE_LOCALE_CONFIG,
          bootstrapGenerationToken: 'bootstrap-1',
          configRegistration: {}
        }
      },
      {
        id: 'Unchanged-Rewrite',
        description:
          'still rewrites immediately when the heavy handler was already present before the request',
        requestUrl:
          'https://example.com/blog/application-extensibility?view=full',
        localeConfig: TEST_SINGLE_LOCALE_CONFIG,
        targetRouteBasePaths: ['/blog'],
        workerResult: {
          subject: 'heavy',
          payload: {
            handlerSynchronizationStatus: 'unchanged',
            rewriteDestination:
              '/en/blog/generated-handlers/application-extensibility',
            routeBasePath: '/blog'
          }
        },
        expectedMode: 'rewrite',
        expectedTarget: '/blog',
        expectedRewrite:
          'https://example.com/en/blog/generated-handlers/application-extensibility?view=full',
        expectedLocation: null,
        expectedWorkerArgs: {
          pathname: '/blog/application-extensibility',
          localeConfig: TEST_SINGLE_LOCALE_CONFIG,
          bootstrapGenerationToken: 'bootstrap-1',
          configRegistration: {}
        }
      },
      {
        id: 'Updated-Redirect',
        description:
          'redirects the primary HTML navigation request when a heavy handler file was overwritten in place',
        requestUrl:
          'https://example.com/blog/application-extensibility?view=full',
        localeConfig: TEST_SINGLE_LOCALE_CONFIG,
        targetRouteBasePaths: ['/blog'],
        workerResult: {
          subject: 'heavy',
          payload: {
            handlerSynchronizationStatus: 'updated',
            rewriteDestination:
              '/en/blog/generated-handlers/application-extensibility',
            routeBasePath: '/blog'
          }
        },
        expectedMode: 'redirect',
        expectedTarget: '/blog',
        expectedRewrite: null,
        expectedLocation:
          'https://example.com/blog/application-extensibility?view=full',
        expectedWorkerArgs: {
          pathname: '/blog/application-extensibility',
          localeConfig: TEST_SINGLE_LOCALE_CONFIG,
          bootstrapGenerationToken: 'bootstrap-1',
          configRegistration: {}
        }
      },
      {
        id: 'Updated-Data-Rewrite',
        description:
          'keeps Pages Router data transport on the fast rewrite path when a heavy handler file was overwritten in place',
        requestUrl:
          'https://example.com/blog/application-extensibility?view=full',
        headers: {
          accept: '*/*',
          'x-nextjs-data': '1'
        },
        localeConfig: TEST_SINGLE_LOCALE_CONFIG,
        targetRouteBasePaths: ['/blog'],
        workerResult: {
          subject: 'heavy',
          payload: {
            handlerSynchronizationStatus: 'updated',
            rewriteDestination:
              '/en/blog/generated-handlers/application-extensibility',
            routeBasePath: '/blog'
          }
        },
        expectedMode: 'rewrite',
        expectedTarget: '/blog',
        expectedRewrite:
          'https://example.com/en/blog/generated-handlers/application-extensibility?view=full',
        expectedLocation: null,
        expectedWorkerArgs: {
          pathname: '/blog/application-extensibility',
          localeConfig: TEST_SINGLE_LOCALE_CONFIG,
          bootstrapGenerationToken: 'bootstrap-1',
          configRegistration: {}
        }
      },
      {
        id: 'Light-Pass-Through',
        description:
          'removes stale lazy output when a matched route is now light',
        requestUrl: 'https://example.com/blog/application-extensibility',
        localeConfig: TEST_SINGLE_LOCALE_CONFIG,
        targetRouteBasePaths: ['/blog'],
        workerResult: {
          subject: 'pass-through',
          payload: {
            reason: 'light'
          }
        },
        expectedMode: 'pass-through',
        expectedTarget: '/blog',
        expectedRewrite: null,
        expectedLocation: null,
        expectedWorkerArgs: {
          pathname: '/blog/application-extensibility',
          localeConfig: TEST_SINGLE_LOCALE_CONFIG,
          bootstrapGenerationToken: 'bootstrap-1',
          configRegistration: {}
        }
      },
      {
        id: 'Missing-Route-File',
        description:
          'removes stale lazy output when the pathname still belongs to a target but the route file is missing',
        requestUrl: 'https://example.com/docs/missing-page',
        localeConfig: TEST_SINGLE_LOCALE_CONFIG,
        targetRouteBasePaths: ['/docs'],
        workerResult: {
          subject: 'pass-through',
          payload: {
            reason: 'missing-route-file'
          }
        },
        expectedMode: 'pass-through',
        expectedTarget: '/docs',
        expectedRewrite: null,
        expectedLocation: null,
        expectedWorkerArgs: {
          pathname: '/docs/missing-page',
          localeConfig: TEST_SINGLE_LOCALE_CONFIG,
          bootstrapGenerationToken: 'bootstrap-1',
          configRegistration: {}
        }
      },
      {
        id: 'Missing-Rewrite',
        description:
          'falls through without publishing a lazy discovery when one-file heavy analysis cannot resolve a rewrite destination',
        requestUrl: 'https://example.com/blog/application-extensibility',
        localeConfig: TEST_SINGLE_LOCALE_CONFIG,
        targetRouteBasePaths: ['/blog'],
        workerResult: {
          subject: 'pass-through',
          payload: {
            reason: 'missing-rewrite-destination'
          }
        },
        expectedMode: 'pass-through',
        expectedTarget: '/blog',
        expectedRewrite: null,
        expectedLocation: null,
        expectedWorkerArgs: {
          pathname: '/blog/application-extensibility',
          localeConfig: TEST_SINGLE_LOCALE_CONFIG,
          bootstrapGenerationToken: 'bootstrap-1',
          configRegistration: {}
        }
      },
      {
        id: 'Created-Page-Rewrite',
        description: 'rewrites immediately for a cold heavy page request',
        requestUrl:
          'https://example.com/en/docs/ai/reverse/hooks?slug=ai&slug=reverse&slug=hooks',
        localeConfig: TEST_MULTI_LOCALE_CONFIG,
        targetRouteBasePaths: ['/docs'],
        workerResult: {
          subject: 'heavy',
          payload: {
            handlerSynchronizationStatus: 'created',
            rewriteDestination:
              '/en/docs/generated-handlers/ai/reverse/hooks/en',
            routeBasePath: '/docs'
          }
        },
        expectedMode: 'rewrite',
        expectedTarget: '/docs',
        expectedRewrite:
          'https://example.com/en/docs/generated-handlers/ai/reverse/hooks/en?slug=ai&slug=reverse&slug=hooks',
        expectedLocation: null,
        expectedWorkerArgs: {
          pathname: '/en/docs/ai/reverse/hooks',
          localeConfig: TEST_MULTI_LOCALE_CONFIG,
          bootstrapGenerationToken: 'bootstrap-1',
          configRegistration: {}
        }
      }
    ];

    test.for(scenarios)(
      '[$id] $description',
      async ({
        requestUrl,
        headers,
        localeConfig,
        targetRouteBasePaths,
        workerResult,
        expectedMode,
        expectedTarget,
        expectedRewrite,
        expectedLocation,
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

        expect(
          resolveRouteHandlerProxyLazyMissWithWorkerMock
        ).toHaveBeenCalledTimes(1);
        expect(
          resolveRouteHandlerProxyLazyMissWithWorkerMock
        ).toHaveBeenCalledWith(expectedWorkerArgs);
        expect(
          response.headers.get('x-next-slug-splitter-synthetic-proxy')
        ).toBe(expectedMode);
        expect(
          response.headers.get('x-next-slug-splitter-synthetic-proxy-target')
        ).toBe(expectedTarget ?? null);
        expect(response.headers.get('x-middleware-rewrite')).toBe(
          expectedRewrite
        );
        expect(response.headers.get('location')).toBe(expectedLocation ?? null);
      }
    );
  });

  it('materializes exactly one response mode per request', async () => {
    const nextSpy = vi.spyOn(NextResponse, 'next');
    const rewriteSpy = vi.spyOn(NextResponse, 'rewrite');
    const redirectSpy = vi.spyOn(NextResponse, 'redirect');

    getRouteHandlerProxyRoutingStateMock.mockResolvedValue(
      createRoutingState({
        targetRouteBasePaths: ['/docs']
      })
    );

    await handleRouteHandlerProxyRequest({
      request: createProxyRequest('https://example.com/docs/getting-started'),
      options: {
        localeConfig: TEST_SINGLE_LOCALE_CONFIG
      }
    });

    expect(nextSpy).toHaveBeenCalledTimes(1);
    expect(rewriteSpy).not.toHaveBeenCalled();
    expect(redirectSpy).not.toHaveBeenCalled();

    nextSpy.mockClear();
    rewriteSpy.mockClear();
    redirectSpy.mockClear();

    getRouteHandlerProxyRoutingStateMock.mockResolvedValue(
      createRoutingState({
        rewrites: [
          [
            '/blog/application-extensibility',
            '/en/blog/generated-handlers/application-extensibility'
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
        localeConfig: TEST_SINGLE_LOCALE_CONFIG
      }
    });

    expect(rewriteSpy).toHaveBeenCalledTimes(1);
    expect(nextSpy).not.toHaveBeenCalled();
    expect(redirectSpy).not.toHaveBeenCalled();

    nextSpy.mockClear();
    rewriteSpy.mockClear();
    redirectSpy.mockClear();

    getRouteHandlerProxyRoutingStateMock.mockResolvedValue(
      createRoutingState({
        targetRouteBasePaths: ['/blog']
      })
    );
    resolveRouteHandlerProxyLazyMissWithWorkerMock.mockResolvedValue({
      subject: 'heavy',
      payload: {
        handlerSynchronizationStatus: 'updated',
        rewriteDestination:
          '/en/blog/generated-handlers/application-extensibility',
        routeBasePath: '/blog'
      }
    });

    await handleRouteHandlerProxyRequest({
      request: createProxyRequest(
        'https://example.com/blog/application-extensibility?view=full'
      ),
      options: {
        localeConfig: TEST_SINGLE_LOCALE_CONFIG
      }
    });

    expect(redirectSpy).toHaveBeenCalledTimes(1);
    expect(nextSpy).not.toHaveBeenCalled();
    expect(rewriteSpy).not.toHaveBeenCalled();
  });
});
