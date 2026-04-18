import {
  dispatchWorkerHostLifecycleEventBySubject,
  type WorkerHostLifecycleEventHandlerMap
} from '../../dispatcher';
import {
  finalizeWorkerHostLifecycleSession,
  markWorkerHostSessionFailed,
  markWorkerHostSessionReady
} from '../../session';
import { rejectWorkerHostLifecycleSessionReadiness } from '../../session-readiness';
import type {
  WorkerHostLifecycleSession,
  WorkerHostLifecycleSessionBase
} from '../../types';

import { createWorkerHostLifecycleReplacementError } from './error-helpers';
import type {
  WorkerHostLifecycleMachineBoundaryEvent,
  WorkerHostLifecycleMachineEventDispatchContext,
  WorkerHostLifecycleMachineDerivedEvent,
  WorkerHostLifecycleMachineEvent,
  WorkerHostLifecycleMachineEventProcessor
} from './types';

/**
 * Shared event-processing helpers for the host lifecycle machine.
 *
 * @remarks
 * This module owns the typed internal event engine for the host lifecycle
 * machine:
 * - build boundary-entered handlers for externally triggered lifecycle events
 * - build derived handlers for internally produced lifecycle transitions
 * - dispatch those events through the shared host-lifecycle dispatcher
 */

/**
 * Typed handler map for boundary-entered host lifecycle events.
 *
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 */
type WorkerHostLifecycleMachineBoundaryHandlerMap<
  TSession extends WorkerHostLifecycleSessionBase,
  TRequest
> = WorkerHostLifecycleEventHandlerMap<
  WorkerHostLifecycleMachineBoundaryEvent<TSession, TRequest>,
  WorkerHostLifecycleMachineEventDispatchContext<TSession>,
  void
>;

/**
 * Typed handler map for internally derived host lifecycle events.
 *
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 */
type WorkerHostLifecycleMachineDerivedHandlerMap<
  TSession extends WorkerHostLifecycleSessionBase,
  TRequest
> = WorkerHostLifecycleEventHandlerMap<
  WorkerHostLifecycleMachineDerivedEvent<TSession, TRequest>,
  WorkerHostLifecycleMachineEventDispatchContext<TSession>,
  void
>;

/**
 * Create the boundary-entered lifecycle-event handlers for one host-machine
 * invocation.
 *
 * @remarks
 * These handlers process real transitions that enter the engine from an
 * outside call chain, even though the subjects themselves remain internal:
 * - public machine commands such as `resolveSession(...)`
 * - external child-process termination callbacks
 *
 * @template TResponse Successful worker response union carried by the session.
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 * @param workerLabel Human-readable worker label used in diagnostics.
 * @returns Typed handler map keyed by lifecycle-event `subject`.
 */
export const createWorkerHostLifecycleMachineBoundaryEventHandlers = <
  TResponse,
  TSession extends WorkerHostLifecycleSession<TResponse>,
  TRequest
>(
  workerLabel: string
): WorkerHostLifecycleMachineBoundaryHandlerMap<TSession, TRequest> => ({
  'replacement-requested': async ({ event: nextEvent }): Promise<void> => {
    /**
     * Replacement only matters while readiness is still pending.
     * Once a session is already `ready`, the surrounding resolution flow shuts
     * it down explicitly instead of using this early-readiness rejection path.
     */
    if (nextEvent.payload.session.phase !== 'starting') {
      return;
    }

    const replacementError = createWorkerHostLifecycleReplacementError(
      workerLabel,
      nextEvent.payload.session,
      nextEvent.payload.reason
    );

    nextEvent.payload.session.failureError = replacementError;
    rejectWorkerHostLifecycleSessionReadiness(
      nextEvent.payload.session,
      replacementError
    );
  },
  'shutdown-requested': async ({ event: nextEvent }): Promise<void> => {
    /**
     * Record the shutdown phase only for still-live sessions.
     * Failed and closed sessions are already terminal for lifecycle purposes.
     */
    if (
      nextEvent.payload.session.phase !== 'failed' &&
      nextEvent.payload.session.phase !== 'closed'
    ) {
      nextEvent.payload.session.phase = 'shutting-down';
    }
  },
  'termination-observed': async ({
    event: nextEvent,
    context
  }): Promise<void> => {
    /**
     * Child-process termination is the final lifecycle boundary:
     * 1. surface the exit error to any still-pending readiness waiters
     * 2. finalize registry ownership and pending request settlement
     */
    const { session, rejectionError } = nextEvent.payload;

    if (
      rejectionError != null &&
      session.phase !== 'shutting-down' &&
      session.phase !== 'failed' &&
      session.phase !== 'closed'
    ) {
      session.phase = 'failed';
      session.failureError = rejectionError;
      rejectWorkerHostLifecycleSessionReadiness(session, rejectionError);
    }

    finalizeWorkerHostLifecycleSession<TResponse, TSession>({
      workerSessions: context.workerSessions,
      session,
      rejectionError
    });
  }
});

/**
 * Create the internally derived lifecycle-event handlers for one host-machine
 * invocation.
 *
 * @remarks
 * These handlers process real transition events that the engine derives while
 * executing the boundary-entered flows:
 * - startup success or failure
 * - shutdown transport failure
 * - forced close
 *
 * @template TResponse Successful worker response union carried by the session.
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 * @param workerLabel Human-readable worker label used in diagnostics.
 * @returns Typed handler map keyed by derived lifecycle-event `subject`.
 */
export const createWorkerHostLifecycleMachineDerivedEventHandlers = <
  TResponse,
  TSession extends WorkerHostLifecycleSession<TResponse>,
  TRequest
>(
  workerLabel: string
): WorkerHostLifecycleMachineDerivedHandlerMap<TSession, TRequest> => ({
  'session-ready': async ({ event: nextEvent }): Promise<void> => {
    markWorkerHostSessionReady(nextEvent.payload.session);
  },
  'session-start-failed': async ({ event: nextEvent }): Promise<void> => {
    markWorkerHostSessionFailed(
      nextEvent.payload.session,
      nextEvent.payload.error
    );
  },
  'shutdown-failed': async ({ event: nextEvent }): Promise<void> => {
    markWorkerHostSessionFailed(
      nextEvent.payload.session,
      nextEvent.payload.error
    );
  },
  'force-close-requested': async ({ event: nextEvent }): Promise<void> => {
    /**
     * Once graceful shutdown is already in progress, the shutdown path owns the
     * remaining teardown steps and this synthetic failure transition should not
     * overwrite that state.
     */
    if (nextEvent.payload.session.phase === 'shutting-down') {
      return;
    }

    const forceCloseError =
      nextEvent.payload.session.failureError ??
      new Error(
        `next-slug-splitter ${workerLabel} session "${nextEvent.payload.session.sessionKey}" was force-closed (${nextEvent.payload.reason}).`
      );

    nextEvent.payload.session.failureError = forceCloseError;

    if (
      nextEvent.payload.session.phase === 'starting' ||
      nextEvent.payload.session.phase === 'ready'
    ) {
      nextEvent.payload.session.phase = 'failed';
    }

    rejectWorkerHostLifecycleSessionReadiness(
      nextEvent.payload.session,
      forceCloseError
    );
  }
});

/**
 * Create the shared internal lifecycle-event processor for one host machine.
 *
 * @template TResponse Successful worker response union carried by the session.
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 * @param workerLabel Human-readable worker label used in diagnostics.
 * @returns Shared event processor that dispatches host lifecycle events by
 * `subject`.
 */
export const createWorkerHostLifecycleMachineEventProcessor = <
  TResponse,
  TSession extends WorkerHostLifecycleSession<TResponse>,
  TRequest
>(
  workerLabel: string
): WorkerHostLifecycleMachineEventProcessor<TSession, TRequest> => {
  /**
   * Build the merged lifecycle handler registry once per machine instance.
   * Only the event and its dynamic dispatch context vary per invocation.
   */
  const handlers: WorkerHostLifecycleEventHandlerMap<
    WorkerHostLifecycleMachineEvent<TSession, TRequest>,
    WorkerHostLifecycleMachineEventDispatchContext<TSession>,
    void
  > = {
    ...createWorkerHostLifecycleMachineBoundaryEventHandlers<
      TResponse,
      TSession,
      TRequest
    >(workerLabel),
    ...createWorkerHostLifecycleMachineDerivedEventHandlers<
      TResponse,
      TSession,
      TRequest
    >(workerLabel)
  };

  return async ({ context, event }): Promise<void> => {
    /**
     * Reuse the stable merged handler registry and supply only the per-dispatch
     * event plus dynamic context.
     */
    await dispatchWorkerHostLifecycleEventBySubject({
      event,
      context,
      handlers
    });
  };
};
