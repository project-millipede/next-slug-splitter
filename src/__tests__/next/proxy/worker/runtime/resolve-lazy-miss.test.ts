import { beforeEach, describe, expect, test, vi } from 'vitest';

const prepareRouteHandlerLazyMatchedRouteMock = vi.hoisted(() => vi.fn());
const resolveRouteHandlerLazyRequestMock = vi.hoisted(() => vi.fn());
const resolveRouteHandlerLazyRewriteDestinationMock = vi.hoisted(() => vi.fn());
const removeRouteHandlerLazyOutputForIdentityMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../../../../next/proxy/lazy/cold-request-dedupe'), () => ({
  prepareRouteHandlerLazyMatchedRoute: prepareRouteHandlerLazyMatchedRouteMock
}));

vi.mock(import('../../../../../next/proxy/lazy/request-resolution'), () => ({
  resolveRouteHandlerLazyRequest: resolveRouteHandlerLazyRequestMock
}));

vi.mock(import('../../../../../next/proxy/lazy/single-route-rewrite'), () => ({
  resolveRouteHandlerLazyRewriteDestination:
    resolveRouteHandlerLazyRewriteDestinationMock
}));

vi.mock(import('../../../../../next/proxy/lazy/stale-output-cleanup'), () => ({
  removeRouteHandlerLazyOutputForIdentity:
    removeRouteHandlerLazyOutputForIdentityMock
}));

vi.mock(import('../../../../../next/proxy/worker/debug-log'), () => ({
  debugRouteHandlerProxyWorker: vi.fn()
}));

import { resolveRouteHandlerProxyLazyMiss } from '../../../../../next/proxy/worker/runtime/resolve-lazy-miss';
import { TEST_MULTI_LOCALE_CONFIG } from '../../../../helpers/fixtures';

import type { RouteHandlerProxyWorkerBootstrapState } from '../../../../../next/proxy/worker/runtime/bootstrap';

const appTarget = {
  routerKind: 'app' as const,
  targetId: 'docs',
  routeBasePath: '/docs',
  contentLocaleMode: 'filename' as const,
  localeConfig: TEST_MULTI_LOCALE_CONFIG,
  emitFormat: 'ts' as const,
  paths: {
    contentDir: '/repo/content',
    generatedDir: '/repo/app/docs/generated-handlers'
  }
};

const routePath = {
  locale: 'en',
  slugArray: ['getting-started'],
  filePath: '/repo/content/getting-started/en.mdx'
};

const bootstrapState = {
  bootstrapGenerationToken: 'bootstrap-1',
  lazyResolvedTargets: [appTarget],
  resolvedConfigsByTargetId: new Map(),
  lazySingleRouteCacheManager: {}
} as unknown as RouteHandlerProxyWorkerBootstrapState;

describe('resolveRouteHandlerProxyLazyMiss', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    removeRouteHandlerLazyOutputForIdentityMock.mockResolvedValue(undefined);
  });

  test('returns target metadata for App light pass-through responses', async () => {
    resolveRouteHandlerLazyRequestMock.mockResolvedValue({
      kind: 'matched-route-file',
      pathname: '/docs/getting-started',
      config: appTarget,
      identity: {
        pathname: '/docs/getting-started',
        locale: 'en',
        slugArray: ['getting-started']
      },
      routePath
    });
    prepareRouteHandlerLazyMatchedRouteMock.mockResolvedValue({
      kind: 'light',
      analysisResult: {
        kind: 'light',
        source: 'fresh',
        config: appTarget,
        routePath
      }
    });

    await expect(
      resolveRouteHandlerProxyLazyMiss('/docs/getting-started', bootstrapState)
    ).resolves.toEqual({
      subject: 'pass-through',
      payload: {
        reason: 'light',
        routerKind: 'app',
        routeBasePath: '/docs',
        locale: 'en',
        slugArray: ['getting-started']
      }
    });
  });

  test('returns target metadata for App missing-route pass-through responses', async () => {
    resolveRouteHandlerLazyRequestMock.mockResolvedValue({
      kind: 'missing-route-file',
      pathname: '/docs/missing-page',
      config: appTarget,
      identity: {
        pathname: '/docs/missing-page',
        locale: 'en',
        slugArray: ['missing-page']
      }
    });

    await expect(
      resolveRouteHandlerProxyLazyMiss('/docs/missing-page', bootstrapState)
    ).resolves.toEqual({
      subject: 'pass-through',
      payload: {
        reason: 'missing-route-file',
        routerKind: 'app',
        routeBasePath: '/docs',
        locale: 'en',
        slugArray: ['missing-page']
      }
    });
  });

  test('keeps no-target pass-through responses minimal', async () => {
    resolveRouteHandlerLazyRequestMock.mockResolvedValue({
      kind: 'no-target',
      pathname: '/marketing'
    });

    await expect(
      resolveRouteHandlerProxyLazyMiss('/marketing', bootstrapState)
    ).resolves.toEqual({
      subject: 'pass-through',
      payload: {
        reason: 'no-target'
      }
    });
  });
});
