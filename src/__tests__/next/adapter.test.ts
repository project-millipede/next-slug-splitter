import { PHASE_PRODUCTION_BUILD } from 'next/constants.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

const TEST_NEXT_CONFIG = {
  i18n: {
    locales: ['en', 'fr'],
    defaultLocale: 'fr'
  }
};

describe('route handlers adapter', () => {
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

  it('derives locale semantics from the resolved Next config during adapter execution', async () => {
    const routeHandlersConfig = TEST_ROUTE_HANDLERS_CONFIG;
    type ModifyConfig = NonNullable<typeof routeHandlersAdapter.modifyConfig>;
    type AdapterConfigInput = Parameters<ModifyConfig>[0];
    const nextConfig = TEST_NEXT_CONFIG as unknown as AdapterConfigInput;

    loadRouteHandlersConfigOrRegisteredMock.mockResolvedValue(
      routeHandlersConfig
    );
    resolveRouteHandlersAppContextMock.mockReturnValue({
      ...TEST_APP_CONTEXT,
      routeHandlersConfig
    });

    await routeHandlersAdapter.modifyConfig!(nextConfig, {
      phase: PHASE_PRODUCTION_BUILD,
      nextVersion: '16.2.0'
    });

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

    await routeHandlersAdapter.modifyConfig!(TEST_NEXT_CONFIG as never, {
      phase: PHASE_PRODUCTION_BUILD,
      nextVersion: '16.2.0'
    });

    expect(executeResolvedRouteHandlerNextPipelineMock).not.toHaveBeenCalled();
    expect(createRouteHandlerProxyBootstrapManifestMock).toHaveBeenCalledWith(
      'route-handler-proxy-bootstrap-test',
      {
        locales: ['en', 'fr'],
        defaultLocale: 'fr'
      },
      [
        {
          targetId: 'docs'
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

    await routeHandlersAdapter.modifyConfig!(TEST_NEXT_CONFIG as never, {
      phase: PHASE_PRODUCTION_BUILD,
      nextVersion: '16.2.0'
    });

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
        rootDir: '/repo/app'
      }
    });
    resolveAppRouteHandlersConfigsFromAppConfigMock.mockResolvedValue([
      {
        targetId: 'docs',
        routerKind: 'app',
        app: {
          rootDir: '/repo/app'
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
          generatedDir: '/repo/app/app/docs/generated-handlers'
        }
      }
    ]);

    await routeHandlersAdapter.modifyConfig!(TEST_NEXT_CONFIG as never, {
      phase: PHASE_PRODUCTION_BUILD,
      nextVersion: '16.2.0'
    });

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

    await routeHandlersAdapter.modifyConfig!(TEST_NEXT_CONFIG as never, {
      phase: PHASE_PRODUCTION_BUILD,
      nextVersion: '16.2.0'
    });

    expect(createRouteHandlerProxyBootstrapManifestMock).not.toHaveBeenCalled();
    expect(writeRouteHandlerProxyBootstrapMock).not.toHaveBeenCalled();
    expect(executeResolvedRouteHandlerNextPipelineMock).toHaveBeenCalledTimes(
      1
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

    await routeHandlersAdapter.modifyConfig!(TEST_NEXT_CONFIG as never, {
      phase: PHASE_PRODUCTION_BUILD,
      nextVersion: '16.2.0'
    });

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
});
