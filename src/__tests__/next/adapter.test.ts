import { PHASE_PRODUCTION_BUILD } from 'next/constants.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadRouteHandlersConfigOrRegisteredMock = vi.hoisted(() => vi.fn());
const prepareRouteHandlersFromConfigMock = vi.hoisted(() => vi.fn());
const resolveRouteHandlersConfigsFromAppConfigMock = vi.hoisted(() => vi.fn());
const resolveRouteHandlersAppContextMock = vi.hoisted(() => vi.fn());
const resolveRouteHandlerRoutingStrategyMock = vi.hoisted(() => vi.fn());
const synchronizeRouteHandlerProxyFileMock = vi.hoisted(() => vi.fn());
const synchronizeRouteHandlerInstrumentationFileMock = vi.hoisted(() =>
  vi.fn()
);
const synchronizeRouteHandlerPhaseArtifactsMock = vi.hoisted(() => vi.fn());
const executeResolvedRouteHandlerNextPipelineMock = vi.hoisted(() => vi.fn());
const withRouteHandlerRewritesMock = vi.hoisted(() => vi.fn());
const writeRouteHandlerLookupSnapshotMock = vi.hoisted(() => vi.fn());
const createRouteHandlerProxyBootstrapManifestMock = vi.hoisted(() => vi.fn());
const writeRouteHandlerProxyBootstrapMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../next/internal/route-handlers-bootstrap'), () => ({
  loadRouteHandlersConfigOrRegistered: loadRouteHandlersConfigOrRegisteredMock,
  resolveRouteHandlersAppContext: resolveRouteHandlersAppContextMock
}));

vi.mock(import('../../next/prepare/index'), () => ({
  prepareRouteHandlersFromConfig: prepareRouteHandlersFromConfigMock
}));

vi.mock(import('../../next/config/resolve-configs'), () => ({
  resolveRouteHandlersConfigsFromAppConfig:
    resolveRouteHandlersConfigsFromAppConfigMock
}));

vi.mock(import('../../next/policy/routing-strategy'), () => ({
  resolveRouteHandlerRoutingStrategy: resolveRouteHandlerRoutingStrategyMock
}));

vi.mock(import('../../next/proxy/file-lifecycle'), () => ({
  synchronizeRouteHandlerProxyFile: synchronizeRouteHandlerProxyFileMock
}));

vi.mock(import('../../next/instrumentation/file-lifecycle'), () => ({
  synchronizeRouteHandlerInstrumentationFile:
    synchronizeRouteHandlerInstrumentationFileMock
}));

vi.mock(import('../../next/phase-artifacts'), () => ({
  synchronizeRouteHandlerPhaseArtifacts:
    synchronizeRouteHandlerPhaseArtifactsMock
}));

vi.mock(import('../../next/runtime'), () => ({
  executeResolvedRouteHandlerNextPipeline:
    executeResolvedRouteHandlerNextPipelineMock
}));

vi.mock(import('../../next/rewrites/plugin'), () => ({
  withRouteHandlerRewrites: withRouteHandlerRewritesMock
}));

vi.mock(import('../../next/lookup-persisted'), () => ({
  createRouteHandlerLookupSnapshot: vi.fn(
    (
      filterHeavyRoutesInStaticPaths: boolean,
      results: Array<{
        targetId: string;
        heavyPaths?: Array<unknown>;
      }>
    ) => ({
      version: 1,
      filterHeavyRoutesInStaticPaths,
      targets: results.map(result => ({
        targetId: result.targetId,
        heavyRoutePathKeys: result.heavyPaths == null ? [] : ['serialized']
      }))
    })
  ),
  writeRouteHandlerLookupSnapshot: writeRouteHandlerLookupSnapshotMock
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

const TEST_ROUTE_HANDLERS_CONFIG = {
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
    withRouteHandlerRewritesMock.mockImplementation(config => config);
    writeRouteHandlerLookupSnapshotMock.mockResolvedValue(undefined);
    createRouteHandlerProxyBootstrapManifestMock.mockReturnValue({
      version: 1,
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
        version: 1,
        filterHeavyRoutesInStaticPaths: true,
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
        version: 1,
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
        version: 1,
        filterHeavyRoutesInStaticPaths: false,
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
        version: 1,
        filterHeavyRoutesInStaticPaths: false,
        targets: []
      }
    );
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
});
