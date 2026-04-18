import {
  finalizeWorkerSession,
  forceCloseWorkerSession,
  type WorkerSession,
  type WorkerSessionRegistry
} from '../host/session-lifecycle';

import type {
  WorkerHostLifecycleSession,
  WorkerHostLifecycleSessionBase
} from './types';
import {
  initializeWorkerHostLifecycleSessionReadiness,
  rejectWorkerHostLifecycleSessionReadiness,
  resolveWorkerHostLifecycleSessionReadiness
} from './session-readiness';

/**
 * Shared low-level session-state helpers for the host lifecycle layer.
 *
 * @remarks
 * This module intentionally stays below the host lifecycle FSM:
 * - create the shared host-managed session shape
 * - initialize and settle the shared readiness boundary
 * - mark `ready` and `failed` phase transitions
 * - bridge low-level force-close/finalization helpers onto lifecycle state
 *
 * Higher-level orchestration such as:
 * - reuse vs replace
 * - graceful shutdown
 * - replacement of still-starting sessions
 * - failure sequencing
 *
 * belongs in the host lifecycle machine layer under `./machine/`.
 */

/**
 * Create one worker-family-specific host-managed session from a low-level base
 * session.
 *
 * @template TResponse Successful worker response union carried by the session.
 * @template TSession Concrete worker-family session shape layered onto the
 * shared lifecycle session fields.
 * @param baseSession Base session created by the low-level host primitives.
 * @param extendSession Worker-family builder that returns the final session
 * object which should own the private readiness registration.
 * @returns Host-managed session built from the shared lifecycle fields and the
 * worker-family-specific fields.
 */
export const createCustomWorkerHostLifecycleSession = <
  TResponse,
  TSession extends WorkerHostLifecycleSession<TResponse>
>(
  baseSession: WorkerSession<TResponse>,
  extendSession: (
    lifecycleSession: WorkerHostLifecycleSession<TResponse>
  ) => TSession
): TSession => {
  const lifecycleSession: WorkerHostLifecycleSession<TResponse> = {
    /**
     * Preserve the low-level shared worker session fields as the base of the
     * host-managed lifecycle session.
     */
    ...baseSession,
    /**
     * New host-managed sessions always begin in the startup phase.
     */
    phase: 'starting',
    /**
     * No lifecycle failure has been observed yet for a freshly created
     * session.
     */
    failureError: null
  };
  /**
   * Let the worker family decide whether the plain lifecycle session is already
   * final or whether the final tracked session object should also include
   * worker-family-specific fields.
   */
  const customizedSession = extendSession(lifecycleSession);

  initializeWorkerHostLifecycleSessionReadiness(customizedSession);

  return customizedSession;
};

/**
 * Mark one host-managed session as ready for general work.
 *
 * @template TResponse Successful worker response union carried by the session.
 * @param session Host-managed session.
 * @returns `void` after the phase and readiness boundary have been settled.
 */
export const markWorkerHostSessionReady = <TResponse>(
  session: WorkerHostLifecycleSession<TResponse>
): void => {
  /**
   * Promote the session into the externally observable ready phase.
   */
  session.phase = 'ready';
  /**
   * Clear any stale lifecycle failure because the session successfully became
   * ready for normal work.
   */
  session.failureError = null;
  resolveWorkerHostLifecycleSessionReadiness(session);
};

/**
 * Mark one host-managed session as failed.
 *
 * @template TResponse Successful worker response union carried by the session.
 * @param session Host-managed session.
 * @param error Lifecycle failure to record and surface to readiness waiters.
 * @returns `void` after the phase, failure state, and readiness boundary have
 * been settled.
 */
export const markWorkerHostSessionFailed = (
  session: WorkerHostLifecycleSessionBase,
  error: Error
): void => {
  /**
   * Record that the session can no longer complete startup or continue normal
   * lifecycle work.
   */
  session.phase = 'failed';
  /**
   * Preserve the lifecycle failure that should be surfaced to readiness
   * waiters and later shutdown/finalization logic.
   */
  session.failureError = error;
  rejectWorkerHostLifecycleSessionReadiness(session, error);
};

/**
 * Create one host-managed lifecycle session from a low-level base session.
 *
 * @template TResponse Successful worker response union carried by the session.
 * @param baseSession Base session created by the low-level host primitives.
 * @returns Host-managed session extended with lifecycle state.
 */
export const createWorkerHostLifecycleSession = <TResponse>(
  baseSession: WorkerSession<TResponse>
): WorkerHostLifecycleSession<TResponse> =>
  createCustomWorkerHostLifecycleSession(
    baseSession,
    // The plain shared lifecycle constructor does not add any worker-family
    // fields, so the lifecycle session itself is already the final session.
    lifecycleSession => lifecycleSession
  );

/**
 * Force-close one host-managed worker session immediately.
 *
 * @template TSession Concrete host-managed session shape.
 * @param input Force-close input.
 * @param input.workerSessions Active session registry.
 * @param input.session Session being force-closed.
 * @param input.reason Diagnostic close reason.
 * @param input.onSessionClose Optional worker-family close hook.
 * @returns `void` after the low-level session has been killed.
 */
export const forceCloseWorkerHostLifecycleSession = <
  TSession extends WorkerHostLifecycleSessionBase
>({
  workerSessions,
  session,
  reason,
  onSessionClose
}: {
  workerSessions: WorkerSessionRegistry<TSession>;
  session: TSession;
  reason: string;
  onSessionClose?: (reason: string) => void;
}): void => {
  rejectWorkerHostLifecycleSessionReadiness(
    session,
    session.failureError ??
      new Error(
        `next-slug-splitter worker session "${session.sessionKey}" closed before it became ready (${reason}).`
      )
  );
  forceCloseWorkerSession({
    workerSessions,
    session,
    reason,
    onSessionClose
  });
};

/**
 * Finalize one host-managed worker session after process termination.
 *
 * Aspects of `TResponse` in this helper:
 * - this helper still needs the real `pendingRequests` map shape so it can
 *   finalize the session honestly
 * - it does not read or forward any successful response value from those
 *   stored pending requests
 * - `TResponse` remains in the signature so the session keeps its honest
 *   stored request shape
 *
 * @template TResponse Successful worker response union carried by the session.
 * @template TSession Concrete host-managed session shape.
 * @param input Finalization input.
 * @param input.workerSessions Active session registry.
 * @param input.session Session being finalized.
 * @param input.rejectionError Optional process-exit error surfaced to pending
 * callers.
 * @returns `void` after the low-level termination state has been settled.
 */
export const finalizeWorkerHostLifecycleSession = <
  TResponse,
  TSession extends WorkerHostLifecycleSession<TResponse>
>({
  workerSessions,
  session,
  rejectionError
}: {
  workerSessions: WorkerSessionRegistry<TSession>;
  session: TSession;
  rejectionError?: Error;
}): void => {
  if (rejectionError != null) {
    let normalizedError: Error;

    if (rejectionError instanceof Error) {
      normalizedError = rejectionError;
    } else {
      normalizedError = new Error(
        `next-slug-splitter worker session "${session.sessionKey}" failed during finalization.`
      );
    }

    /**
     * Preserve the first finalization-time failure that should still be
     * visible after the session fully closes.
     */
    session.failureError ??= normalizedError;
    rejectWorkerHostLifecycleSessionReadiness(session, normalizedError);
  }

  /**
   * Finalization is the terminal lifecycle transition. After this point the
   * session is fully closed and cannot be reused.
   */
  session.phase = 'closed';
  finalizeWorkerSession<TResponse, TSession>({
    workerSessions,
    session,
    rejectionError
  });
};
