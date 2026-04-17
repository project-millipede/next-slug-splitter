import process from 'node:process';

import { afterEach, describe, expect, test, vi } from 'vitest';

const disconnectWorkerRuntimeProcessMock = vi.hoisted(() => vi.fn());

vi.mock(import('../../../../../next/shared/worker/runtime/entry'), () => ({
  disconnectWorkerRuntimeProcess:
    disconnectWorkerRuntimeProcessMock as unknown as () => never
}));

import { createWorkerRuntimeMachine } from '../../../../../next/shared/worker/runtime/machine';
import type {
  WorkerRequestAction,
  WorkerShutdownRequest
} from '../../../../../next/shared/worker/types';

type MachineTestRequest =
  | WorkerRequestAction<'increment', { amount: number }>
  | WorkerShutdownRequest;

type MachineTestResponse = {
  subject: 'incremented';
  payload: {
    count: number;
  };
};

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

describe('shared worker runtime machine', () => {
  afterEach(() => {
    restoreProcessSend();
    vi.restoreAllMocks();
  });

  test('processes domain actions while running and updates retained state', async () => {
    const send = vi.fn((message, callback?: (error: Error | null) => void) => {
      callback?.(null);
      return true;
    });

    setProcessSend(send as typeof process.send);

    const machine = createWorkerRuntimeMachine<
      MachineTestRequest,
      MachineTestResponse,
      { count: number }
    >({
      workerLabel: 'test worker',
      initialExtensionState: {
        count: 1
      },
      handlers: {
        increment: async ({ action, state }) => ({
          response: {
            subject: 'incremented',
            payload: {
              count: state.count + action.payload.amount
            }
          },
          nextExtensionState: {
            count: state.count + action.payload.amount
          }
        })
      }
    });

    await machine.handleRequest({
      requestId: 'request-1',
      subject: 'increment',
      payload: {
        amount: 2
      }
    });

    expect(machine.getState()).toEqual({
      phase: 'running',
      extensionState: {
        count: 3
      }
    });
    expect(send).toHaveBeenCalledWith(
      {
        requestId: 'request-1',
        ok: true,
        response: {
          subject: 'incremented',
          payload: {
            count: 3
          }
        }
      },
      expect.any(Function)
    );
  });

  test('runs shutdown cleanup once and treats repeated shutdown as idempotent', async () => {
    const send = vi.fn((message, callback?: (error: Error | null) => void) => {
      callback?.(null);
      return true;
    });
    const onShutdown = vi.fn(async (_state: { count: number }) => ({
      count: 0
    }));

    setProcessSend(send as typeof process.send);

    const machine = createWorkerRuntimeMachine<
      MachineTestRequest,
      MachineTestResponse,
      { count: number }
    >({
      workerLabel: 'test worker',
      initialExtensionState: {
        count: 1
      },
      handlers: {
        increment: async ({ action, state }) => ({
          response: {
            subject: 'incremented',
            payload: {
              count: state.count + action.payload.amount
            }
          },
          nextExtensionState: {
            count: state.count + action.payload.amount
          }
        })
      },
      onShutdown: async ({ extensionState }) => await onShutdown(extensionState)
    });

    await machine.handleRequest({
      requestId: 'request-1',
      subject: 'shutdown'
    });
    await machine.handleRequest({
      requestId: 'request-2',
      subject: 'shutdown'
    });

    expect(onShutdown).toHaveBeenCalledTimes(1);
    expect(machine.getState()).toEqual({
      phase: 'closed',
      extensionState: {
        count: 0
      }
    });
    expect(disconnectWorkerRuntimeProcessMock).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenNthCalledWith(
      1,
      {
        requestId: 'request-1',
        ok: true,
        response: {
          subject: 'shutdown-complete'
        }
      },
      expect.any(Function)
    );
    expect(send).toHaveBeenNthCalledWith(
      2,
      {
        requestId: 'request-2',
        ok: true,
        response: {
          subject: 'shutdown-complete'
        }
      },
      expect.any(Function)
    );
  });

  test('rejects domain actions after shutdown has started', async () => {
    const send = vi.fn((message, callback?: (error: Error | null) => void) => {
      callback?.(null);
      return true;
    });

    setProcessSend(send as typeof process.send);

    const machine = createWorkerRuntimeMachine<
      MachineTestRequest,
      MachineTestResponse,
      { count: number }
    >({
      workerLabel: 'test worker',
      initialExtensionState: {
        count: 1
      },
      handlers: {
        increment: async ({ action, state }) => ({
          response: {
            subject: 'incremented',
            payload: {
              count: state.count + action.payload.amount
            }
          },
          nextExtensionState: {
            count: state.count + action.payload.amount
          }
        })
      }
    });

    await machine.handleRequest({
      requestId: 'request-1',
      subject: 'shutdown'
    });
    await machine.handleRequest({
      requestId: 'request-2',
      subject: 'increment',
      payload: {
        amount: 1
      }
    });

    expect(send).toHaveBeenNthCalledWith(
      2,
      {
        requestId: 'request-2',
        ok: false,
        error: {
          message:
            'next-slug-splitter test worker is not accepting "increment" requests after shutdown has started.'
        }
      },
      expect.any(Function)
    );
  });
});
