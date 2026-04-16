import { describe, expect, test, vi } from 'vitest';

import {
  createSharedWorkerHostProtocolState
} from '../../../../../next/shared/worker/host/global-state';
import {
  createSharedWorkerRequestId,
  sendSharedWorkerRequest,
  resetSharedWorkerProtocolState
} from '../../../../../next/shared/worker/host/protocol';

describe('shared worker host protocol', () => {
  test('request id sequencing resets correctly', () => {
    const protocolState = createSharedWorkerHostProtocolState();

    expect(
      createSharedWorkerRequestId(protocolState, 'shared-worker-request')
    ).toBe('shared-worker-request-1');
    expect(
      createSharedWorkerRequestId(protocolState, 'shared-worker-request')
    ).toBe('shared-worker-request-2');

    resetSharedWorkerProtocolState(protocolState);

    expect(
      createSharedWorkerRequestId(protocolState, 'shared-worker-request')
    ).toBe('shared-worker-request-1');
  });

  test('rejects IPC sends for closed sessions', async () => {
    const send = vi.fn();
    const session = {
      closed: true,
      child: {
        send
      },
      pendingRequests: new Map()
    };

    await expect(
      sendSharedWorkerRequest(
        session,
        {
          requestId: 'request-1',
          subject: 'shutdown'
        },
        {
          closedSessionErrorMessage: 'worker session is closed.',
          missingIpcSendErrorMessage: 'worker IPC is unavailable.'
        }
      )
    ).rejects.toThrow('worker session is closed.');
    expect(send).not.toHaveBeenCalled();
  });

  test('rejects IPC sends when the child process has no IPC channel', async () => {
    const session = {
      closed: false,
      child: {
        send: undefined
      },
      pendingRequests: new Map()
    };

    await expect(
      sendSharedWorkerRequest(
        session,
        {
          requestId: 'request-1',
          subject: 'shutdown'
        },
        {
          closedSessionErrorMessage: 'worker session is closed.',
          missingIpcSendErrorMessage: 'worker IPC is unavailable.'
        }
      )
    ).rejects.toThrow('worker IPC is unavailable.');
  });
});
