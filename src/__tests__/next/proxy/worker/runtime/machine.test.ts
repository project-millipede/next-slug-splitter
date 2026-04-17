import process from 'node:process';

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const bootstrapRouteHandlerProxyWorkerMock = vi.hoisted(() => vi.fn());
const closeRouteHandlerProxyWorkerBootstrapStateMock = vi.hoisted(() =>
  vi.fn()
);
const resolveRouteHandlerProxyLazyMissMock = vi.hoisted(() => vi.fn());
const debugRouteHandlerProxyWorkerMock = vi.hoisted(() => vi.fn());
const disconnectWorkerRuntimeProcessMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../../../../next/proxy/worker/runtime/bootstrap'), () => ({
  bootstrapRouteHandlerProxyWorker: bootstrapRouteHandlerProxyWorkerMock,
  closeRouteHandlerProxyWorkerBootstrapState:
    closeRouteHandlerProxyWorkerBootstrapStateMock
}));

vi.mock(
  import('../../../../../next/proxy/worker/runtime/resolve-lazy-miss'),
  () => ({
    resolveRouteHandlerProxyLazyMiss: resolveRouteHandlerProxyLazyMissMock
  })
);

vi.mock(import('../../../../../next/proxy/worker/debug-log'), () => ({
  debugRouteHandlerProxyWorker: debugRouteHandlerProxyWorkerMock
}));

vi.mock(import('../../../../../next/shared/worker/runtime/entry'), () => ({
  disconnectWorkerRuntimeProcess:
    disconnectWorkerRuntimeProcessMock as unknown as () => never
}));

import { createRouteHandlerProxyWorkerRuntimeMachine } from '../../../../../next/proxy/worker/runtime/machine';

const originalProcessSendDescriptor = Object.getOwnPropertyDescriptor(
  process,
  'send'
);

const setProcessSend = (send: typeof process.send): void => {
  Object.defineProperty(process, 'send', {
    value: send,
    writable: true,
    configurable: true
  });
};

const restoreProcessSend = (): void => {
  if (originalProcessSendDescriptor == null) {
    delete (process as typeof process & { send?: typeof process.send }).send;
    return;
  }

  Object.defineProperty(process, 'send', originalProcessSendDescriptor);
};

describe('proxy worker runtime machine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    restoreProcessSend();
  });

  test('boots one generation and replaces the previous bootstrap state', async () => {
    const send = vi.fn((message, callback?: (error: Error | null) => void) => {
      callback?.(null);
      return true;
    });
    const firstBootstrapState = {
      bootstrapGenerationToken: 'bootstrap-1'
    };
    const secondBootstrapState = {
      bootstrapGenerationToken: 'bootstrap-2'
    };

    setProcessSend(send as typeof process.send);
    bootstrapRouteHandlerProxyWorkerMock
      .mockResolvedValueOnce(firstBootstrapState)
      .mockResolvedValueOnce(secondBootstrapState);

    const machine = createRouteHandlerProxyWorkerRuntimeMachine();

    await machine.handleRequest({
      requestId: 'request-1',
      subject: 'bootstrap',
      payload: {
        bootstrapGenerationToken: 'bootstrap-1',
        localeConfig: {
          locales: ['en'],
          defaultLocale: 'en'
        },
        configRegistration: {}
      }
    });
    await machine.handleRequest({
      requestId: 'request-2',
      subject: 'bootstrap',
      payload: {
        bootstrapGenerationToken: 'bootstrap-2',
        localeConfig: {
          locales: ['en'],
          defaultLocale: 'en'
        },
        configRegistration: {}
      }
    });

    expect(
      closeRouteHandlerProxyWorkerBootstrapStateMock
    ).toHaveBeenCalledTimes(1);
    expect(closeRouteHandlerProxyWorkerBootstrapStateMock).toHaveBeenCalledWith(
      firstBootstrapState
    );
    expect(machine.getState()).toEqual({
      phase: 'running',
      extensionState: {
        bootstrapState: secondBootstrapState
      }
    });
  });

  test('rejects lazy-miss resolution before bootstrap has completed', async () => {
    const send = vi.fn((message, callback?: (error: Error | null) => void) => {
      callback?.(null);
      return true;
    });

    setProcessSend(send as typeof process.send);

    const machine = createRouteHandlerProxyWorkerRuntimeMachine();

    await machine.handleRequest({
      requestId: 'request-1',
      subject: 'resolve-lazy-miss',
      payload: {
        pathname: '/docs/getting-started'
      }
    });

    expect(send).toHaveBeenCalledWith(
      {
        requestId: 'request-1',
        ok: false,
        error: {
          message:
            'next-slug-splitter proxy worker must be bootstrapped before resolving lazy misses.'
        }
      },
      expect.any(Function)
    );
  });

  test('clears bootstrap state during shared shutdown handling', async () => {
    const send = vi.fn((message, callback?: (error: Error | null) => void) => {
      callback?.(null);
      return true;
    });
    const bootstrapState = {
      bootstrapGenerationToken: 'bootstrap-1'
    };

    setProcessSend(send as typeof process.send);
    bootstrapRouteHandlerProxyWorkerMock.mockResolvedValue(bootstrapState);
    resolveRouteHandlerProxyLazyMissMock.mockResolvedValue({
      subject: 'pass-through',
      payload: {
        reason: 'no-target'
      }
    });

    const machine = createRouteHandlerProxyWorkerRuntimeMachine();

    await machine.handleRequest({
      requestId: 'request-1',
      subject: 'bootstrap',
      payload: {
        bootstrapGenerationToken: 'bootstrap-1',
        localeConfig: {
          locales: ['en'],
          defaultLocale: 'en'
        },
        configRegistration: {}
      }
    });
    await machine.handleRequest({
      requestId: 'request-2',
      subject: 'shutdown'
    });

    expect(closeRouteHandlerProxyWorkerBootstrapStateMock).toHaveBeenCalledWith(
      bootstrapState
    );
    expect(machine.getState()).toEqual({
      phase: 'closed',
      extensionState: {
        bootstrapState: null
      }
    });
    expect(disconnectWorkerRuntimeProcessMock).toHaveBeenCalledTimes(1);
  });
});
