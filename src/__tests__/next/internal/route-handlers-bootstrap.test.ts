import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadRegisteredSlugSplitterConfigMock = vi.hoisted(() => vi.fn());
const resolveRouteHandlersAppConfigMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../../next/integration/slug-splitter-config-loader'), () => ({
  loadRegisteredSlugSplitterConfig: loadRegisteredSlugSplitterConfigMock
}));

vi.mock(import('../../../next/shared/config/app'), () => ({
  resolveRouteHandlersAppConfig: resolveRouteHandlersAppConfigMock
}));

import {
  loadRouteHandlersConfigOrRegistered,
  resolveRouteHandlersAppContext
} from '../../../next/shared/bootstrap/route-handlers-bootstrap';

const TEST_ROOT_DIR = '/tmp/app';
const TEST_ROUTE_HANDLERS_CONFIG = {
  app: {
    rootDir: TEST_ROOT_DIR
  }
} as const;

const TEST_APP_CONFIG = {
  rootDir: TEST_ROUTE_HANDLERS_CONFIG.app.rootDir,
  routing: {
    development: 'proxy' as const,
    workerPrewarm: 'off' as const
  }
};

describe('route-handlers bootstrap helpers', () => {
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

  it('resolves app context through resolveRouteHandlersAppConfig with the explicit route-handlers inputs', () => {
    const routeHandlersConfig = TEST_ROUTE_HANDLERS_CONFIG;
    resolveRouteHandlersAppConfigMock.mockReturnValue(TEST_APP_CONFIG);

    const result = resolveRouteHandlersAppContext(
      routeHandlersConfig,
      TEST_ROOT_DIR
    );

    expect(resolveRouteHandlersAppConfigMock).toHaveBeenCalledWith({
      rootDir: TEST_ROOT_DIR,
      routeHandlersConfig
    });
    expect(result).toEqual({
      routeHandlersConfig,
      appConfig: TEST_APP_CONFIG
    });
  });
});
