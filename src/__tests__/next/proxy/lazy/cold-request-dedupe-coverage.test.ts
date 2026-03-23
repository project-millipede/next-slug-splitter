import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createDeferred } from '../../../helpers/deferred';

const analyzeRouteHandlerLazyMatchedRouteMock = vi.hoisted(() => vi.fn());
const emitRouteHandlerLazySingleHandlerMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../next/proxy/lazy/single-route-analysis', () => ({
  analyzeRouteHandlerLazyMatchedRoute: analyzeRouteHandlerLazyMatchedRouteMock
}));

vi.mock('../../../../next/proxy/lazy/single-handler-emission', () => ({
  emitRouteHandlerLazySingleHandler: emitRouteHandlerLazySingleHandlerMock
}));

import { prepareRouteHandlerLazyMatchedRoute } from '../../../../next/proxy/lazy/cold-request-dedupe';

const localeConfig = { locales: ['en'], defaultLocale: 'en' };
const routePath = { locale: 'en', slugArray: ['post'], filePath: '/tmp/post.mdx' };

describe('cold-request dedupe — unit', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts independent analysis for different target/file keys', async () => {
    analyzeRouteHandlerLazyMatchedRouteMock.mockResolvedValue({ kind: 'light' });

    await prepareRouteHandlerLazyMatchedRoute('blog', localeConfig, routePath);
    await prepareRouteHandlerLazyMatchedRoute('docs', localeConfig, routePath);

    expect(analyzeRouteHandlerLazyMatchedRouteMock).toHaveBeenCalledTimes(2);
  });

  it('clears dedupe slot after settlement so next call starts fresh', async () => {
    analyzeRouteHandlerLazyMatchedRouteMock.mockResolvedValue({ kind: 'light' });

    await prepareRouteHandlerLazyMatchedRoute('blog', localeConfig, routePath);
    await prepareRouteHandlerLazyMatchedRoute('blog', localeConfig, routePath);

    expect(analyzeRouteHandlerLazyMatchedRouteMock).toHaveBeenCalledTimes(2);
  });

  it('clears dedupe slot even when analysis rejects', async () => {
    analyzeRouteHandlerLazyMatchedRouteMock.mockRejectedValueOnce(
      new Error('analysis failed')
    );
    analyzeRouteHandlerLazyMatchedRouteMock.mockResolvedValue({ kind: 'light' });

    await expect(
      prepareRouteHandlerLazyMatchedRoute('blog', localeConfig, routePath)
    ).rejects.toThrow('analysis failed');

    // Slot was cleared — second call starts a fresh analysis
    const result = await prepareRouteHandlerLazyMatchedRoute(
      'blog',
      localeConfig,
      routePath
    );

    expect(analyzeRouteHandlerLazyMatchedRouteMock).toHaveBeenCalledTimes(2);
    expect(result?.kind).toBe('light');
  });
});

describe('cold-request dedupe — composite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emitRouteHandlerLazySingleHandlerMock.mockResolvedValue({
      status: 'written',
      renderedPage: {}
    });
  });

  it('returns { kind: "light" } without emission for light routes', async () => {
    const analysisResult = { kind: 'light', source: 'fresh' };
    analyzeRouteHandlerLazyMatchedRouteMock.mockResolvedValue(analysisResult);

    const result = await prepareRouteHandlerLazyMatchedRoute(
      'blog',
      localeConfig,
      routePath
    );

    expect(result).toEqual({ kind: 'light', analysisResult });
    expect(emitRouteHandlerLazySingleHandlerMock).not.toHaveBeenCalled();
  });

  it('returns { kind: "heavy" } and emits handler for heavy routes', async () => {
    const analysisResult = { kind: 'heavy', source: 'fresh' };
    analyzeRouteHandlerLazyMatchedRouteMock.mockResolvedValue(analysisResult);

    const result = await prepareRouteHandlerLazyMatchedRoute(
      'blog',
      localeConfig,
      routePath
    );

    expect(result).toEqual({ kind: 'heavy', analysisResult });
    expect(emitRouteHandlerLazySingleHandlerMock).toHaveBeenCalledWith({
      analysisResult
    });
  });

  it('returns null without emission when analysis returns null', async () => {
    analyzeRouteHandlerLazyMatchedRouteMock.mockResolvedValue(null);

    const result = await prepareRouteHandlerLazyMatchedRoute(
      'blog',
      localeConfig,
      routePath
    );

    expect(result).toBeNull();
    expect(emitRouteHandlerLazySingleHandlerMock).not.toHaveBeenCalled();
  });

  it('returns identical result to both concurrent callers', async () => {
    const deferred = createDeferred<{ kind: 'heavy'; source: 'fresh' }>();
    analyzeRouteHandlerLazyMatchedRouteMock.mockReturnValue(deferred.promise);

    const first = prepareRouteHandlerLazyMatchedRoute(
      'blog',
      localeConfig,
      routePath
    );
    const second = prepareRouteHandlerLazyMatchedRoute(
      'blog',
      localeConfig,
      routePath
    );

    deferred.resolve({ kind: 'heavy', source: 'fresh' });

    const [r1, r2] = await Promise.all([first, second]);

    expect(r1).toEqual(r2);
    expect(analyzeRouteHandlerLazyMatchedRouteMock).toHaveBeenCalledTimes(1);
  });

  it('propagates analysis error to both concurrent callers', async () => {
    const deferred = createDeferred<never>();
    analyzeRouteHandlerLazyMatchedRouteMock.mockReturnValue(deferred.promise);

    const first = prepareRouteHandlerLazyMatchedRoute(
      'blog',
      localeConfig,
      routePath
    );
    const second = prepareRouteHandlerLazyMatchedRoute(
      'blog',
      localeConfig,
      routePath
    );

    deferred.reject(new Error('analysis failed'));

    await expect(first).rejects.toThrow('analysis failed');
    await expect(second).rejects.toThrow('analysis failed');
    expect(analyzeRouteHandlerLazyMatchedRouteMock).toHaveBeenCalledTimes(1);
  });
});
