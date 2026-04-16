import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadRegisteredSlugSplitterConfigMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../../next/integration/slug-splitter-config-loader'), () => ({
  loadRegisteredSlugSplitterConfig: loadRegisteredSlugSplitterConfigMock
}));

import { loadRouteHandlersConfigOrRegistered } from '../../../next/integration/route-handlers-config';

const TEST_ROUTE_HANDLERS_CONFIG = {
  routerKind: 'pages',
  app: {
    rootDir: '/tmp/app'
  }
} as const;

describe('integration route-handlers config helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the explicit routeHandlersConfig without loading the registered one again', async () => {
    const routeHandlersConfig = TEST_ROUTE_HANDLERS_CONFIG;

    await expect(
      loadRouteHandlersConfigOrRegistered(routeHandlersConfig)
    ).resolves.toBe(routeHandlersConfig);
    expect(loadRegisteredSlugSplitterConfigMock).not.toHaveBeenCalled();
  });

  it('loads the registered routeHandlersConfig when no explicit config is provided', async () => {
    loadRegisteredSlugSplitterConfigMock.mockResolvedValue(
      TEST_ROUTE_HANDLERS_CONFIG
    );

    await expect(loadRouteHandlersConfigOrRegistered()).resolves.toBe(
      TEST_ROUTE_HANDLERS_CONFIG
    );
    expect(loadRegisteredSlugSplitterConfigMock).toHaveBeenCalledTimes(1);
  });
});
