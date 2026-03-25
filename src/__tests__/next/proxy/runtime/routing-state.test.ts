import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadRegisteredSlugSplitterConfigMock = vi.hoisted(() => vi.fn());
const resolveRouteHandlersAppConfigMock = vi.hoisted(() => vi.fn());
const resolveRouteHandlersConfigBasesMock = vi.hoisted(() => vi.fn());
const prepareRouteHandlersFromConfigMock = vi.hoisted(() => vi.fn());

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
  });

  it('returns resolved target metadata with no persisted rewrite map', async () => {
    const state = await getRouteHandlerProxyRoutingState({
      localeConfig: {
        locales: ['en'],
        defaultLocale: 'en'
      }
    });

    expect(state.rewriteBySourcePath.size).toBe(0);
    expect(state.targetRouteBasePaths).toEqual(['/blog']);
    expect(state.resolvedConfigsByTargetId.has('blog')).toBe(true);
  });

  it('returns a no-op state when no registered config is available', async () => {
    loadRegisteredSlugSplitterConfigMock.mockResolvedValue(null);

    const state = await getRouteHandlerProxyRoutingState({
      localeConfig: {
        locales: ['en'],
        defaultLocale: 'en'
      }
    });

    expect(state.rewriteBySourcePath.size).toBe(0);
    expect(state.targetRouteBasePaths).toEqual([]);
    expect(state.resolvedConfigsByTargetId.size).toBe(0);
    expect(prepareRouteHandlersFromConfigMock).not.toHaveBeenCalled();
  });
});
