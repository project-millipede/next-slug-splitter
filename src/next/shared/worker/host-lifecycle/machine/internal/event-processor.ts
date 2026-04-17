import type { WorkerSessionRegistry } from '../../../host/session-lifecycle';

import {
  dispatchWorkerHostLifecycleEventBySubject,
  type WorkerHostLifecycleEventHandlerMap
} from '../../dispatcher';
import {
  finalizeWorkerHostLifecycleSession,
  markWorkerHostSessionFailed,
  markWorkerHostSessionReady,
  rejectWorkerHostLifecycleSessionReady
} from '../../session';
import type { WorkerHostLifecycleSession } from '../../types';

import { createWorkerHostLifecycleReplacementError } from './error-helpers';
import type {
  WorkerHostLifecycleMachineBoundaryEvent,
  WorkerHostLifecycleMachineDerivedEvent,
  WorkerHostLifecycleMachineEvent,
  WorkerHostLifecycleMachineEventProcessor
} from './types';

/**
 * Typed handler map for boundary-entered host lifecycle events.
 *
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 */
type WorkerHostLifecycleMachineBoundaryHandlerMap<TSession, TRequest> =
  WorkerHostLifecycleEventHandlerMap<
    WorkerHostLifecycleMachineBoundaryEvent<TSession, TRequest>,
    void
  >;

/**
 * Typed handler map for internally derived host lifecycle events.
 *
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 */
type WorkerHostLifecycleMachineDerivedHandlerMap<TSession, TRequest> =
  WorkerHostLifecycleEventHandlerMap<
    WorkerHostLifecycleMachineDerivedEvent<TSession, TRequest>,
    void
  >;

/**
 * Shared event-processing helpers for the host lifecycle machine.
 *
 * @remarks
 * This module owns the action-style internal host event flow:
 * - build typed lifecycle handlers for each `subject`
 * - dispatch events through the shared host-lifecycle dispatcher
 */

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
 * @param workerSessions Active worker-session registry.
 * @returns Typed handler map keyed by lifecycle-event `subject`.
 */
export const createWorkerHostLifecycleMachineBoundaryEventHandlers = <
  TResponse,
  TSession extends WorkerHostLifecycleSession<TResponse>,
  TRequest
>(
  workerLabel: string,
  workerSessions: WorkerSessionRegistry<TSession>
): WorkerHostLifecycleMachineBoundaryHandlerMap<TSession, TRequest> => ({
  'replacement-requested': async ({ event: nextEvent }): Promise<void> => {
    if (nextEvent.payload.session.phase !== 'starting') {
      return;
    }

    const replacementError = createWorkerHostLifecycleReplacementError(
      workerLabel,
      nextEvent.payload.session,
      nextEvent.payload.reason
    );

    nextEvent.payload.session.failureError = replacementError;
    rejectWorkerHostLifecycleSessionReady({
      session: nextEvent.payload.session,
      error: replacementError
    });
  },
  'shutdown-requested': async ({ event: nextEvent }): Promise<void> => {
    if (
      nextEvent.payload.session.phase !== 'failed' &&
      nextEvent.payload.session.phase !== 'closed'
    ) {
      nextEvent.payload.session.phase = 'shutting-down';
    }
  },
  'termination-observed': async ({ event: nextEvent }): Promise<void> => {
    const { session, rejectionError } = nextEvent.payload;

    if (
      rejectionError != null &&
      session.phase !== 'shutting-down' &&
      session.phase !== 'failed' &&
      session.phase !== 'closed'
    ) {
      session.phase = 'failed';
      session.failureError = rejectionError;
      rejectWorkerHostLifecycleSessionReady({
        session,
        error: rejectionError
      });
    }

    finalizeWorkerHostLifecycleSession<TResponse, TSession>({
      workerSessions,
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
    markWorkerHostSessionFailed({
      session: nextEvent.payload.session,
      error: nextEvent.payload.error
    });
  },
  'shutdown-failed': async ({ event: nextEvent }): Promise<void> => {
    markWorkerHostSessionFailed({
      session: nextEvent.payload.session,
      error: nextEvent.payload.error
    });
  },
  'force-close-requested': async ({ event: nextEvent }): Promise<void> => {
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

    rejectWorkerHostLifecycleSessionReady({
      session: nextEvent.payload.session,
      error: forceCloseError
    });
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
  return async ({ workerSessions, event }): Promise<void> => {
    const handlers: WorkerHostLifecycleEventHandlerMap<
      WorkerHostLifecycleMachineEvent<TSession, TRequest>,
      void
    > = {
      ...createWorkerHostLifecycleMachineBoundaryEventHandlers<
        TResponse,
        TSession,
        TRequest
      >(workerLabel, workerSessions),
      ...createWorkerHostLifecycleMachineDerivedEventHandlers<
        TResponse,
        TSession,
        TRequest
      >(workerLabel)
    };

    await dispatchWorkerHostLifecycleEventBySubject(event, handlers);
  };
};
