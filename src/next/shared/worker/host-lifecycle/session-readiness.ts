import { createAsyncGateStore } from '../../async/async-gate';

import type { WorkerHostLifecycleSessionBase } from './types';

/**
 * Shared private readiness gate registry for host-managed sessions.
 *
 * @remarks
 * This module wraps the generic async-gate primitive with host-lifecycle
 * semantics.
 *
 * The important contract here is async overlap on one session key:
 * 1. Caller A can create and register session `X` for one session key.
 * 2. Caller A then yields at one async startup `await` while session `X` is
 *    still in phase `starting`.
 * 3. Before Caller A finishes, Caller B can make its own independent resolve
 *    attempt for that same session key.
 * 4. Caller B must join the same in-flight startup instead of creating a
 *    second worker.
 * 5. Both callers wait on the same gate until the lifecycle publishes
 *    `ready` or rejects startup.
 *
 * The gate stays private so callers do not reach into the session shape and
 * reason about raw promise mechanics directly.
 */
const workerHostLifecycleSessionReadinessGateStore =
  createAsyncGateStore<WorkerHostLifecycleSessionBase>({
    missingGateErrorMessage:
      'next-slug-splitter host lifecycle session is missing a readiness gate.',
    alreadyInitializedErrorMessage:
      'next-slug-splitter host lifecycle session already has a readiness gate.'
  });

/**
 * Create the error surfaced when a host caller waited on a session that did
 * not become ready.
 *
 * @param workerLabel Human-readable worker label.
 * @param session Host-managed session.
 * @param rejectionError Optional rejection captured from the readiness gate.
 * @returns Readiness failure error.
 */
const createWorkerHostLifecycleReadinessError = (
  workerLabel: string,
  session: WorkerHostLifecycleSessionBase,
  rejectionError?: unknown
): Error =>
  session.failureError ??
  (rejectionError instanceof Error
    ? rejectionError
    : new Error(
        `next-slug-splitter ${workerLabel} session "${session.sessionKey}" did not become ready.`
      ));

/**
 * Register one private readiness gate for a fresh host-managed session.
 *
 * @param session Host-managed session that should own the readiness gate.
 * @returns `void` after the readiness gate has been published.
 */
export const initializeWorkerHostLifecycleSessionReadiness = (
  session: WorkerHostLifecycleSessionBase
): void => {
  workerHostLifecycleSessionReadinessGateStore.initialize(session);
};

/**
 * Wait on the shared readiness gate for one host-managed session.
 *
 * @remarks
 * This is the join point for the async-overlap contract documented above.
 * Compatible callers that encounter the same still-starting session wait here
 * instead of creating another worker for the same session key.
 *
 * @param workerLabel Human-readable worker label.
 * @param session Host-managed session.
 * @returns `void` after the session is ready.
 */
export const waitForWorkerHostLifecycleSessionReady = async (
  workerLabel: string,
  session: WorkerHostLifecycleSessionBase
): Promise<void> => {
  try {
    await workerHostLifecycleSessionReadinessGateStore.wait(session);
  } catch (error) {
    throw createWorkerHostLifecycleReadinessError(
      workerLabel,
      session,
      error
    );
  }

  if (session.phase !== 'ready') {
    throw createWorkerHostLifecycleReadinessError(workerLabel, session);
  }
};

/**
 * Resolve the shared readiness gate when it is still pending.
 *
 * @param session Host-managed session whose readiness gate should resolve.
 * @returns `void` after the readiness gate has been settled when applicable.
 */
export const resolveWorkerHostLifecycleSessionReadiness = (
  session: WorkerHostLifecycleSessionBase
): void => {
  workerHostLifecycleSessionReadinessGateStore.resolve(session);
};

/**
 * Reject the shared readiness gate when it is still pending.
 *
 * @param session Host-managed session whose readiness gate should be rejected.
 * @param error Lifecycle failure to expose to readiness waiters.
 * @returns `void` after the readiness gate has been rejected when applicable.
 */
export const rejectWorkerHostLifecycleSessionReadiness = (
  session: WorkerHostLifecycleSessionBase,
  error: Error
): void => {
  workerHostLifecycleSessionReadinessGateStore.reject(session, error);
};
