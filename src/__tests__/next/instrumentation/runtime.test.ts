import { beforeEach, describe, expect, it, vi } from 'vitest';

const getRouteHandlerProxyBootstrapStateMock = vi.hoisted(() => vi.fn());
const resolveRouteHandlerProxyWorkerClientSessionMock = vi.hoisted(() =>
  vi.fn()
);
const debugRouteHandlerProxyMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../../next/proxy/runtime/bootstrap-state'), () => ({
  getRouteHandlerProxyBootstrapState: getRouteHandlerProxyBootstrapStateMock
}));

vi.mock(import('../../../next/proxy/worker/host/client'), () => ({
  resolveRouteHandlerProxyWorkerClientSession:
    resolveRouteHandlerProxyWorkerClientSessionMock
}));

vi.mock(import('../../../next/proxy/observability/debug-log'), () => ({
  debugRouteHandlerProxy: debugRouteHandlerProxyMock
}));

import { prewarmRouteHandlerProxyWorker } from '../../../next/instrumentation';
import { TEST_SINGLE_LOCALE_CONFIG } from '../../helpers/fixtures';

describe('instrumentation worker prewarm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('short-circuits when bootstrap state has no configured targets', async () => {
    getRouteHandlerProxyBootstrapStateMock.mockResolvedValue({
      hasConfiguredTargets: false,
      targetRouteBasePaths: [],
      bootstrapGenerationToken: 'bootstrap-1'
    });

    await expect(
      prewarmRouteHandlerProxyWorker({
        localeConfig: TEST_SINGLE_LOCALE_CONFIG
      })
    ).resolves.toBeUndefined();

    expect(
      resolveRouteHandlerProxyWorkerClientSessionMock
    ).not.toHaveBeenCalled();
  });

  it('bootstraps the worker session for the current bootstrap generation', async () => {
    getRouteHandlerProxyBootstrapStateMock.mockResolvedValue({
      hasConfiguredTargets: true,
      targetRouteBasePaths: ['/docs'],
      bootstrapGenerationToken: 'bootstrap-1'
    });
    resolveRouteHandlerProxyWorkerClientSessionMock.mockResolvedValue({});

    await prewarmRouteHandlerProxyWorker({
      localeConfig: TEST_SINGLE_LOCALE_CONFIG,
      configRegistration: {
        rootDir: '/repo/app',
        configPath: '/repo/app/route-handlers-config.ts'
      }
    });

    expect(getRouteHandlerProxyBootstrapStateMock).toHaveBeenCalledWith(
      TEST_SINGLE_LOCALE_CONFIG,
      {
        rootDir: '/repo/app',
        configPath: '/repo/app/route-handlers-config.ts'
      }
    );
    expect(resolveRouteHandlerProxyWorkerClientSessionMock).toHaveBeenCalledWith(
      {
        localeConfig: TEST_SINGLE_LOCALE_CONFIG,
        bootstrapGenerationToken: 'bootstrap-1',
        configRegistration: {
          rootDir: '/repo/app',
          configPath: '/repo/app/route-handlers-config.ts'
        }
      }
    );
  });

  it('logs and swallows prewarm failures', async () => {
    getRouteHandlerProxyBootstrapStateMock.mockResolvedValue({
      hasConfiguredTargets: true,
      targetRouteBasePaths: ['/docs'],
      bootstrapGenerationToken: 'bootstrap-1'
    });
    resolveRouteHandlerProxyWorkerClientSessionMock.mockRejectedValue(
      new Error('worker bootstrap failed')
    );

    await expect(
      prewarmRouteHandlerProxyWorker({
        localeConfig: TEST_SINGLE_LOCALE_CONFIG
      })
    ).resolves.toBeUndefined();

    expect(debugRouteHandlerProxyMock).toHaveBeenCalledWith(
      'prewarm:error',
      expect.objectContaining({
        message: 'worker bootstrap failed'
      })
    );
  });
});
