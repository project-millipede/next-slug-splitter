import process from 'node:process';

import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  assertWorkerRuntimeIpcChannel,
  handleWorkerRuntimeRequest,
  writeWorkerRuntimeResponse
} from '../../../../../next/shared/worker/runtime/protocol';

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

describe('shared worker runtime protocol', () => {
  afterEach(() => {
    restoreProcessSend();
    vi.restoreAllMocks();
  });

  test('writes response envelopes over IPC', async () => {
    const send = vi.fn((message, callback?: (error: Error | null) => void) => {
      callback?.(null);
      return true;
    });

    setProcessSend(send as typeof process.send);

    await writeWorkerRuntimeResponse({
      workerLabel: 'build worker',
      response: {
        requestId: 'request-1',
        ok: true,
        response: {
          subject: 'shutdown-complete'
        }
      }
    });

    expect(send).toHaveBeenCalledWith(
      {
        requestId: 'request-1',
        ok: true,
        response: {
          subject: 'shutdown-complete'
        }
      },
      expect.any(Function)
    );
  });

  test('fails fast when the worker runtime has no IPC channel', () => {
    setProcessSend(undefined);

    expect(() => {
      assertWorkerRuntimeIpcChannel('proxy worker');
    }).toThrow('next-slug-splitter proxy worker requires an IPC channel.');
  });

  test('writes an error envelope when request resolution throws', async () => {
    const send = vi.fn((message, callback?: (error: Error | null) => void) => {
      callback?.(null);
      return true;
    });

    setProcessSend(send as typeof process.send);

    await handleWorkerRuntimeRequest({
      workerLabel: 'proxy worker',
      request: {
        requestId: 'request-1',
        subject: 'bootstrap'
      },
      resolveResponse: async () => {
        throw new Error('boom');
      }
    });

    expect(send).toHaveBeenCalledWith(
      {
        requestId: 'request-1',
        ok: false,
        error: {
          message: 'boom'
        }
      },
      expect.any(Function)
    );
  });
});
