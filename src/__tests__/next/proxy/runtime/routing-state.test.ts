import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadRegisteredSlugSplitterConfigMock = vi.hoisted(() => vi.fn());
const resolveRouteHandlersAppConfigMock = vi.hoisted(() => vi.fn());
const resolveRouteHandlersConfigBasesMock = vi.hoisted(() => vi.fn());
const prepareRouteHandlersFromConfigMock = vi.hoisted(() => vi.fn());
const computePipelineFingerprintForConfigsMock = vi.hoisted(() => vi.fn());
const resolvePersistentCachePathMock = vi.hoisted(() => vi.fn());
const resolveSharedEmitFormatMock = vi.hoisted(() => vi.fn());
const readReusablePipelineCacheResultMock = vi.hoisted(() => vi.fn());
const executeResolvedRouteHandlerNextPipelineMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../next/integration/slug-splitter-config-loader', () => ({
  loadRegisteredSlugSplitterConfig: loadRegisteredSlugSplitterConfigMock
}));

vi.mock('../../../../next/config/app', () => ({
  resolveRouteHandlersAppConfig: resolveRouteHandlersAppConfigMock
}));

vi.mock('../../../../next/config/resolve-configs', () => ({
  resolveRouteHandlersConfigBases: resolveRouteHandlersConfigBasesMock
}));

vi.mock('../../../../next/prepare', () => ({
  prepareRouteHandlersFromConfig: prepareRouteHandlersFromConfigMock
}));

vi.mock('../../../../next/cache', () => ({
  computePipelineFingerprintForConfigs: computePipelineFingerprintForConfigsMock,
  resolvePersistentCachePath: resolvePersistentCachePathMock
}));

vi.mock('../../../../next/emit-format', () => ({
  resolveSharedEmitFormat: resolveSharedEmitFormatMock
}));

vi.mock('../../../../next/runtime/cache', () => ({
  readReusablePipelineCacheResult: readReusablePipelineCacheResultMock
}));

vi.mock('../../../../next/runtime', () => ({
  executeResolvedRouteHandlerNextPipeline:
    executeResolvedRouteHandlerNextPipelineMock
}));

import { getRouteHandlerProxyRoutingState } from '../../../../next/proxy/routing-state';

describe('proxy routing state', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    loadRegisteredSlugSplitterConfigMock.mockResolvedValue({
      routeBasePath: '/blog'
    });
    resolveRouteHandlersAppConfigMock.mockReturnValue({
      rootDir: '/tmp/app',
      nextConfigPath: '/tmp/app/next.config.mjs'
    });
    resolveRouteHandlersConfigBasesMock.mockReturnValue([
      {
        targetId: 'blog',
        routeBasePath: '/blog',
        emitFormat: 'ts',
        app: {
          rootDir: '/tmp/app',
          nextConfigPath: '/tmp/app/next.config.mjs'
        },
        paths: {
          rootDir: '/tmp/app',
          contentPagesDir: '/tmp/app/blog/src/pages',
          handlersDir: '/tmp/app/pages/blog/_handlers'
        }
      }
    ]);
    prepareRouteHandlersFromConfigMock.mockResolvedValue(undefined);
    computePipelineFingerprintForConfigsMock.mockResolvedValue('fingerprint');
    resolvePersistentCachePathMock.mockReturnValue(
      '/tmp/app/.next/cache/route-handlers.json'
    );
    resolveSharedEmitFormatMock.mockReturnValue('ts');
  });

  it('returns empty rewrites on a shared-cache miss instead of triggering whole-target generation', async () => {
    readReusablePipelineCacheResultMock.mockResolvedValue(undefined);

    const state = await getRouteHandlerProxyRoutingState({
      localeConfig: {
        locales: ['en'],
        defaultLocale: 'en'
      }
    });

    expect(state.rewriteBySourcePath.size).toBe(0);
    expect(state.targetRouteBasePaths).toEqual(['/blog']);
    expect(state.resolvedConfigsByTargetId.has('blog')).toBe(true);
    expect(executeResolvedRouteHandlerNextPipelineMock).not.toHaveBeenCalled();
  });

  it('reuses shared-cache rewrites when the persistent runtime record is fresh', async () => {
    readReusablePipelineCacheResultMock.mockResolvedValue({
      rewrites: [
        {
          source: '/blog/post',
          destination: '/en/blog/_handlers/post'
        }
      ]
    });

    const state = await getRouteHandlerProxyRoutingState({
      localeConfig: {
        locales: ['en'],
        defaultLocale: 'en'
      }
    });

    expect(state.rewriteBySourcePath.get('/blog/post')).toBe(
      '/en/blog/_handlers/post'
    );
    expect(executeResolvedRouteHandlerNextPipelineMock).not.toHaveBeenCalled();
  });
});
