import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDeferred } from '../../../helpers/deferred';
import { composeKey } from '../../../../next/proxy/lazy/key-builder';

const analyzeRouteHandlerLazyMatchedRouteMock = vi.hoisted(() => vi.fn());
const doesRouteHandlerLazySingleHandlerExistMock = vi.hoisted(() => vi.fn());
const emitRouteHandlerLazySingleHandlerMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../../../next/proxy/lazy/single-route-analysis'), () => ({
  analyzeRouteHandlerLazyMatchedRoute: analyzeRouteHandlerLazyMatchedRouteMock
}));

vi.mock(import('../../../../next/proxy/lazy/single-handler-emission'), () => ({
  doesRouteHandlerLazySingleHandlerExist:
    doesRouteHandlerLazySingleHandlerExistMock,
  emitRouteHandlerLazySingleHandler: emitRouteHandlerLazySingleHandlerMock
}));

import { prepareRouteHandlerLazyMatchedRoute } from '../../../../next/proxy/lazy/cold-request-dedupe';

const bootstrapGenerationToken = 'bootstrap-1';
const resolvedConfigsByTargetId = new Map();
const routePath = { locale: 'en', slugArray: ['post'], filePath: '/tmp/post.mdx' };

describe('composeKey', () => {
  it('creates same key for same inputs', () => {
    const key1 = composeKey('blog', '/tmp/app/blog/src/pages/post.mdx');
    const key2 = composeKey('blog', '/tmp/app/blog/src/pages/post.mdx');

    expect(key1).toBe(key2);
  });

  it('creates different keys for different targets', () => {
    const key1 = composeKey('blog', '/tmp/app/blog/src/pages/post.mdx');
    const key2 = composeKey('docs', '/tmp/app/blog/src/pages/post.mdx');

    expect(key1).not.toBe(key2);
  });

  it('creates different keys for different files', () => {
    const key1 = composeKey('blog', '/tmp/app/blog/src/pages/post.mdx');
    const key2 = composeKey('blog', '/tmp/app/blog/src/pages/other.mdx');

    expect(key1).not.toBe(key2);
  });

  it('accepts any number of parts', () => {
    const key = composeKey('a', 'b', 'c', 123, true);

    expect(key).toBe('["a","b","c",123,true]');
  });
});

describe('prepareRouteHandlerLazyMatchedRoute deduplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    doesRouteHandlerLazySingleHandlerExistMock.mockResolvedValue(false);
  });

  it('deduplicates concurrent calls with same target and file', async () => {
    const deferred = createDeferred<{ kind: 'heavy' }>();
    analyzeRouteHandlerLazyMatchedRouteMock.mockReturnValue(deferred.promise);

    prepareRouteHandlerLazyMatchedRoute({
      targetId: 'blog',
      routePath,
      bootstrapGenerationToken,
      resolvedConfigsByTargetId
    });
    prepareRouteHandlerLazyMatchedRoute({
      targetId: 'blog',
      routePath,
      bootstrapGenerationToken,
      resolvedConfigsByTargetId
    });

    expect(analyzeRouteHandlerLazyMatchedRouteMock).toHaveBeenCalledTimes(1);

    deferred.resolve({ kind: 'heavy' });
  });

  it('does not emit for light results', async () => {
    analyzeRouteHandlerLazyMatchedRouteMock.mockResolvedValue({ kind: 'light' });

    await prepareRouteHandlerLazyMatchedRoute({
      targetId: 'blog',
      routePath,
      bootstrapGenerationToken,
      resolvedConfigsByTargetId
    });

    expect(emitRouteHandlerLazySingleHandlerMock).not.toHaveBeenCalled();
  });

  it('skips emission when a cached heavy route already has a handler on disk', async () => {
    const analysisResult = { kind: 'heavy', source: 'cache' };
    analyzeRouteHandlerLazyMatchedRouteMock.mockResolvedValue(analysisResult);
    doesRouteHandlerLazySingleHandlerExistMock.mockResolvedValue(true);

    await prepareRouteHandlerLazyMatchedRoute({
      targetId: 'blog',
      routePath,
      bootstrapGenerationToken,
      resolvedConfigsByTargetId
    });

    expect(doesRouteHandlerLazySingleHandlerExistMock).toHaveBeenCalledWith(
      analysisResult
    );
    expect(emitRouteHandlerLazySingleHandlerMock).not.toHaveBeenCalled();
  });
});
