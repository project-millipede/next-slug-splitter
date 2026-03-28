import { beforeEach, describe, expect, test, vi } from 'vitest';

const loadRouteHandlersConfigOrRegisteredMock = vi.hoisted(() => vi.fn());
const resolveLocaleConfigFromInputOrRuntimeSemanticsMock = vi.hoisted(() =>
  vi.fn()
);
const resolveRouteHandlersAppContextMock = vi.hoisted(() => vi.fn());
const prepareRouteHandlersFromConfigMock = vi.hoisted(() => vi.fn());
const resolveRouteHandlersConfigsFromAppConfigMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../../next/internal/route-handlers-bootstrap'), () => ({
  loadRouteHandlersConfigOrRegistered: loadRouteHandlersConfigOrRegisteredMock,
  resolveLocaleConfigFromInputOrRuntimeSemantics:
    resolveLocaleConfigFromInputOrRuntimeSemanticsMock,
  resolveRouteHandlersAppContext: resolveRouteHandlersAppContextMock
}));

vi.mock(import('../../../next/prepare/index'), () => ({
  prepareRouteHandlersFromConfig: prepareRouteHandlersFromConfigMock
}));

vi.mock(import('../../../next/config/resolve-configs'), () => ({
  resolveRouteHandlersConfigsFromAppConfig:
    resolveRouteHandlersConfigsFromAppConfigMock
}));

import { loadResolvedRouteHandlersConfigs } from '../../../next/runtime/config';

const TEST_ROUTE_HANDLERS_CONFIG = {
  app: {
    rootDir: '/repo/app'
  }
} as const;

const TEST_APP_CONFIG = {
  rootDir: TEST_ROUTE_HANDLERS_CONFIG.app.rootDir,
  routing: {
    development: 'proxy' as const
  }
};

const TEST_APP_CONTEXT = {
  routeHandlersConfig: TEST_ROUTE_HANDLERS_CONFIG,
  appConfig: TEST_APP_CONFIG
};

describe('runtime config loading', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    loadRouteHandlersConfigOrRegisteredMock.mockResolvedValue(
      TEST_ROUTE_HANDLERS_CONFIG
    );
    resolveRouteHandlersAppContextMock.mockReturnValue(TEST_APP_CONTEXT);
    prepareRouteHandlersFromConfigMock.mockResolvedValue(undefined);
    resolveRouteHandlersConfigsFromAppConfigMock.mockReturnValue([
      {
        targetId: 'docs'
      }
    ]);
  });

  type Scenario = {
    id: string;
    description: string;
    inputLocaleConfig?: {
      locales: Array<string>;
      defaultLocale: string;
    };
    resolvedLocaleConfig: {
      locales: Array<string>;
      defaultLocale: string;
    };
  };

  const scenarios: ReadonlyArray<Scenario> = [
    {
      id: 'Input-Locale',
      description: 'uses the provided localeConfig without requiring a persisted semantics snapshot',
      inputLocaleConfig: {
        locales: ['en', 'de'],
        defaultLocale: 'en'
      },
      resolvedLocaleConfig: {
        locales: ['en', 'de'],
        defaultLocale: 'en'
      }
    },
    {
      id: 'Persisted-Snapshot',
      description: 'loads localeConfig from the persisted runtime semantics snapshot when localeConfig is not provided',
      resolvedLocaleConfig: {
        locales: ['en', 'fr'],
        defaultLocale: 'fr'
      }
    }
  ];

  test.for(scenarios)('[$id] $description', async ({
    inputLocaleConfig,
    resolvedLocaleConfig
  }) => {
    resolveLocaleConfigFromInputOrRuntimeSemanticsMock.mockResolvedValue(
      resolvedLocaleConfig
    );

    const result = await loadResolvedRouteHandlersConfigs({
      routeHandlersConfig: TEST_ROUTE_HANDLERS_CONFIG,
      localeConfig: inputLocaleConfig
    });

    expect(result).toEqual([
      {
        targetId: 'docs'
      }
    ]);
    expect(
      resolveLocaleConfigFromInputOrRuntimeSemanticsMock
    ).toHaveBeenCalledWith(
      TEST_ROUTE_HANDLERS_CONFIG.app.rootDir,
      inputLocaleConfig
    );
    expect(resolveRouteHandlersConfigsFromAppConfigMock).toHaveBeenCalledWith({
      appConfig: TEST_APP_CONFIG,
      localeConfig: resolvedLocaleConfig,
      routeHandlersConfig: TEST_ROUTE_HANDLERS_CONFIG
    });
  });

  test('fails when neither localeConfig nor a persisted runtime semantics snapshot is available', async () => {
    resolveLocaleConfigFromInputOrRuntimeSemanticsMock.mockResolvedValue(
      undefined
    );

    await expect(
      loadResolvedRouteHandlersConfigs({
        routeHandlersConfig: TEST_ROUTE_HANDLERS_CONFIG
      })
    ).rejects.toThrow(
      'Missing route-handler runtime semantics snapshot.'
    );
    expect(prepareRouteHandlersFromConfigMock).not.toHaveBeenCalled();
    expect(resolveRouteHandlersConfigsFromAppConfigMock).not.toHaveBeenCalled();
  });

  test('runs prepare before resolving target configs', async () => {
    const callOrder: Array<string> = [];

    resolveLocaleConfigFromInputOrRuntimeSemanticsMock.mockResolvedValue({
      locales: ['en'],
      defaultLocale: 'en'
    });
    prepareRouteHandlersFromConfigMock.mockImplementation(async () => {
      callOrder.push('prepare');
    });
    resolveRouteHandlersConfigsFromAppConfigMock.mockImplementation(() => {
      callOrder.push('resolve-configs');
      return [
        {
          targetId: 'docs'
        }
      ];
    });

    await loadResolvedRouteHandlersConfigs({
      rootDir: TEST_ROUTE_HANDLERS_CONFIG.app.rootDir,
      routeHandlersConfig: TEST_ROUTE_HANDLERS_CONFIG
    });

    expect(callOrder).toEqual(['prepare', 'resolve-configs']);
  });
});
