import process from 'node:process';

import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  disconnectSharedWorkerRuntimeProcess,
  installSharedWorkerRuntimeRequestLoop
} from '../../../../../next/shared/worker/runtime/entry';

const originalProcessSendDescriptor = Object.getOwnPropertyDescriptor(
  process,
  'send'
);
const originalProcessDisconnectDescriptor = Object.getOwnPropertyDescriptor(
  process,
  'disconnect'
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

const setProcessDisconnect = (
  disconnect: typeof process.disconnect
): void => {
  Object.defineProperty(process, 'disconnect', {
    value: disconnect,
    writable: true,
    configurable: true
  });
};

const restoreProcessDisconnect = (): void => {
  if (originalProcessDisconnectDescriptor == null) {
    delete (
      process as typeof process & {
        disconnect?: typeof process.disconnect;
      }
    ).disconnect;
    return;
  }

  Object.defineProperty(process, 'disconnect', originalProcessDisconnectDescriptor);
};

describe('shared worker runtime entry', () => {
  afterEach(() => {
    restoreProcessSend();
    restoreProcessDisconnect();
    vi.restoreAllMocks();
  });

  test('installs a request loop that ignores non-object payloads', async () => {
    const handleRequest = vi.fn(async () => undefined);
    const send = vi.fn();

    setProcessSend(send as typeof process.send);
    const initialMessageListeners = process.listeners('message');

    installSharedWorkerRuntimeRequestLoop<{
      requestId: string;
      subject: 'shutdown';
    }>({
      workerLabel: 'build worker',
      handleRequest
    });

    const nextMessageListeners = process.listeners('message');
    const messageHandler = nextMessageListeners.at(-1);

    if (messageHandler == null) {
      throw new Error('Expected shared worker runtime to install a message handler.');
    }

    (messageHandler as (rawMessage: unknown) => void)(null);
    (messageHandler as (rawMessage: unknown) => void)('not-an-object');
    (messageHandler as (rawMessage: unknown) => void)({
      requestId: 'request-1',
      subject: 'shutdown'
    });
    await Promise.resolve();

    expect(handleRequest).toHaveBeenCalledTimes(1);
    expect(handleRequest).toHaveBeenCalledWith({
      requestId: 'request-1',
      subject: 'shutdown'
    });

    if (!initialMessageListeners.includes(messageHandler)) {
      process.removeListener(
        'message',
        messageHandler as (...args: Array<unknown>) => void
      );
    }
  });

  test('disconnects and exits the worker process during shutdown', () => {
    const disconnect = vi.fn();
    const exit = vi
      .spyOn(process, 'exit')
      .mockImplementation(((code?: number) => {
        throw new Error(`exit ${String(code)}`);
      }) as typeof process.exit);

    setProcessDisconnect(disconnect as typeof process.disconnect);

    expect(() => {
      disconnectSharedWorkerRuntimeProcess();
    }).toThrow('exit 0');

    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(0);
  });
});
