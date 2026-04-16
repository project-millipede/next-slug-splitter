import {
  finalizeSharedWorkerSession,
  forceCloseSharedWorkerSession,
  type SharedWorkerSession,
  type SharedWorkerSessionRegistry
} from '../host/session-lifecycle';
import type { SharedWorkerDeferredSettler } from '../types';

import type {
  SharedWorkerHostLifecycleSession,
  SharedWorkerHostLifecycleSessionBase
} from './types';

/**
 * Shared low-level session-state helpers for the host lifecycle layer.
 *
 * @remarks
 * This module intentionally stays below the host lifecycle FSM:
 * - create the shared host-managed session shape
 * - settle the shared `readyPromise`
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
 * Deferred readiness state tracked outside the public session shape.
 */
type SharedWorkerHostLifecycleReadyState = SharedWorkerDeferredSettler<void> & {
  /**
   * Whether the readiness promise has already been settled.
   */
  settled: boolean;
};

/**
 * Deferred readiness promise and settlement state for one host-managed
 * session.
 */
type SharedWorkerHostLifecycleDeferredReadyState = {
  /**
   * Shared readiness promise observed by compatible callers.
   */
  readyPromise: Promise<void>;
  /**
   * Deferred settlement state stored in the side WeakMap.
   */
  readyState: SharedWorkerHostLifecycleReadyState;
};

/**
 * Weakly-held readiness state keyed by host-managed worker session.
 */
const sharedWorkerHostLifecycleReadyStates = new WeakMap<
  SharedWorkerHostLifecycleSessionBase,
  SharedWorkerHostLifecycleReadyState
>();

/**
 * Create the shared deferred readiness promise for one host-managed session.
 *
 * @returns Deferred readiness promise and settlement state.
 */
const createSharedWorkerHostLifecycleDeferredReadyState =
  (): SharedWorkerHostLifecycleDeferredReadyState => {
    /**
     * Deferred settlement callbacks captured from the readiness promise.
     *
     * Aspects:
     * 1. `resolveReady` settles the shared readiness promise successfully.
     * 2. `rejectReady` settles the shared readiness promise with one lifecycle
     *    failure.
     */
    let resolveReady: (() => void) | null = null;
    let rejectReady: ((error: Error) => void) | null = null;

    /**
     * Capture the shared readiness promise settlement callbacks so later
     * lifecycle transitions can resolve or reject the same promise from
     * outside this executor.
     *
     * Aspects:
     * 1. `resolve` becomes the deferred success callback.
     * 2. `reject` becomes the deferred failure callback.
     */
    const readyPromise = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });

    /**
     * Validate that the promise executor installed both deferred settlement
     * callbacks before this readiness state is published.
     */
    if (resolveReady == null || rejectReady == null) {
      throw new Error(
        'next-slug-splitter host lifecycle readiness callbacks were not initialized.'
      );
    }

    /**
     * Host lifecycle transitions deliberately reject readiness in these cases:
     * 1. a still-starting session is replaced
     * 2. startup/readiness work fails
     * 3. the session is force-closed before readiness
     *
     * Swallowing the detached rejection branch avoids unhandled-rejection
     * noise when a caller has already moved on to a different session promise.
     */
    readyPromise.catch(() => {});

    return {
      readyPromise,
      readyState: {
        resolve: resolveReady,
        reject: rejectReady,
        settled: false
      }
    };
  };

/**
 * Resolve the shared readiness promise when it is still pending.
 *
 * @template TResponse Successful worker response union carried by the session.
 * @param session Host-managed session whose readiness promise should resolve.
 * @returns `void` after the readiness promise has been settled when
 * applicable.
 */
export const resolveSharedWorkerHostLifecycleSessionReady = (
  session: SharedWorkerHostLifecycleSessionBase
): void => {
  const readyState = sharedWorkerHostLifecycleReadyStates.get(session);

  if (readyState == null) {
    throw new Error(
      'next-slug-splitter host lifecycle session is missing readiness state.'
    );
  }

  if (readyState.settled) {
    return;
  }

  /**
   * Mark the deferred readiness state as settled before invoking the stored
   * resolver so repeated lifecycle transitions cannot resolve it twice.
   */
  readyState.settled = true;
  readyState.resolve();
};

/**
 * Reject the shared readiness promise when it is still pending.
 *
 * @template TResponse Successful worker response union carried by the session.
 * @param input Rejection input.
 * @param input.session Host-managed session whose readiness promise should be
 * rejected.
 * @param input.error Lifecycle failure to expose to readiness waiters.
 * @returns `void` after the readiness promise has been rejected when
 * applicable.
 */
export const rejectSharedWorkerHostLifecycleSessionReady = ({
  session,
  error
}: {
  session: SharedWorkerHostLifecycleSessionBase;
  error: Error;
}): void => {
  const readyState = sharedWorkerHostLifecycleReadyStates.get(session);

  if (readyState == null) {
    throw new Error(
      'next-slug-splitter host lifecycle session is missing readiness state.'
    );
  }

  if (readyState.settled) {
    return;
  }

  /**
   * Mark the deferred readiness state as settled before invoking the stored
   * rejecter so repeated lifecycle transitions cannot reject it twice.
   */
  readyState.settled = true;
  readyState.reject(error);
};

/**
 * Create one host-managed lifecycle session from a low-level base session.
 *
 * @template TResponse Successful worker response union carried by the session.
 * @param session Base session created by the low-level host primitives.
 * @returns Host-managed session extended with lifecycle state.
 */
export const createSharedWorkerHostLifecycleSession = <TResponse>(
  session: SharedWorkerSession<TResponse>
): SharedWorkerHostLifecycleSession<TResponse> => {
  const { readyPromise, readyState } =
    createSharedWorkerHostLifecycleDeferredReadyState();
  const lifecycleSession: SharedWorkerHostLifecycleSession<TResponse> = {
    /**
     * Preserve the low-level shared worker session fields as the base of the
     * host-managed lifecycle session.
     */
    ...session,
    /**
     * New host-managed sessions always begin in the startup phase.
     */
    phase: 'starting',
    /**
     * Shared readiness promise awaited by compatible callers while startup is
     * still in progress.
     */
    readyPromise,
    /**
     * No lifecycle failure has been observed yet for a freshly created
     * session.
     */
    failureError: null
  };

  sharedWorkerHostLifecycleReadyStates.set(lifecycleSession, readyState);

  return lifecycleSession;
};

/**
 * Mark one host-managed session as ready for general work.
 *
 * @template TResponse Successful worker response union carried by the session.
 * @param session Host-managed session.
 * @returns `void` after the phase and readiness promise have been settled.
 */
export const markSharedWorkerHostSessionReady = <TResponse>(
  session: SharedWorkerHostLifecycleSession<TResponse>
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
  resolveSharedWorkerHostLifecycleSessionReady(session);
};

/**
 * Mark one host-managed session as failed.
 *
 * @template TResponse Successful worker response union carried by the session.
 * @param input Failure input.
 * @param input.session Host-managed session.
 * @param input.error Lifecycle failure to record and surface to readiness
 * waiters.
 * @returns `void` after the phase, failure state, and readiness promise have
 * been settled.
 */
export const markSharedWorkerHostSessionFailed = ({
  session,
  error
}: {
  session: SharedWorkerHostLifecycleSessionBase;
  error: Error;
}): void => {
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
  rejectSharedWorkerHostLifecycleSessionReady({
    session,
    error
  });
};

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
export const forceCloseSharedWorkerHostLifecycleSession = <
  TSession extends SharedWorkerHostLifecycleSessionBase
>({
  workerSessions,
  session,
  reason,
  onSessionClose
}: {
  workerSessions: SharedWorkerSessionRegistry<TSession>;
  session: TSession;
  reason: string;
  onSessionClose?: (reason: string) => void;
}): void => {
  rejectSharedWorkerHostLifecycleSessionReady({
    session,
    error:
      session.failureError ??
      new Error(
        `next-slug-splitter worker session "${session.sessionKey}" closed before it became ready (${reason}).`
      )
  });
  forceCloseSharedWorkerSession({
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
export const finalizeSharedWorkerHostLifecycleSession = <
  TResponse,
  TSession extends SharedWorkerHostLifecycleSession<TResponse>
>({
  workerSessions,
  session,
  rejectionError
}: {
  workerSessions: SharedWorkerSessionRegistry<TSession>;
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
    rejectSharedWorkerHostLifecycleSessionReady({
      session,
      error: normalizedError
    });
  }

  /**
   * Finalization is the terminal lifecycle transition. After this point the
   * session is fully closed and cannot be reused.
   */
  session.phase = 'closed';
  finalizeSharedWorkerSession<TResponse, TSession>({
    workerSessions,
    session,
    rejectionError
  });
};
