import { PHASE_PRODUCTION_BUILD } from 'next/constants.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { NextAdapter, NextConfig } from 'next';

const loadRouteHandlersConfigOrRegisteredMock = vi.hoisted(() => vi.fn());
const prepareRouteHandlersFromConfigMock = vi.hoisted(() => vi.fn());
const resolveRouteHandlersConfigsFromAppConfigMock = vi.hoisted(() => vi.fn());
const resolveAppRouteHandlersConfigsFromAppConfigMock = vi.hoisted(() =>
  vi.fn()
);
const resolveRouteHandlersAppContextMock = vi.hoisted(() => vi.fn());
const resolveRouteHandlerRoutingStrategyMock = vi.hoisted(() => vi.fn());
const synchronizeRouteHandlerProxyFileMock = vi.hoisted(() => vi.fn());
const synchronizeRouteHandlerInstrumentationFileMock = vi.hoisted(() =>
  vi.fn()
);
const synchronizeRouteHandlerPhaseArtifactsMock = vi.hoisted(() => vi.fn());
const executeResolvedRouteHandlerNextPipelineMock = vi.hoisted(() => vi.fn());
const executeResolvedAppRouteHandlerNextPipelineMock = vi.hoisted(() =>
  vi.fn()
);
const withRouteHandlerRewritesMock = vi.hoisted(() => vi.fn());
const writeRouteHandlerLookupSnapshotMock = vi.hoisted(() => vi.fn());
const createAppRouteLookupSnapshotMock = vi.hoisted(() => vi.fn());
const writeAppRouteLookupSnapshotMock = vi.hoisted(() => vi.fn());
const createRouteHandlerProxyBootstrapManifestMock = vi.hoisted(() => vi.fn());
const writeRouteHandlerProxyBootstrapMock = vi.hoisted(() => vi.fn());
const SLUG_SPLITTER_NEXT_ADAPTER_SYMBOL = Symbol.for(
  'next-slug-splitter/next/adapter'
);

vi.mock(import('../../next/shared/bootstrap/route-handlers-bootstrap'), () => ({
  resolveRouteHandlersAppContext: resolveRouteHandlersAppContextMock
}));

vi.mock(import('../../next/integration/route-handlers-config'), () => ({
  loadRouteHandlersConfigOrRegistered: loadRouteHandlersConfigOrRegisteredMock
}));

vi.mock(import('../../next/shared/prepare/index'), () => ({
  prepareRouteHandlersFromConfig: prepareRouteHandlersFromConfigMock
}));

vi.mock(import('../../next/pages/config/resolve-configs'), () => ({
  resolveRouteHandlersConfigsFromAppConfig:
    resolveRouteHandlersConfigsFromAppConfigMock
}));

vi.mock(import('../../next/app/config/resolve-configs'), () => ({
  resolveRouteHandlersConfigsFromAppConfig:
    resolveAppRouteHandlersConfigsFromAppConfigMock
}));

vi.mock(import('../../next/shared/policy/routing-strategy'), () => ({
  resolveRouteHandlerRoutingStrategy: resolveRouteHandlerRoutingStrategyMock
}));

vi.mock(import('../../next/proxy/file-lifecycle'), () => ({
  synchronizeRouteHandlerProxyFile: synchronizeRouteHandlerProxyFileMock
}));

vi.mock(import('../../next/proxy/instrumentation/file-lifecycle'), () => ({
  synchronizeRouteHandlerInstrumentationFile:
    synchronizeRouteHandlerInstrumentationFileMock
}));

vi.mock(import('../../next/shared/phase-artifacts'), () => ({
  synchronizeRouteHandlerPhaseArtifacts:
    synchronizeRouteHandlerPhaseArtifactsMock
}));

vi.mock(import('../../next/pages/runtime'), () => ({
  executeResolvedRouteHandlerNextPipeline:
    executeResolvedRouteHandlerNextPipelineMock
}));

vi.mock(import('../../next/app/runtime'), () => ({
  executeResolvedRouteHandlerNextPipeline:
    executeResolvedAppRouteHandlerNextPipelineMock
}));

vi.mock(import('../../next/shared/rewrites/plugin'), () => ({
  withRouteHandlerRewrites: withRouteHandlerRewritesMock
}));

vi.mock(import('../../next/shared/lookup-persisted'), () => ({
  createRouteHandlerLookupSnapshot: vi.fn(
    (
      filterHeavyRoutesFromStaticRouteResult: boolean,
      results: Array<{
        targetId: string;
        heavyPaths?: Array<unknown>;
      }>,
      {
        localeConfig
      }: {
        localeConfig: {
          locales: Array<string>;
          defaultLocale: string;
        };
      }
    ) => ({
      version: 6,
      filterHeavyRoutesFromStaticRouteResult,
      localeConfig,
      targets: results.map(result => ({
        targetId: result.targetId,
        heavyRoutePathKeys: result.heavyPaths == null ? [] : ['serialized']
      }))
    })
  ),
  writeRouteHandlerLookupSnapshot: writeRouteHandlerLookupSnapshotMock
}));

vi.mock(import('../../next/app/lookup-persisted'), () => ({
  createAppRouteLookupSnapshot: createAppRouteLookupSnapshotMock,
  writeAppRouteLookupSnapshot: writeAppRouteLookupSnapshotMock
}));

vi.mock(import('../../next/proxy/bootstrap-persisted'), () => ({
  createRouteHandlerProxyBootstrapGenerationToken: vi.fn(
    () => 'route-handler-proxy-bootstrap-test'
  ),
  createRouteHandlerProxyBootstrapManifest:
    createRouteHandlerProxyBootstrapManifestMock,
  writeRouteHandlerProxyBootstrap: writeRouteHandlerProxyBootstrapMock
}));

import routeHandlersAdapter from '../../next/adapter';
import { createSingleLocaleConfig } from '../../core/locale-config';
import { absoluteModule } from '../../module-reference';
import { registerNextAdapter } from '../../next/integration';
import { TEST_SLUG_CATCH_ALL_ROUTE_PARAM } from '../helpers/fixtures';

const TEST_ROUTE_HANDLERS_CONFIG = {
  routerKind: 'pages' as const,
  app: {
    rootDir: '/repo/app'
  }
} as const;

const TEST_APP_CONFIG = {
  rootDir: TEST_ROUTE_HANDLERS_CONFIG.app.rootDir,
  routing: {
    development: 'proxy' as const,
    workerPrewarm: 'off' as const
  }
};

const TEST_APP_CONTEXT = {
  routeHandlersConfig: TEST_ROUTE_HANDLERS_CONFIG,
  appConfig: TEST_APP_CONFIG
};

const TEST_NEXT_CONFIG: NextConfig = {
  i18n: {
    locales: ['en', 'fr'],
    defaultLocale: 'fr'
  }
};

const TEST_MODIFY_CONFIG_CONTEXT = {
  phase: PHASE_PRODUCTION_BUILD,
  nextVersion: '16.2.0'
};

const TEST_RESOLVED_PAGES_TARGET = {
  targetId: 'docs',
  routeBasePath: '/docs',
  handlerRouteSegment: 'generated-handlers'
} as const;

/**
 * Test-facing modifyConfig signature built from public Next types only.
 *
 * The narrowed shape stays cast-compatible for two reasons:
 *
 * 1. Config Input
 *    The real hook consumes Next's internal resolved config, a subtype of the
 *    public `NextConfig`, so a `NextConfig` parameter widens safely.
 *
 * 2. Result Type
 *    The tests never consume the resolved config result, so `Promise<never>`
 *    is the only return type assignable to the real hook's return without
 *    naming Next's internal complete-config type.
 */
type StubModifyConfig = (
  config: NextConfig,
  context: {
    phase: string;
    nextVersion: string;
  }
) => Promise<never>;

/**
 * Invoke the adapter's modifyConfig hook with the production-build context.
 *
 * @param config - Public-typed Next config fixture for the invocation.
 * @returns Promise resolving after the hook completes.
 */
const runModifyConfig = async (config: NextConfig): Promise<void> => {
  const modifyConfig = routeHandlersAdapter.modifyConfig as
    | StubModifyConfig
    | undefined;

  expect(modifyConfig).toBeTypeOf('function');

  await modifyConfig?.(config, TEST_MODIFY_CONFIG_CONTEXT);
};

describe('route handlers adapter', () => {
  beforeEach(() => {
    const globalScope = globalThis as typeof globalThis & {
      [SLUG_SPLITTER_NEXT_ADAPTER_SYMBOL]?: {
        adapter?: unknown;
      };
    };

    delete globalScope[SLUG_SPLITTER_NEXT_ADAPTER_SYMBOL];
    vi.clearAllMocks();

    loadRouteHandlersConfigOrRegisteredMock.mockResolvedValue(
      TEST_ROUTE_HANDLERS_CONFIG
    );
    resolveRouteHandlersAppContextMock.mockReturnValue(TEST_APP_CONTEXT);
    prepareRouteHandlersFromConfigMock.mockResolvedValue(undefined);
    resolveRouteHandlersConfigsFromAppConfigMock.mockReturnValue([
      TEST_RESOLVED_PAGES_TARGET
    ]);
    resolveAppRouteHandlersConfigsFromAppConfigMock.mockResolvedValue([]);
    resolveRouteHandlerRoutingStrategyMock.mockReturnValue({
      kind: 'rewrites'
    });
    synchronizeRouteHandlerPhaseArtifactsMock.mockResolvedValue(undefined);
    synchronizeRouteHandlerProxyFileMock.mockResolvedValue(undefined);
    synchronizeRouteHandlerInstrumentationFileMock.mockResolvedValue(undefined);
    executeResolvedRouteHandlerNextPipelineMock.mockResolvedValue([
      {
        targetId: 'docs',
        analyzedCount: 0,
        heavyCount: 0,
        heavyPaths: [],
        rewrites: [],
        rewritesOfDefaultLocale: []
      }
    ]);
    executeResolvedAppRouteHandlerNextPipelineMock.mockResolvedValue([]);
    withRouteHandlerRewritesMock.mockImplementation(config => config);
    writeRouteHandlerLookupSnapshotMock.mockResolvedValue(undefined);
    createAppRouteLookupSnapshotMock.mockImplementation(targets => ({
      version: 1,
      targets
    }));
    writeAppRouteLookupSnapshotMock.mockResolvedValue(undefined);
    createRouteHandlerProxyBootstrapManifestMock.mockReturnValue({
      version: 3,
      bootstrapGenerationToken: 'route-handler-proxy-bootstrap-test',
      localeConfig: {
        locales: ['en', 'fr'],
        defaultLocale: 'fr'
      },
      targets: []
    });
    writeRouteHandlerProxyBootstrapMock.mockResolvedValue(undefined);
  });

  it('runs a registered user adapter before slug-splitter modifyConfig work', async () => {
    /**
     * Named traces of the user adapter stage and the built-in rewrite
     * installation, so composition order and config chaining are asserted
     * through object identity instead of marker fields.
     */
    const userAdapterTrace: {
      receivedConfig?: NextConfig;
      receivedContext?: unknown;
      returnedConfig?: NextConfig;
    } = {};
    const rewriteInstallTrace: {
      receivedConfig?: unknown;
    } = {};

    const userAdapter: NextAdapter = {
      name: 'user-adapter',
      modifyConfig: (config, context) => {
        const adaptedConfig = { ...config };

        userAdapterTrace.receivedConfig = config;
        userAdapterTrace.receivedContext = context;
        userAdapterTrace.returnedConfig = adaptedConfig;

        return adaptedConfig;
      }
    };

    withRouteHandlerRewritesMock.mockImplementation(config => {
      rewriteInstallTrace.receivedConfig = config;
      return config;
    });
    registerNextAdapter(userAdapter);

    await runModifyConfig(TEST_NEXT_CONFIG);

    expect(userAdapterTrace.receivedConfig).toBe(TEST_NEXT_CONFIG);
    expect(userAdapterTrace.receivedContext).toBe(TEST_MODIFY_CONFIG_CONTEXT);
    expect(rewriteInstallTrace.receivedConfig).toBe(
      userAdapterTrace.returnedConfig
    );
  });

  it('does not expose onBuildComplete when no composed adapter implements it', () => {
    expect(routeHandlersAdapter.onBuildComplete).toBeUndefined();

    registerNextAdapter({
      name: 'user-adapter'
    });

    expect(routeHandlersAdapter.onBuildComplete).toBeUndefined();
  });

  it('forwards onBuildComplete when the registered user adapter implements it', async () => {
    type OnBuildComplete = NonNullable<
      typeof routeHandlersAdapter.onBuildComplete
    >;
    /**
     * The composed hook forwards the build-complete context by reference
     * without reading it, so the test invokes through a narrowed signature
     * carrying only an identity marker instead of Next's full context type.
     */
    type StubOnBuildComplete = (context: {
      distDir: string;
    }) => Promise<void> | void;

    const userOnBuildComplete = vi.fn<OnBuildComplete>();

    registerNextAdapter({
      name: 'user-adapter',
      onBuildComplete: userOnBuildComplete
    });

    const composedOnBuildComplete = routeHandlersAdapter.onBuildComplete as
      | StubOnBuildComplete
      | undefined;
    const buildCompleteContext = {
      distDir: '/tmp/app/.next'
    };

    expect(composedOnBuildComplete).toBeTypeOf('function');

    await composedOnBuildComplete?.(buildCompleteContext);

    expect(userOnBuildComplete).toHaveBeenCalledWith(buildCompleteContext);
  });

  it('derives locale semantics from the resolved Next config during adapter execution', async () => {
    const routeHandlersConfig = TEST_ROUTE_HANDLERS_CONFIG;

    loadRouteHandlersConfigOrRegisteredMock.mockResolvedValue(
      routeHandlersConfig
    );
    resolveRouteHandlersAppContextMock.mockReturnValue({
      ...TEST_APP_CONTEXT,
      routeHandlersConfig
    });

    await runModifyConfig(TEST_NEXT_CONFIG);

    expect(prepareRouteHandlersFromConfigMock).toHaveBeenCalledWith(
      TEST_ROUTE_HANDLERS_CONFIG.app.rootDir,
      routeHandlersConfig
    );
    expect(resolveRouteHandlersConfigsFromAppConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({
        rootDir: TEST_ROUTE_HANDLERS_CONFIG.app.rootDir
      }),
      {
        locales: ['en', 'fr'],
        defaultLocale: 'fr'
      },
      routeHandlersConfig
    );
    expect(synchronizeRouteHandlerPhaseArtifactsMock).toHaveBeenCalled();
    expect(synchronizeRouteHandlerProxyFileMock).toHaveBeenCalled();
    expect(synchronizeRouteHandlerInstrumentationFileMock).toHaveBeenCalled();
    expect(writeRouteHandlerLookupSnapshotMock).toHaveBeenCalledWith(
      TEST_ROUTE_HANDLERS_CONFIG.app.rootDir,
      {
        version: 6,
        filterHeavyRoutesFromStaticRouteResult: true,
        localeConfig: {
          locales: ['en', 'fr'],
          defaultLocale: 'fr'
        },
        targets: [
          {
            targetId: 'docs',
            heavyRoutePathKeys: ['serialized']
          }
        ]
      }
    );
  });

  it('writes a dev lookup snapshot that disables page-time filtering in proxy mode', async () => {
    resolveRouteHandlerRoutingStrategyMock.mockReturnValue({
      kind: 'proxy'
    });

    await runModifyConfig(TEST_NEXT_CONFIG);

    expect(executeResolvedRouteHandlerNextPipelineMock).not.toHaveBeenCalled();
    expect(createRouteHandlerProxyBootstrapManifestMock).toHaveBeenCalledWith(
      'route-handler-proxy-bootstrap-test',
      {
        locales: ['en', 'fr'],
        defaultLocale: 'fr'
      },
      [
        {
          targetId: 'docs',
          routeBasePath: '/docs',
          handlerRouteSegment: 'generated-handlers'
        }
      ]
    );
    expect(writeRouteHandlerProxyBootstrapMock).toHaveBeenCalledWith(
      TEST_ROUTE_HANDLERS_CONFIG.app.rootDir,
      {
        version: 3,
        bootstrapGenerationToken: 'route-handler-proxy-bootstrap-test',
        localeConfig: {
          locales: ['en', 'fr'],
          defaultLocale: 'fr'
        },
        targets: []
      }
    );
    expect(writeRouteHandlerLookupSnapshotMock).toHaveBeenCalledWith(
      TEST_ROUTE_HANDLERS_CONFIG.app.rootDir,
      {
        version: 6,
        filterHeavyRoutesFromStaticRouteResult: false,
        localeConfig: {
          locales: ['en', 'fr'],
          defaultLocale: 'fr'
        },
        targets: []
      }
    );
  });

  it('writes explicit empty proxy bootstrap artifacts when proxy mode resolves zero targets', async () => {
    resolveRouteHandlerRoutingStrategyMock.mockReturnValue({
      kind: 'proxy'
    });
    resolveRouteHandlersConfigsFromAppConfigMock.mockReturnValue([]);

    await runModifyConfig(TEST_NEXT_CONFIG);

    expect(createRouteHandlerProxyBootstrapManifestMock).toHaveBeenCalledWith(
      'route-handler-proxy-bootstrap-test',
      {
        locales: ['en', 'fr'],
        defaultLocale: 'fr'
      },
      []
    );
    expect(writeRouteHandlerProxyBootstrapMock).toHaveBeenCalled();
    expect(writeRouteHandlerLookupSnapshotMock).toHaveBeenCalledWith(
      TEST_ROUTE_HANDLERS_CONFIG.app.rootDir,
      {
        version: 6,
        filterHeavyRoutesFromStaticRouteResult: false,
        localeConfig: {
          locales: ['en', 'fr'],
          defaultLocale: 'fr'
        },
        targets: []
      }
    );
  });

  it('uses the shared proxy bootstrap path for App Router configs in proxy mode', async () => {
    const runtimeRouteModulePath = `${process.cwd()}/src/next/index.ts`;
    const pageDataCompilerModulePath = runtimeRouteModulePath;
    const appRouteHandlersConfig = {
      routerKind: 'app' as const,
      app: {
        rootDir: '/repo/app',
        localeConfig: {
          locales: ['fr', 'de'],
          defaultLocale: 'fr'
        }
      }
    };

    resolveRouteHandlerRoutingStrategyMock.mockReturnValue({
      kind: 'proxy'
    });
    loadRouteHandlersConfigOrRegisteredMock.mockResolvedValue(
      appRouteHandlersConfig
    );
    resolveRouteHandlersAppContextMock.mockReturnValue({
      routeHandlersConfig: appRouteHandlersConfig,
      appConfig: {
        ...TEST_APP_CONFIG,
        rootDir: '/repo/app',
        localeRouteParamName: 'locale'
      }
    });
    resolveAppRouteHandlersConfigsFromAppConfigMock.mockResolvedValue([
      {
        targetId: 'docs',
        routerKind: 'app',
        routeBasePath: '/docs',
        handlerRouteSegment: 'generated-handlers',
        app: {
          rootDir: '/repo/app',
          localeRouteParamName: 'locale'
        },
        handlerRouteParam: TEST_SLUG_CATCH_ALL_ROUTE_PARAM,
        routeContract: absoluteModule(runtimeRouteModulePath),
        pageDataCompilerConfig: {
          pageDataCompilerImport: absoluteModule(pageDataCompilerModulePath)
        },
        routeModule: {
          hasGeneratePageMetadata: false,
          revalidate: false
        },
        paths: {
          rootDir: '/repo/app',
          contentDir: '/repo/app/content/pages',
          generatedDir: '/repo/app/app/[locale]/docs/generated-handlers'
        }
      }
    ]);

    await runModifyConfig(TEST_NEXT_CONFIG);

    expect(createRouteHandlerProxyBootstrapManifestMock).toHaveBeenCalledWith(
      'route-handler-proxy-bootstrap-test',
      {
        locales: ['fr', 'de'],
        defaultLocale: 'fr'
      },
      [
        expect.objectContaining({
          targetId: 'docs',
          routerKind: 'app',
          handlerRouteParam: TEST_SLUG_CATCH_ALL_ROUTE_PARAM,
          routeContract: absoluteModule(runtimeRouteModulePath)
        })
      ]
    );
    expect(writeRouteHandlerLookupSnapshotMock).toHaveBeenCalledWith(
      '/repo/app',
      {
        version: 6,
        filterHeavyRoutesFromStaticRouteResult: false,
        localeConfig: {
          locales: ['fr', 'de'],
          defaultLocale: 'fr'
        },
        targets: []
      }
    );
    expect(writeAppRouteLookupSnapshotMock).toHaveBeenCalledWith('/repo/app', {
      version: 1,
      targets: [
        {
          targetId: 'docs',
          handlerRouteParamName: 'slug',
          localeRouteParamName: 'locale',
          pageDataCompilerModulePath
        }
      ]
    });
    expect(
      executeResolvedAppRouteHandlerNextPipelineMock
    ).not.toHaveBeenCalled();
  });

  it('does not write proxy bootstrap artifacts in rewrite mode', async () => {
    resolveRouteHandlerRoutingStrategyMock.mockReturnValue({
      kind: 'rewrites'
    });

    await runModifyConfig(TEST_NEXT_CONFIG);

    expect(createRouteHandlerProxyBootstrapManifestMock).not.toHaveBeenCalled();
    expect(writeRouteHandlerProxyBootstrapMock).not.toHaveBeenCalled();
    expect(executeResolvedRouteHandlerNextPipelineMock).toHaveBeenCalledTimes(
      1
    );
  });

  it('installs Pages generated-handler guards and heavy rewrites in beforeFiles only', async () => {
    executeResolvedRouteHandlerNextPipelineMock.mockResolvedValue([
      {
        targetId: 'docs',
        analyzedCount: 1,
        heavyCount: 1,
        heavyPaths: [],
        rewrites: [
          {
            source: '/docs/heavy',
            destination: '/docs/generated-handlers/heavy/fr',
            locale: false
          }
        ],
        rewritesOfDefaultLocale: [
          {
            source: '/fr/docs/heavy',
            destination: '/docs/generated-handlers/heavy/fr',
            locale: false
          }
        ]
      }
    ]);

    await runModifyConfig(TEST_NEXT_CONFIG);

    expect(withRouteHandlerRewritesMock).toHaveBeenCalledWith(
      TEST_NEXT_CONFIG,
      {
        beforeFiles: [
          {
            source: '/docs/generated-handlers/:path*',
            destination: '/404',
            locale: false
          },
          {
            source: '/:locale(en|fr)/docs/generated-handlers/:path*',
            destination: '/404',
            locale: false
          },
          {
            source: '/docs/heavy',
            destination: '/docs/generated-handlers/heavy/fr',
            locale: false
          },
          {
            source: '/fr/docs/heavy',
            destination: '/docs/generated-handlers/heavy/fr',
            locale: false
          }
        ],
        afterFiles: []
      }
    );
  });

  it('writes structural App lookup metadata without invoking page-data execution', async () => {
    const runtimeRouteModulePath = `${process.cwd()}/src/next/index.ts`;
    const pageDataCompilerModulePath = runtimeRouteModulePath;
    const appRouteHandlersConfig = {
      routerKind: 'app' as const,
      app: {
        rootDir: '/repo/app'
      }
    };

    loadRouteHandlersConfigOrRegisteredMock.mockResolvedValue(
      appRouteHandlersConfig
    );
    resolveRouteHandlersAppContextMock.mockReturnValue({
      routeHandlersConfig: appRouteHandlersConfig,
      appConfig: {
        ...TEST_APP_CONFIG,
        rootDir: '/repo/app'
      }
    });
    resolveAppRouteHandlersConfigsFromAppConfigMock.mockResolvedValue([
      {
        targetId: 'docs',
        routeBasePath: '/docs',
        handlerRouteSegment: 'generated-handlers',
        app: {
          rootDir: '/repo/app'
        },
        handlerRouteParam: TEST_SLUG_CATCH_ALL_ROUTE_PARAM,
        pageDataCompilerConfig: {
          pageDataCompilerImport: absoluteModule(pageDataCompilerModulePath)
        },
        routeContract: absoluteModule(runtimeRouteModulePath),
        routeModule: {
          hasGeneratePageMetadata: false
        }
      }
    ]);
    executeResolvedAppRouteHandlerNextPipelineMock.mockResolvedValue([
      {
        targetId: 'docs',
        analyzedCount: 0,
        heavyCount: 0,
        heavyPaths: [],
        rewrites: [],
        rewritesOfDefaultLocale: []
      }
    ]);

    await runModifyConfig(TEST_NEXT_CONFIG);

    expect(writeRouteHandlerLookupSnapshotMock).toHaveBeenCalledWith(
      '/repo/app',
      {
        version: 6,
        filterHeavyRoutesFromStaticRouteResult: true,
        localeConfig: createSingleLocaleConfig(),
        targets: [
          {
            targetId: 'docs',
            heavyRoutePathKeys: ['serialized']
          }
        ]
      }
    );
    expect(writeAppRouteLookupSnapshotMock).toHaveBeenCalledWith('/repo/app', {
      version: 1,
      targets: [
        {
          targetId: 'docs',
          handlerRouteParamName: 'slug',
          pageDataCompilerModulePath
        }
      ]
    });
    expect(
      executeResolvedAppRouteHandlerNextPipelineMock
    ).toHaveBeenCalledTimes(1);
    expect(executeResolvedRouteHandlerNextPipelineMock).not.toHaveBeenCalled();
  });

  it('installs App guards and heavy rewrites before App normalization afterFiles', async () => {
    const appRouteHandlersConfig = {
      routerKind: 'app' as const,
      app: {
        rootDir: '/repo/app',
        localeConfig: {
          locales: ['en', 'de'],
          defaultLocale: 'en'
        }
      }
    };

    loadRouteHandlersConfigOrRegisteredMock.mockResolvedValue(
      appRouteHandlersConfig
    );
    resolveRouteHandlersAppContextMock.mockReturnValue({
      routeHandlersConfig: appRouteHandlersConfig,
      appConfig: {
        ...TEST_APP_CONFIG,
        rootDir: '/repo/app',
        localeRouteParamName: 'locale'
      }
    });
    resolveAppRouteHandlersConfigsFromAppConfigMock.mockResolvedValue([
      {
        targetId: 'docs',
        routerKind: 'app',
        routeBasePath: '/docs',
        handlerRouteSegment: 'generated-handlers',
        localeConfig: {
          locales: ['en', 'de'],
          defaultLocale: 'en'
        },
        app: {
          rootDir: '/repo/app',
          localeRouteParamName: 'locale'
        },
        handlerRouteParam: TEST_SLUG_CATCH_ALL_ROUTE_PARAM
      }
    ]);
    executeResolvedAppRouteHandlerNextPipelineMock.mockResolvedValue([
      {
        targetId: 'docs',
        analyzedCount: 1,
        heavyCount: 1,
        heavyPaths: [],
        rewrites: [
          {
            source: '/docs/heavy',
            destination: '/en/docs/generated-handlers/heavy/en',
            locale: false
          }
        ],
        rewritesOfDefaultLocale: [
          {
            source: '/en/docs/heavy',
            destination: '/en/docs/generated-handlers/heavy/en',
            locale: false
          }
        ]
      }
    ]);

    await runModifyConfig(TEST_NEXT_CONFIG);

    expect(
      executeResolvedAppRouteHandlerNextPipelineMock
    ).toHaveBeenCalledTimes(1);
    expect(withRouteHandlerRewritesMock).toHaveBeenCalledWith(
      TEST_NEXT_CONFIG,
      {
        beforeFiles: [
          {
            source: '/docs/generated-handlers/:path*',
            destination: '/404',
            locale: false
          },
          {
            source: '/:locale(en|de)/docs/generated-handlers/:path*',
            destination: '/404',
            locale: false
          },
          {
            source: '/docs/heavy',
            destination: '/en/docs/generated-handlers/heavy/en',
            locale: false
          },
          {
            source: '/en/docs/heavy',
            destination: '/en/docs/generated-handlers/heavy/en',
            locale: false
          }
        ],
        afterFiles: [
          {
            source: '/docs',
            destination: '/en/docs',
            locale: false
          },
          {
            source: '/docs/:path*',
            destination: '/en/docs/:path*',
            locale: false
          }
        ]
      }
    );
  });
});
