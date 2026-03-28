import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDeferred } from '../../../helpers/deferred';

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

describe('cold-request dedupe — unit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    doesRouteHandlerLazySingleHandlerExistMock.mockResolvedValue(false);
  });

  it('starts independent analysis for different target/file keys', async () => {
    analyzeRouteHandlerLazyMatchedRouteMock.mockResolvedValue({ kind: 'light' });

    await prepareRouteHandlerLazyMatchedRoute({
      targetId: 'blog',
      routePath,
      bootstrapGenerationToken,
      resolvedConfigsByTargetId
    });
    await prepareRouteHandlerLazyMatchedRoute({
      targetId: 'docs',
      routePath,
      bootstrapGenerationToken,
      resolvedConfigsByTargetId
    });

    expect(analyzeRouteHandlerLazyMatchedRouteMock).toHaveBeenCalledTimes(2);
  });

  it('clears dedupe slot after settlement so next call starts fresh', async () => {
    analyzeRouteHandlerLazyMatchedRouteMock.mockResolvedValue({ kind: 'light' });

    await prepareRouteHandlerLazyMatchedRoute({
      targetId: 'blog',
      routePath,
      bootstrapGenerationToken,
      resolvedConfigsByTargetId
    });
    await prepareRouteHandlerLazyMatchedRoute({
      targetId: 'blog',
      routePath,
      bootstrapGenerationToken,
      resolvedConfigsByTargetId
    });

    expect(analyzeRouteHandlerLazyMatchedRouteMock).toHaveBeenCalledTimes(2);
  });

  it('clears dedupe slot even when analysis rejects', async () => {
    analyzeRouteHandlerLazyMatchedRouteMock.mockRejectedValueOnce(
      new Error('analysis failed')
    );
    analyzeRouteHandlerLazyMatchedRouteMock.mockResolvedValue({ kind: 'light' });

    await expect(
      prepareRouteHandlerLazyMatchedRoute({
        targetId: 'blog',
        routePath,
        bootstrapGenerationToken,
        resolvedConfigsByTargetId
      })
    ).rejects.toThrow('analysis failed');

    // Slot was cleared — second call starts a fresh analysis
    const result = await prepareRouteHandlerLazyMatchedRoute({
      targetId: 'blog',
      routePath,
      bootstrapGenerationToken,
      resolvedConfigsByTargetId
    });

    expect(analyzeRouteHandlerLazyMatchedRouteMock).toHaveBeenCalledTimes(2);
    expect(result?.kind).toBe('light');
  });
});

describe('cold-request dedupe — composite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    doesRouteHandlerLazySingleHandlerExistMock.mockResolvedValue(false);
    emitRouteHandlerLazySingleHandlerMock.mockResolvedValue({
      status: 'written',
      renderedPage: {}
    });
  });

  it('returns { kind: "light" } without emission for light routes', async () => {
    const analysisResult = { kind: 'light', source: 'fresh' };
    analyzeRouteHandlerLazyMatchedRouteMock.mockResolvedValue(analysisResult);

    const result = await prepareRouteHandlerLazyMatchedRoute({
      targetId: 'blog',
      routePath,
      bootstrapGenerationToken,
      resolvedConfigsByTargetId
    });

    expect(result).toEqual({ kind: 'light', analysisResult });
    expect(emitRouteHandlerLazySingleHandlerMock).not.toHaveBeenCalled();
  });

  it('returns { kind: "heavy" } and emits handler for heavy routes', async () => {
    const analysisResult = { kind: 'heavy', source: 'fresh' };
    analyzeRouteHandlerLazyMatchedRouteMock.mockResolvedValue(analysisResult);

    const result = await prepareRouteHandlerLazyMatchedRoute({
      targetId: 'blog',
      routePath,
      bootstrapGenerationToken,
      resolvedConfigsByTargetId
    });

    expect(result).toEqual({ kind: 'heavy', analysisResult });
    expect(emitRouteHandlerLazySingleHandlerMock).toHaveBeenCalledWith({
      analysisResult
    });
  });

  it('returns { kind: "heavy" } without emission for cached heavy routes whose handler already exists', async () => {
    const analysisResult = { kind: 'heavy', source: 'cache' };
    analyzeRouteHandlerLazyMatchedRouteMock.mockResolvedValue(analysisResult);
    doesRouteHandlerLazySingleHandlerExistMock.mockResolvedValue(true);

    const result = await prepareRouteHandlerLazyMatchedRoute({
      targetId: 'blog',
      routePath,
      bootstrapGenerationToken,
      resolvedConfigsByTargetId
    });

    expect(result).toEqual({ kind: 'heavy', analysisResult });
    expect(doesRouteHandlerLazySingleHandlerExistMock).toHaveBeenCalledWith(
      analysisResult
    );
    expect(emitRouteHandlerLazySingleHandlerMock).not.toHaveBeenCalled();
  });

  it('returns { kind: "heavy" } and emits when a cached heavy route has no handler on disk', async () => {
    const analysisResult = { kind: 'heavy', source: 'cache' };
    analyzeRouteHandlerLazyMatchedRouteMock.mockResolvedValue(analysisResult);
    doesRouteHandlerLazySingleHandlerExistMock.mockResolvedValue(false);

    const result = await prepareRouteHandlerLazyMatchedRoute({
      targetId: 'blog',
      routePath,
      bootstrapGenerationToken,
      resolvedConfigsByTargetId
    });

    expect(result).toEqual({ kind: 'heavy', analysisResult });
    expect(doesRouteHandlerLazySingleHandlerExistMock).toHaveBeenCalledWith(
      analysisResult
    );
    expect(emitRouteHandlerLazySingleHandlerMock).toHaveBeenCalledWith({
      analysisResult
    });
  });

  it('returns null without emission when analysis returns null', async () => {
    analyzeRouteHandlerLazyMatchedRouteMock.mockResolvedValue(null);

    const result = await prepareRouteHandlerLazyMatchedRoute({
      targetId: 'blog',
      routePath,
      bootstrapGenerationToken,
      resolvedConfigsByTargetId
    });

    expect(result).toBeNull();
    expect(emitRouteHandlerLazySingleHandlerMock).not.toHaveBeenCalled();
  });

  it('returns identical result to both concurrent callers', async () => {
    const deferred = createDeferred<{ kind: 'heavy'; source: 'fresh' }>();
    analyzeRouteHandlerLazyMatchedRouteMock.mockReturnValue(deferred.promise);

    const first = prepareRouteHandlerLazyMatchedRoute({
      targetId: 'blog',
      routePath,
      bootstrapGenerationToken,
      resolvedConfigsByTargetId
    });
    const second = prepareRouteHandlerLazyMatchedRoute({
      targetId: 'blog',
      routePath,
      bootstrapGenerationToken,
      resolvedConfigsByTargetId
    });

    deferred.resolve({ kind: 'heavy', source: 'fresh' });

    const [r1, r2] = await Promise.all([first, second]);

    expect(r1).toEqual(r2);
    expect(analyzeRouteHandlerLazyMatchedRouteMock).toHaveBeenCalledTimes(1);
  });

  it('propagates analysis error to both concurrent callers', async () => {
    const deferred = createDeferred<never>();
    analyzeRouteHandlerLazyMatchedRouteMock.mockReturnValue(deferred.promise);

    const first = prepareRouteHandlerLazyMatchedRoute({
      targetId: 'blog',
      routePath,
      bootstrapGenerationToken,
      resolvedConfigsByTargetId
    });
    const second = prepareRouteHandlerLazyMatchedRoute({
      targetId: 'blog',
      routePath,
      bootstrapGenerationToken,
      resolvedConfigsByTargetId
    });

    deferred.reject(new Error('analysis failed'));

    await expect(first).rejects.toThrow('analysis failed');
    await expect(second).rejects.toThrow('analysis failed');
    expect(analyzeRouteHandlerLazyMatchedRouteMock).toHaveBeenCalledTimes(1);
  });
});
