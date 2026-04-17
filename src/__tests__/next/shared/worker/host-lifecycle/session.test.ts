import { EventEmitter } from 'node:events';
import type { spawn } from 'node:child_process';

import { describe, expect, test, vi } from 'vitest';

import { createWorkerSession } from '../../../../../next/shared/worker/host/session-lifecycle';
import {
  createWorkerHostLifecycleSession,
  finalizeWorkerHostLifecycleSession,
  markWorkerHostSessionFailed,
  markWorkerHostSessionReady
} from '../../../../../next/shared/worker/host-lifecycle/session';

import type { WorkerHostLifecycleSession } from '../../../../../next/shared/worker/host-lifecycle/types';

type WorkerChildStub = EventEmitter & {
  kill: ReturnType<typeof vi.fn>;
};

const createWorkerChildStub = (): WorkerChildStub => {
  const child = new EventEmitter() as WorkerChildStub;

  child.kill = vi.fn(() => true);

  return child;
};

const createManagedSession = <TResponse>(
  child: WorkerChildStub
): WorkerHostLifecycleSession<TResponse> =>
  createWorkerHostLifecycleSession(
    createWorkerSession<TResponse>({
      sessionKey: 'managed-session',
      child: child as unknown as ReturnType<typeof spawn>
    })
  );

describe('shared worker host lifecycle session helpers', () => {
  test('creates host-managed sessions in the starting phase with a shared readiness promise', async () => {
    const session = createManagedSession<string>(createWorkerChildStub());

    expect(session.phase).toBe('starting');
    expect(session.failureError).toBeNull();
    expect(session.readyPromise).toBeDefined();
  });

  test('marks the session ready and resolves the shared readiness promise', async () => {
    const session = createManagedSession<string>(createWorkerChildStub());

    markWorkerHostSessionReady(session);

    await expect(session.readyPromise).resolves.toBeUndefined();
    expect(session.phase).toBe('ready');
    expect(session.failureError).toBeNull();
  });

  test('marks the session failed and rejects the shared readiness promise', async () => {
    const session = createManagedSession<string>(createWorkerChildStub());
    const failure = new Error('startup failed');

    markWorkerHostSessionFailed({
      session,
      error: failure
    });

    await expect(session.readyPromise).rejects.toThrow('startup failed');
    expect(session.phase).toBe('failed');
    expect(session.failureError).toBe(failure);
  });

  test('finalizes the session to closed after termination is observed', async () => {
    const session = createManagedSession<string>(createWorkerChildStub());
    const workerSessions = new Map([[session.sessionKey, session]]);

    finalizeWorkerHostLifecycleSession<
      string,
      WorkerHostLifecycleSession<string>
    >({
      workerSessions,
      session
    });

    await expect(session.terminationPromise).resolves.toBeUndefined();
    expect(session.phase).toBe('closed');
    expect(workerSessions.size).toBe(0);
  });
});
