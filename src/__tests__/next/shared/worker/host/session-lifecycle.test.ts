import { EventEmitter } from 'node:events';
import type { spawn } from 'node:child_process';

import { afterEach, describe, expect, test, vi } from 'vitest';

import {
  createWorkerSession,
  finalizeWorkerSession,
  type WorkerSession
} from '../../../../../next/shared/worker/host/session-lifecycle';

type WorkerChildStub = EventEmitter & {
  kill: ReturnType<typeof vi.fn>;
};

const createWorkerChildStub = (): WorkerChildStub => {
  const child = new EventEmitter() as WorkerChildStub;

  child.kill = vi.fn(() => {
    queueMicrotask(() => {
      child.emit('close', 0, null);
    });

    return true;
  });

  return child;
};

const createSharedSession = <TResponse>(
  child: WorkerChildStub
): WorkerSession<TResponse> =>
  createWorkerSession<TResponse>({
    sessionKey: 'shared-session',
    child: child as unknown as ReturnType<typeof spawn>
  });

describe('shared worker host session lifecycle primitives', () => {
  test('rejects pending requests when the worker exits', async () => {
    const child = createWorkerChildStub();
    const session = createSharedSession<string>(child);
    const workerSessions = new Map([[session.sessionKey, session]]);
    const exitError = new Error('worker exited');

    child.on('exit', () => {
      finalizeWorkerSession<string, WorkerSession<string>>({
        workerSessions,
        session,
        rejectionError: exitError
      });
    });

    const pendingResponsePromise = new Promise<string>((resolve, reject) => {
      session.pendingRequests.set('request-1', {
        resolve,
        reject
      });
    });

    child.emit('exit', 1, null);

    await expect(pendingResponsePromise).rejects.toThrow('worker exited');
    await expect(session.terminationPromise).resolves.toBeUndefined();
    expect(workerSessions.size).toBe(0);
  });

  test('resolves the termination promise after the child closes', async () => {
    const child = createWorkerChildStub();
    const session = createSharedSession<void>(child);
    const workerSessions = new Map([[session.sessionKey, session]]);

    child.on('close', () => {
      finalizeWorkerSession<void, WorkerSession<void>>({
        workerSessions,
        session
      });
    });

    const terminationPromise = session.terminationPromise.then(() => 'done');

    child.emit('close', 0, null);

    await expect(terminationPromise).resolves.toBe('done');
  });
});
