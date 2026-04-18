import { EventEmitter } from 'node:events';
import type { spawn } from 'node:child_process';

import { describe, expect, test, vi } from 'vitest';

import { createWorkerSession } from '../../../../../next/shared/worker/host/session-lifecycle';
import { createWorkerHostLifecycleSession } from '../../../../../next/shared/worker/host-lifecycle/session';
import {
  rejectWorkerHostLifecycleSessionReadiness,
  resolveWorkerHostLifecycleSessionReadiness,
  waitForWorkerHostLifecycleSessionReady
} from '../../../../../next/shared/worker/host-lifecycle/session-readiness';
import type {
  WorkerHostLifecycleSession,
  WorkerHostLifecycleSessionBase
} from '../../../../../next/shared/worker/host-lifecycle/types';

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

const createUninitializedSessionBase = (): WorkerHostLifecycleSessionBase =>
  Object.assign(
    createWorkerSession<string>({
      sessionKey: 'uninitialized-session',
      child: createWorkerChildStub() as unknown as ReturnType<typeof spawn>
    }),
    {
      phase: 'starting' as const,
      failureError: null
    }
  );

describe('shared worker host lifecycle readiness helpers', () => {
  const STARTUP_FAILURE_MESSAGE = 'startup failed' as const;
  const MISSING_READINESS_GATE_MESSAGE =
    'next-slug-splitter host lifecycle session is missing a readiness gate.' as const;

  type ReadinessWaitOutcome =
    | { type: 'resolve' }
    | { type: 'reject'; message: string };

  type ReadinessSettlementScenario = {
    id: string;
    description: string;
    settle: (session: WorkerHostLifecycleSession<string>) => void;
    expected: ReadinessWaitOutcome;
  };

  const startupFailure = new Error(STARTUP_FAILURE_MESSAGE);

  const readinessSettlementScenarios: ReadinessSettlementScenario[] = [
    {
      id: 'Resolve',
      description:
        'waits until the registered readiness gate settles successfully',
      settle: session => {
        session.phase = 'ready';

        // Publish the successful readiness boundary for all joined callers.
        resolveWorkerHostLifecycleSessionReadiness(session);
      },
      expected: { type: 'resolve' }
    },
    {
      id: 'Reject',
      description: 'rejects readiness waiters with the recorded lifecycle failure',
      settle: session => {
        session.phase = 'failed';
        session.failureError = startupFailure;

        // Publish the failed readiness boundary for all joined callers.
        rejectWorkerHostLifecycleSessionReadiness(session, startupFailure);
      },
      expected: {
        type: 'reject',
        message: STARTUP_FAILURE_MESSAGE
      }
    }
  ];

  test.for(readinessSettlementScenarios)('[$id] $description', async ({
    settle,
    expected
  }) => {
    const session = createManagedSession<string>(createWorkerChildStub());

    // Start waiting first so the scenario proves later external settlement.
    const readinessPromise = waitForWorkerHostLifecycleSessionReady(
      'test worker',
      session
    );

    // Each scenario settles the already-joined readiness boundary from the
    // outside, which is the core deferred-gate behavior this helper owns.
    settle(session);

    if (expected.type === 'reject') {
      await expect(readinessPromise).rejects.toThrow(expected.message);
      return;
    }

    await expect(readinessPromise).resolves.toBeUndefined();
  });

  type RepeatedSettlementScenario = {
    id: string;
    description: string;
    initialize: (session: WorkerHostLifecycleSession<string>) => void;
    repeat: (session: WorkerHostLifecycleSession<string>) => void;
    expected: ReadinessWaitOutcome;
  };

  const repeatedSettlementScenarios: RepeatedSettlementScenario[] = [
    {
      id: 'Resolve',
      description:
        'ignores repeated successful-settlement calls after the readiness gate settles',
      initialize: session => {
        session.phase = 'ready';
        resolveWorkerHostLifecycleSessionReadiness(session);
      },
      repeat: session => {
        // The first settle already won, so this second publish should be a no-op.
        resolveWorkerHostLifecycleSessionReadiness(session);
      },
      expected: { type: 'resolve' }
    },
    {
      id: 'Reject',
      description: 'ignores repeated reject calls after the readiness gate settles',
      initialize: session => {
        session.phase = 'failed';
        session.failureError = startupFailure;
        rejectWorkerHostLifecycleSessionReadiness(session, startupFailure);
      },
      repeat: session => {
        // The first settle already won, so this second publish should be a no-op.
        rejectWorkerHostLifecycleSessionReadiness(session, startupFailure);
      },
      expected: {
        type: 'reject',
        message: STARTUP_FAILURE_MESSAGE
      }
    }
  ];

  test.for(repeatedSettlementScenarios)('[$id] $description', async ({
    initialize,
    repeat,
    expected
  }) => {
    const session = createManagedSession<string>(createWorkerChildStub());

    // The first publish establishes the winning readiness outcome.
    initialize(session);

    // Later publishes should stay idempotent after that first settlement.
    expect(() => {
      repeat(session);
    }).not.toThrow();

    if (expected.type === 'reject') {
      await expect(
        waitForWorkerHostLifecycleSessionReady('test worker', session)
      ).rejects.toThrow(expected.message);
      return;
    }

    await expect(
      waitForWorkerHostLifecycleSessionReady('test worker', session)
    ).resolves.toBeUndefined();
  });

  type UnregisteredReadinessOutcome =
    | { type: 'reject'; message: typeof MISSING_READINESS_GATE_MESSAGE }
    | { type: 'throw'; message: typeof MISSING_READINESS_GATE_MESSAGE };

  type UnregisteredReadinessScenario = {
    id: string;
    description: string;
    access: (session: WorkerHostLifecycleSessionBase) => Promise<void> | void;
    expected: UnregisteredReadinessOutcome;
  };

  const unregisteredReadinessScenarios: UnregisteredReadinessScenario[] = [
    {
      id: 'Wait',
      description:
        'wait rejects with a clear error when no readiness gate was registered',
      access: async session => {
        await waitForWorkerHostLifecycleSessionReady('test worker', session);
      },
      expected: {
        type: 'reject',
        message: MISSING_READINESS_GATE_MESSAGE
      }
    },
    {
      id: 'Resolve',
      description:
        'resolve throws a clear error when no readiness gate was registered',
      access: session => {
        resolveWorkerHostLifecycleSessionReadiness(session);
      },
      expected: {
        type: 'throw',
        message: MISSING_READINESS_GATE_MESSAGE
      }
    }
  ];

  test.for(unregisteredReadinessScenarios)('[$id] $description', async ({
    access,
    expected
  }) => {
    const session = createUninitializedSessionBase();

    if (expected.type === 'reject') {
      // `wait(...)` is async, so missing registration rejects rather than throws.
      await expect(access(session)).rejects.toThrow(expected.message);
      return;
    }

    // Immediate settlement fails synchronously during readiness lookup.
    expect(() => {
      void access(session);
    }).toThrow(expected.message);
  });
});
