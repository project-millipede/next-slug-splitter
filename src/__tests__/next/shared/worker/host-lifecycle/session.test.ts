import { EventEmitter } from 'node:events';
import type { spawn } from 'node:child_process';

import { describe, expect, test, vi } from 'vitest';

import { createWorkerSession } from '../../../../../next/shared/worker/host/session-lifecycle';
import { waitForWorkerHostLifecycleSessionReady } from '../../../../../next/shared/worker/host-lifecycle/session-readiness';
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
  const STARTUP_FAILURE_MESSAGE = 'startup failed' as const;

  test('creates host-managed sessions in the starting phase', async () => {
    const session = createManagedSession<string>(createWorkerChildStub());

    expect(session.phase).toBe('starting');
    expect(session.failureError).toBeNull();
  });

  type SettlementOutcome =
    | {
        type: 'resolve';
        phase: 'ready';
        failure: null;
      }
    | {
        type: 'reject';
        phase: 'failed';
        failure: Error;
        message: typeof STARTUP_FAILURE_MESSAGE;
      };

  type SettlementScenario = {
    id: string;
    description: string;
    apply: (session: WorkerHostLifecycleSession<string>) => void;
    expected: SettlementOutcome;
  };

  const startupFailure = new Error(STARTUP_FAILURE_MESSAGE);

  const settlementScenarios: SettlementScenario[] = [
    {
      id: 'Ready',
      description:
        'marks the session ready and settles the shared readiness boundary successfully',
      apply: session => {
        // Publish the successful lifecycle transition for this session instance.
        markWorkerHostSessionReady(session);
      },
      expected: {
        type: 'resolve',
        phase: 'ready',
        failure: null
      }
    },
    {
      id: 'Failed',
      description:
        'marks the session failed and settles the shared readiness boundary with the startup error',
      apply: session => {
        // Publish the failed lifecycle transition for this session instance.
        markWorkerHostSessionFailed(session, startupFailure);
      },
      expected: {
        type: 'reject',
        phase: 'failed',
        failure: startupFailure,
        message: STARTUP_FAILURE_MESSAGE
      }
    }
  ];

  test.for(settlementScenarios)('[$id] $description', async ({
    apply,
    expected
  }) => {
    const session = createManagedSession<string>(createWorkerChildStub());

    // Each scenario publishes one lifecycle outcome before the readiness wait
    // observes that same shared boundary.
    apply(session);

    if (expected.type === 'reject') {
      await expect(
        waitForWorkerHostLifecycleSessionReady('test worker', session)
      ).rejects.toThrow(expected.message);
    } else {
      await expect(
        waitForWorkerHostLifecycleSessionReady('test worker', session)
      ).resolves.toBeUndefined();
    }

    // The visible session record should match the same outcome that the
    // readiness boundary published to joined callers.
    expect(session.phase).toBe(expected.phase);
    expect(session.failureError).toBe(expected.failure);
  });

  test('finalizes the session to closed after termination is observed', async () => {
    const session = createManagedSession<string>(createWorkerChildStub());
    const workerSessions = new Map([[session.sessionKey, session]]);

    // Finalization should publish the terminal closed phase and release the
    // session from the active registry.
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
