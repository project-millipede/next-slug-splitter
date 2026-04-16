import { EventEmitter } from 'node:events';
import type { spawn } from 'node:child_process';

import { describe, expect, test, vi } from 'vitest';

import { createSharedWorkerSession } from '../../../../../next/shared/worker/host/session-lifecycle';
import {
  createSharedWorkerHostLifecycleSession,
  finalizeSharedWorkerHostLifecycleSession,
  markSharedWorkerHostSessionFailed,
  markSharedWorkerHostSessionReady
} from '../../../../../next/shared/worker/host-lifecycle/session';

import type { SharedWorkerHostLifecycleSession } from '../../../../../next/shared/worker/host-lifecycle/types';

type SharedWorkerChildStub = EventEmitter & {
  kill: ReturnType<typeof vi.fn>;
};

const createSharedWorkerChildStub = (): SharedWorkerChildStub => {
  const child = new EventEmitter() as SharedWorkerChildStub;

  child.kill = vi.fn(() => true);

  return child;
};

const createManagedSession = <TResponse>(
  child: SharedWorkerChildStub
): SharedWorkerHostLifecycleSession<TResponse> =>
  createSharedWorkerHostLifecycleSession(
    createSharedWorkerSession<TResponse>({
      sessionKey: 'managed-session',
      child: child as unknown as ReturnType<typeof spawn>
    })
  );

describe('shared worker host lifecycle session helpers', () => {
  test('creates host-managed sessions in the starting phase with a shared readiness promise', async () => {
    const session = createManagedSession<string>(createSharedWorkerChildStub());

    expect(session.phase).toBe('starting');
    expect(session.failureError).toBeNull();
    expect(session.readyPromise).toBeDefined();
  });

  test('marks the session ready and resolves the shared readiness promise', async () => {
    const session = createManagedSession<string>(createSharedWorkerChildStub());

    markSharedWorkerHostSessionReady(session);

    await expect(session.readyPromise).resolves.toBeUndefined();
    expect(session.phase).toBe('ready');
    expect(session.failureError).toBeNull();
  });

  test('marks the session failed and rejects the shared readiness promise', async () => {
    const session = createManagedSession<string>(createSharedWorkerChildStub());
    const failure = new Error('startup failed');

    markSharedWorkerHostSessionFailed({
      session,
      error: failure
    });

    await expect(session.readyPromise).rejects.toThrow('startup failed');
    expect(session.phase).toBe('failed');
    expect(session.failureError).toBe(failure);
  });

  test('finalizes the session to closed after termination is observed', async () => {
    const session = createManagedSession<string>(createSharedWorkerChildStub());
    const workerSessions = new Map([[session.sessionKey, session]]);

    finalizeSharedWorkerHostLifecycleSession<
      string,
      SharedWorkerHostLifecycleSession<string>
    >({
      workerSessions,
      session
    });

    await expect(session.terminationPromise).resolves.toBeUndefined();
    expect(session.phase).toBe('closed');
    expect(workerSessions.size).toBe(0);
  });
});
