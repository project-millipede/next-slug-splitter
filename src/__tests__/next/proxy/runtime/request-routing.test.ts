import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server.js';

const getRouteHandlerProxyRoutingStateMock = vi.hoisted(() => vi.fn());
const resolveRouteHandlerProxyLazyMissWithWorkerMock = vi.hoisted(() =>
  vi.fn()
);

vi.mock('../../../../next/proxy/runtime/routing-state', () => ({
  getRouteHandlerProxyRoutingState: getRouteHandlerProxyRoutingStateMock
}));

vi.mock('../../../../next/proxy/worker/client', () => ({
  resolveRouteHandlerProxyLazyMissWithWorker:
    resolveRouteHandlerProxyLazyMissWithWorkerMock
}));

import { handleRouteHandlerProxyRequest } from '../../../../next/proxy/request-routing';

import type { NextRequest } from 'next/server.js';

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

describe('proxy request routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveRouteHandlerProxyLazyMissWithWorkerMock.mockResolvedValue({
      kind: 'pass-through',
      reason: 'no-target'
    });
  });

  it('passes through when the routing state has no heavy-route rewrite for the pathname', async () => {
    getRouteHandlerProxyRoutingStateMock.mockResolvedValue({
      rewriteBySourcePath: new Map(),
      targetRouteBasePaths: ['/docs'],
      resolvedConfigsByTargetId: new Map()
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
      }
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
      }
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

  it('rewrites when the routing state marks the pathname as heavy', async () => {
    getRouteHandlerProxyRoutingStateMock.mockResolvedValue({
      rewriteBySourcePath: new Map([
        ['/blog/application-extensibility', '/en/blog/_handlers/application-extensibility']
      ]),
      targetRouteBasePaths: ['/blog'],
      resolvedConfigsByTargetId: new Map()
    });

    const response = await handleRouteHandlerProxyRequest({
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

    expect(response.headers.get('x-next-slug-splitter-synthetic-proxy')).toBe(
      'rewrite'
    );
    expect(
      response.headers.get('x-next-slug-splitter-synthetic-proxy-target')
    ).toBe('/blog');
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://example.com/en/blog/_handlers/application-extensibility?view=full'
    );
    expect(resolveRouteHandlerProxyLazyMissWithWorkerMock).not.toHaveBeenCalled();
  });

  it('materializes exactly one response mode per request', async () => {
    const nextSpy = vi.spyOn(NextResponse, 'next');
    const rewriteSpy = vi.spyOn(NextResponse, 'rewrite');

    getRouteHandlerProxyRoutingStateMock.mockResolvedValue({
      rewriteBySourcePath: new Map(),
      targetRouteBasePaths: ['/docs'],
      resolvedConfigsByTargetId: new Map()
    });

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

    getRouteHandlerProxyRoutingStateMock.mockResolvedValue({
      rewriteBySourcePath: new Map([
        ['/blog/application-extensibility', '/en/blog/_handlers/application-extensibility']
      ]),
      targetRouteBasePaths: ['/blog'],
      resolvedConfigsByTargetId: new Map()
    });

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

    nextSpy.mockRestore();
    rewriteSpy.mockRestore();
  });

  it('rewrites from the validated lazy discovery snapshot before re-entering the cold lazy path', async () => {
    getRouteHandlerProxyRoutingStateMock.mockResolvedValue({
      rewriteBySourcePath: new Map(),
      targetRouteBasePaths: ['/blog'],
      resolvedConfigsByTargetId: new Map()
    });
    resolveRouteHandlerProxyLazyMissWithWorkerMock.mockResolvedValue({
      kind: 'heavy',
      source: 'discovery',
      rewriteDestination: '/en/blog/_handlers/application-extensibility',
      routeBasePath: '/blog'
    });

    const response = await handleRouteHandlerProxyRequest({
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

    expect(response.headers.get('x-next-slug-splitter-synthetic-proxy')).toBe(
      'rewrite'
    );
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://example.com/en/blog/_handlers/application-extensibility?view=full'
    );
    expect(resolveRouteHandlerProxyLazyMissWithWorkerMock).toHaveBeenCalledTimes(
      1
    );
  });

  it('removes stale lazy output when a matched route is now light', async () => {
    getRouteHandlerProxyRoutingStateMock.mockResolvedValue({
      rewriteBySourcePath: new Map(),
      targetRouteBasePaths: ['/blog'],
      resolvedConfigsByTargetId: new Map()
    });
    resolveRouteHandlerProxyLazyMissWithWorkerMock.mockResolvedValue({
      kind: 'pass-through',
      reason: 'light'
    });

    const response = await handleRouteHandlerProxyRequest({
      request: createProxyRequest('https://example.com/blog/application-extensibility'),
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
    expect(resolveRouteHandlerProxyLazyMissWithWorkerMock).toHaveBeenCalledTimes(
      1
    );
  });

  it('removes stale lazy output when the pathname still belongs to a target but the route file is missing', async () => {
    getRouteHandlerProxyRoutingStateMock.mockResolvedValue({
      rewriteBySourcePath: new Map(),
      targetRouteBasePaths: ['/docs'],
      resolvedConfigsByTargetId: new Map()
    });
    resolveRouteHandlerProxyLazyMissWithWorkerMock.mockResolvedValue({
      kind: 'pass-through',
      reason: 'missing-route-file'
    });

    const response = await handleRouteHandlerProxyRequest({
      request: createProxyRequest('https://example.com/docs/missing-page'),
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
    expect(resolveRouteHandlerProxyLazyMissWithWorkerMock).toHaveBeenCalledTimes(
      1
    );
  });

  it('rewrites immediately when a cold heavy request had to write a brand-new handler file', async () => {
    getRouteHandlerProxyRoutingStateMock.mockResolvedValue({
      rewriteBySourcePath: new Map(),
      targetRouteBasePaths: ['/blog'],
      resolvedConfigsByTargetId: new Map()
    });
    resolveRouteHandlerProxyLazyMissWithWorkerMock.mockResolvedValue({
      kind: 'heavy',
      source: 'fresh',
      rewriteDestination: '/en/blog/_handlers/application-extensibility',
      routeBasePath: '/blog'
    });

    const response = await handleRouteHandlerProxyRequest({
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

    expect(response.headers.get('x-next-slug-splitter-synthetic-proxy')).toBe(
      'rewrite'
    );
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://example.com/en/blog/_handlers/application-extensibility?view=full'
    );
    expect(resolveRouteHandlerProxyLazyMissWithWorkerMock).toHaveBeenCalledTimes(
      1
    );
  });

  it('rewrites immediately for a cold heavy page request', async () => {
    getRouteHandlerProxyRoutingStateMock.mockResolvedValue({
      rewriteBySourcePath: new Map(),
      targetRouteBasePaths: ['/docs'],
      resolvedConfigsByTargetId: new Map()
    });
    resolveRouteHandlerProxyLazyMissWithWorkerMock.mockResolvedValue({
      kind: 'heavy',
      source: 'fresh',
      rewriteDestination: '/en/docs/_handlers/ai/reverse/hooks/en',
      routeBasePath: '/docs'
    });

    const response = await handleRouteHandlerProxyRequest({
      request: createProxyRequest(
        'https://example.com/en/docs/ai/reverse/hooks?slug=ai&slug=reverse&slug=hooks'
      ),
      options: {
        localeConfig: {
          locales: ['en', 'de'],
          defaultLocale: 'en'
        }
      }
    });

    expect(resolveRouteHandlerProxyLazyMissWithWorkerMock).toHaveBeenCalledWith({
      pathname: '/en/docs/ai/reverse/hooks',
      localeConfig: {
        locales: ['en', 'de'],
        defaultLocale: 'en'
      }
    });
    expect(response.headers.get('x-next-slug-splitter-synthetic-proxy')).toBe(
      'rewrite'
    );
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://example.com/en/docs/_handlers/ai/reverse/hooks/en?slug=ai&slug=reverse&slug=hooks'
    );
  });

  it('rewrites a header-marked data request even when Proxy receives a page-shaped localized URL', async () => {
    getRouteHandlerProxyRoutingStateMock.mockResolvedValue({
      rewriteBySourcePath: new Map([
        ['/de/docs/ai/reverse', '/de/docs/_handlers/ai/reverse/de']
      ]),
      targetRouteBasePaths: ['/docs'],
      resolvedConfigsByTargetId: new Map()
    });

    const response = await handleRouteHandlerProxyRequest({
      request: createProxyRequest('https://example.com/de/docs/ai/reverse?slug=ai&slug=reverse', {
        headers: {
          'x-nextjs-data': '1'
        }
      }),
      options: {
        localeConfig: {
          locales: ['en', 'de'],
          defaultLocale: 'en'
        }
      }
    });

    expect(response.headers.get('x-next-slug-splitter-synthetic-proxy')).toBe(
      'rewrite'
    );
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://example.com/de/docs/_handlers/ai/reverse/de?slug=ai&slug=reverse'
    );
  });

  it('still rewrites immediately when the heavy handler was already present before the request', async () => {
    getRouteHandlerProxyRoutingStateMock.mockResolvedValue({
      rewriteBySourcePath: new Map(),
      targetRouteBasePaths: ['/blog'],
      resolvedConfigsByTargetId: new Map()
    });
    resolveRouteHandlerProxyLazyMissWithWorkerMock.mockResolvedValue({
      kind: 'heavy',
      source: 'cache',
      rewriteDestination: '/en/blog/_handlers/application-extensibility',
      routeBasePath: '/blog'
    });

    const response = await handleRouteHandlerProxyRequest({
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

    expect(response.headers.get('x-next-slug-splitter-synthetic-proxy')).toBe(
      'rewrite'
    );
    expect(response.headers.get('x-middleware-rewrite')).toBe(
      'https://example.com/en/blog/_handlers/application-extensibility?view=full'
    );
  });

  it('falls through without publishing a lazy discovery when one-file heavy analysis cannot resolve a rewrite destination', async () => {
    getRouteHandlerProxyRoutingStateMock.mockResolvedValue({
      rewriteBySourcePath: new Map(),
      targetRouteBasePaths: ['/blog'],
      resolvedConfigsByTargetId: new Map()
    });
    resolveRouteHandlerProxyLazyMissWithWorkerMock.mockResolvedValue({
      kind: 'pass-through',
      reason: 'missing-rewrite-destination'
    });

    const response = await handleRouteHandlerProxyRequest({
      request: createProxyRequest('https://example.com/blog/application-extensibility'),
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
    expect(resolveRouteHandlerProxyLazyMissWithWorkerMock).toHaveBeenCalledTimes(
      1
    );
  });
});
