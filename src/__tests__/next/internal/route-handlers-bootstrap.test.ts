import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadRegisteredSlugSplitterConfigMock = vi.hoisted(() => vi.fn());
const resolveRouteHandlersAppConfigMock = vi.hoisted(() => vi.fn());
const readRouteHandlerRuntimeSemanticsMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../../next/integration/slug-splitter-config-loader'), () => ({
  loadRegisteredSlugSplitterConfig: loadRegisteredSlugSplitterConfigMock
}));

vi.mock(import('../../../next/config/app'), () => ({
  resolveRouteHandlersAppConfig: resolveRouteHandlersAppConfigMock
}));

vi.mock(import('../../../next/runtime-semantics/read'), () => ({
  readRouteHandlerRuntimeSemantics: readRouteHandlerRuntimeSemanticsMock
}));

import {
  loadRouteHandlersConfigOrRegistered,
  resolveLocaleConfigFromInputOrRuntimeSemantics,
  resolveRouteHandlersAppContext
} from '../../../next/internal/route-handlers-bootstrap';

const TEST_ROOT_DIR = '/tmp/app';
const TEST_ROUTE_HANDLERS_CONFIG = {
  app: {
    rootDir: TEST_ROOT_DIR
  }
} as const;

const TEST_APP_CONFIG = {
  rootDir: TEST_ROUTE_HANDLERS_CONFIG.app.rootDir,
  routing: {
    development: 'proxy' as const
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

  it('uses the explicit localeConfig without reading persisted runtime semantics', async () => {
    const explicitLocaleConfig = {
      locales: ['en', 'de'],
      defaultLocale: 'en'
    };

    const result = await resolveLocaleConfigFromInputOrRuntimeSemantics(
      TEST_ROOT_DIR,
      explicitLocaleConfig
    );

    expect(readRouteHandlerRuntimeSemanticsMock).not.toHaveBeenCalled();
    expect(result).toEqual(explicitLocaleConfig);
    expect(result).not.toBe(explicitLocaleConfig);
  });

  it('reads persisted runtime semantics exactly once when localeConfig is omitted', async () => {
    readRouteHandlerRuntimeSemanticsMock.mockResolvedValue({
      localeConfig: {
        locales: ['en', 'fr'],
        defaultLocale: 'fr'
      }
    });

    const result = await resolveLocaleConfigFromInputOrRuntimeSemantics(
      TEST_ROOT_DIR
    );

    expect(readRouteHandlerRuntimeSemanticsMock).toHaveBeenCalledTimes(1);
    expect(readRouteHandlerRuntimeSemanticsMock).toHaveBeenCalledWith(
      TEST_ROOT_DIR
    );
    expect(result).toEqual({
      locales: ['en', 'fr'],
      defaultLocale: 'fr'
    });
  });
});
