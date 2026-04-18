import { EventEmitter } from 'node:events';
import type { spawn } from 'node:child_process';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { createWorkerSession } from '../../../../../next/shared/worker/host/session-lifecycle';
import { createWorkerHostLifecycleMachine } from '../../../../../next/shared/worker/host-lifecycle/machine';
import { createWorkerHostLifecycleSession } from '../../../../../next/shared/worker/host-lifecycle/session';

import type { WorkerHostLifecycleSession } from '../../../../../next/shared/worker/host-lifecycle/types';

type WorkerChildStub = EventEmitter & {
  kill: ReturnType<typeof vi.fn>;
};

type TestSessionRequest = {
  sessionKey: string;
  compatibilityToken: string;
};

type TestSession = WorkerHostLifecycleSession<string> & {
  compatibilityToken: string;
  child: ReturnType<typeof spawn>;
};

type DeferredPromise = {
  promise: Promise<void>;
  reject: (error: Error) => void;
  resolve: () => void;
};

/**
 * Create a manual deferred promise for async startup control.
 *
 * @returns Deferred promise helpers.
 */
const createDeferredPromise = (): DeferredPromise => {
  let resolve = (): void => {};
  let reject = (_error: Error): void => {};

  const promise = new Promise<void>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    reject,
    resolve
  };
};

/**
 * Create a child-process stub for one host-managed session.
 *
 * @param options Child-process behavior overrides.
 * @param options.closeOnKill When `true`, `kill()` emits `close` on the next
 * microtask.
 * @returns Event-emitting child-process stub.
 */
const createWorkerChildStub = ({
  closeOnKill = true
}: {
  closeOnKill?: boolean;
} = {}): WorkerChildStub => {
  const child = new EventEmitter() as WorkerChildStub;

  child.kill = vi.fn(() => {
    if (closeOnKill) {
      queueMicrotask(() => {
        child.emit('close', 0, null);
      });
    }

    return true;
  });

  return child;
};

describe('shared worker host lifecycle machine', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('shares one readiness boundary for compatible callers while the session is starting', async () => {
    const workerSessions = new Map<string, TestSession>();
    const startupDeferred = createDeferredPromise();
    const createdSessions: Array<TestSession> = [];
    const machine = createWorkerHostLifecycleMachine<
      string,
      TestSession,
      TestSessionRequest
    >({
      workerLabel: 'test worker',
      session: {
        createSessionKey: request => request.sessionKey,
        createSession: ({ workerSessions: sessionRegistry, request }) => {
          const child = createWorkerChildStub();
          const session = Object.assign(
            createWorkerHostLifecycleSession(
              createWorkerSession<string>({
                sessionKey: request.sessionKey,
                child: child as unknown as ReturnType<typeof spawn>
              })
            ),
            {
              compatibilityToken: request.compatibilityToken
            }
          ) satisfies TestSession;

          child.on('close', () => {
            machine.observeSessionTermination({
              workerSessions: sessionRegistry,
              session
            });
          });

          createdSessions.push(session);
          return session;
        },
        isSessionReusable: ({ session, request }) =>
          session.compatibilityToken === request.compatibilityToken
            ? 'reuse'
            : 'replace',
        startSession: async () => {
          await startupDeferred.promise;
        }
      },
      shutdown: {
        requestShutdown: async () => undefined,
        acknowledgementTimeoutMs: 1000
      }
    });

    const firstResolution = machine.resolveSession({
      workerSessions,
      request: {
        sessionKey: 'root-a',
        compatibilityToken: 'generation-a'
      }
    });
    const secondResolution = machine.resolveSession({
      workerSessions,
      request: {
        sessionKey: 'root-a',
        compatibilityToken: 'generation-a'
      }
    });

    await Promise.resolve();

    expect(createdSessions).toHaveLength(1);
    expect(createdSessions[0]?.phase).toBe('starting');

    startupDeferred.resolve();

    const [firstSession, secondSession] = await Promise.all([
      firstResolution,
      secondResolution
    ]);

    expect(firstSession).toBe(secondSession);
    expect(firstSession.phase).toBe('ready');
    expect(createdSessions).toHaveLength(1);
  });

  test('replaces an incompatible still-starting session and rejects its old readiness boundary', async () => {
    const workerSessions = new Map<string, TestSession>();
    const startupDeferredByToken = new Map<string, DeferredPromise>([
      ['generation-a', createDeferredPromise()],
      ['generation-b', createDeferredPromise()]
    ]);
    const createdSessions: Array<TestSession> = [];
    const requestShutdown = vi.fn(async () => undefined);
    const machine = createWorkerHostLifecycleMachine<
      string,
      TestSession,
      TestSessionRequest
    >({
      workerLabel: 'test worker',
      session: {
        createSessionKey: request => request.sessionKey,
        createSession: ({ workerSessions: sessionRegistry, request }) => {
          const child = createWorkerChildStub({
            closeOnKill: false
          });
          const session = Object.assign(
            createWorkerHostLifecycleSession(
              createWorkerSession<string>({
                sessionKey: request.sessionKey,
                child: child as unknown as ReturnType<typeof spawn>
              })
            ),
            {
              compatibilityToken: request.compatibilityToken
            }
          ) satisfies TestSession;

          child.on('close', () => {
            machine.observeSessionTermination({
              workerSessions: sessionRegistry,
              session
            });
          });

          createdSessions.push(session);
          return session;
        },
        isSessionReusable: ({ session, request }) =>
          session.compatibilityToken === request.compatibilityToken
            ? 'reuse'
            : 'replace',
        startSession: async ({ session }) => {
          await startupDeferredByToken.get(session.compatibilityToken)?.promise;
        }
      },
      shutdown: {
        requestShutdown,
        acknowledgementTimeoutMs: 1000
      }
    });

    const firstResolution = machine.resolveSession({
      workerSessions,
      request: {
        sessionKey: 'root-a',
        compatibilityToken: 'generation-a'
      }
    });
    const firstResolutionOutcome = firstResolution.then(
      session => ({
        ok: true as const,
        session
      }),
      error => ({
        ok: false as const,
        error: error as Error
      })
    );

    await Promise.resolve();

    const firstSession = createdSessions[0];

    expect(firstSession?.phase).toBe('starting');

    const secondResolution = machine.resolveSession({
      workerSessions,
      request: {
        sessionKey: 'root-a',
        compatibilityToken: 'generation-b'
      }
    });

    await vi.waitFor(() => {
      expect(requestShutdown).toHaveBeenCalledTimes(1);
    });
    const firstResolutionResult = await firstResolutionOutcome;

    expect(firstResolutionResult.ok).toBe(false);

    if (firstResolutionResult.ok) {
      throw new Error('Expected the replaced starting session to reject.');
    }

    expect(firstResolutionResult.error.message).toContain(
      'was replaced before startup completed (session-replaced)'
    );

    firstSession?.child.emit('close', 0, null);
    await Promise.resolve();

    startupDeferredByToken.get('generation-b')?.resolve();

    const secondSession = await secondResolution;

    expect(secondSession.compatibilityToken).toBe('generation-b');
    expect(secondSession.phase).toBe('ready');
    expect(createdSessions).toHaveLength(2);
  });

  test('marks a failed startup before finalizing to closed', async () => {
    const workerSessions = new Map<string, TestSession>();
    const createdSessions: Array<TestSession> = [];
    const machine = createWorkerHostLifecycleMachine<
      string,
      TestSession,
      TestSessionRequest
    >({
      workerLabel: 'test worker',
      session: {
        createSessionKey: request => request.sessionKey,
        createSession: ({ workerSessions: sessionRegistry, request }) => {
          const child = createWorkerChildStub({
            closeOnKill: false
          });
          const session = Object.assign(
            createWorkerHostLifecycleSession(
              createWorkerSession<string>({
                sessionKey: request.sessionKey,
                child: child as unknown as ReturnType<typeof spawn>
              })
            ),
            {
              compatibilityToken: request.compatibilityToken
            }
          ) satisfies TestSession;

          child.on('close', () => {
            machine.observeSessionTermination({
              workerSessions: sessionRegistry,
              session
            });
          });

          createdSessions.push(session);
          return session;
        },
        startSession: async () => {
          throw new Error('bootstrap failed');
        }
      },
      shutdown: {
        requestShutdown: async () => undefined,
        acknowledgementTimeoutMs: 1000
      }
    });

    const resolutionPromise = machine.resolveSession({
      workerSessions,
      request: {
        sessionKey: 'root-a',
        compatibilityToken: 'generation-a'
      }
    });

    await Promise.resolve();

    const session = createdSessions[0];

    await expect(resolutionPromise).rejects.toThrow('bootstrap failed');
    expect(session?.phase).toBe('failed');
    expect(session?.failureError?.message).toBe('bootstrap failed');

    session?.child.emit('close', 0, null);
    await Promise.resolve();

    expect(session?.phase).toBe('closed');
  });

  test('reuses one in-flight shutdown promise for repeated callers', async () => {
    const workerSessions = new Map<string, TestSession>();
    const requestShutdown = vi.fn(
      async ({ session }: { session: TestSession; reason: string }) => {
        queueMicrotask(() => {
          session.child.emit('close', 0, null);
        });
      }
    );
    const machine = createWorkerHostLifecycleMachine<
      string,
      TestSession,
      TestSessionRequest
    >({
      workerLabel: 'test worker',
      session: {
        createSessionKey: request => request.sessionKey,
        createSession: ({ workerSessions: sessionRegistry, request }) => {
          const child = createWorkerChildStub();
          const session = Object.assign(
            createWorkerHostLifecycleSession(
              createWorkerSession<string>({
                sessionKey: request.sessionKey,
                child: child as unknown as ReturnType<typeof spawn>
              })
            ),
            {
              compatibilityToken: request.compatibilityToken
            }
          ) satisfies TestSession;

          child.on('close', () => {
            machine.observeSessionTermination({
              workerSessions: sessionRegistry,
              session
            });
          });

          return session;
        }
      },
      shutdown: {
        requestShutdown,
        acknowledgementTimeoutMs: 1000
      }
    });

    const session = await machine.resolveSession({
      workerSessions,
      request: {
        sessionKey: 'root-a',
        compatibilityToken: 'generation-a'
      }
    });

    const firstShutdown = machine.shutdownSession({
      workerSessions,
      session,
      reason: 'unit-test'
    });
    const secondShutdown = machine.shutdownSession({
      workerSessions,
      session,
      reason: 'unit-test'
    });

    await Promise.all([firstShutdown, secondShutdown]);

    expect(requestShutdown).toHaveBeenCalledTimes(1);
    expect(session.phase).toBe('closed');
  });

  test('falls back to force-close when shutdown acknowledgement times out', async () => {
    vi.useFakeTimers();

    const workerSessions = new Map<string, TestSession>();
    const machine = createWorkerHostLifecycleMachine<
      string,
      TestSession,
      TestSessionRequest
    >({
      workerLabel: 'test worker',
      session: {
        createSessionKey: request => request.sessionKey,
        createSession: ({ workerSessions: sessionRegistry, request }) => {
          const child = createWorkerChildStub();
          const session = Object.assign(
            createWorkerHostLifecycleSession(
              createWorkerSession<string>({
                sessionKey: request.sessionKey,
                child: child as unknown as ReturnType<typeof spawn>
              })
            ),
            {
              compatibilityToken: request.compatibilityToken
            }
          ) satisfies TestSession;

          child.on('close', () => {
            machine.observeSessionTermination({
              workerSessions: sessionRegistry,
              session
            });
          });

          return session;
        }
      },
      shutdown: {
        requestShutdown: async () => await new Promise<void>(() => {}),
        acknowledgementTimeoutMs: 50
      }
    });

    const session = await machine.resolveSession({
      workerSessions,
      request: {
        sessionKey: 'root-a',
        compatibilityToken: 'generation-a'
      }
    });

    const shutdownPromise = machine.shutdownSession({
      workerSessions,
      session,
      reason: 'unit-test-timeout'
    });

    await vi.advanceTimersByTimeAsync(50);
    await shutdownPromise;

    expect(session.child.kill).toHaveBeenCalledTimes(1);
    expect(session.phase).toBe('closed');
  });
});
