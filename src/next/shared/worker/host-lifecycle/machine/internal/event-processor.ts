import type { SharedWorkerSessionRegistry } from '../../../host/session-lifecycle';

import {
  dispatchSharedWorkerHostLifecycleEventBySubject,
  type SharedWorkerHostLifecycleEventHandlerMap
} from '../../dispatcher';
import {
  finalizeSharedWorkerHostLifecycleSession,
  markSharedWorkerHostSessionFailed,
  markSharedWorkerHostSessionReady,
  rejectSharedWorkerHostLifecycleSessionReady
} from '../../session';
import type { SharedWorkerHostLifecycleSession } from '../../types';

import { createSharedWorkerHostLifecycleReplacementError } from './error-helpers';
import type {
  SharedWorkerHostLifecycleMachineBoundaryEvent,
  SharedWorkerHostLifecycleMachineDerivedEvent,
  SharedWorkerHostLifecycleMachineEvent,
  SharedWorkerHostLifecycleMachineEventProcessor
} from './types';

/**
 * Typed handler map for boundary-entered host lifecycle events.
 *
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 */
type SharedWorkerHostLifecycleMachineBoundaryHandlerMap<TSession, TRequest> =
  SharedWorkerHostLifecycleEventHandlerMap<
    SharedWorkerHostLifecycleMachineBoundaryEvent<TSession, TRequest>,
    void
  >;

/**
 * Typed handler map for internally derived host lifecycle events.
 *
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 */
type SharedWorkerHostLifecycleMachineDerivedHandlerMap<TSession, TRequest> =
  SharedWorkerHostLifecycleEventHandlerMap<
    SharedWorkerHostLifecycleMachineDerivedEvent<TSession, TRequest>,
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
export const createSharedWorkerHostLifecycleMachineBoundaryEventHandlers = <
  TResponse,
  TSession extends SharedWorkerHostLifecycleSession<TResponse>,
  TRequest
>(
  workerLabel: string,
  workerSessions: SharedWorkerSessionRegistry<TSession>
): SharedWorkerHostLifecycleMachineBoundaryHandlerMap<TSession, TRequest> => ({
  'replacement-requested': async ({ event: nextEvent }): Promise<void> => {
    if (nextEvent.payload.session.phase !== 'starting') {
      return;
    }

    const replacementError = createSharedWorkerHostLifecycleReplacementError(
      workerLabel,
      nextEvent.payload.session,
      nextEvent.payload.reason
    );

    nextEvent.payload.session.failureError = replacementError;
    rejectSharedWorkerHostLifecycleSessionReady({
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
      rejectSharedWorkerHostLifecycleSessionReady({
        session,
        error: rejectionError
      });
    }

    finalizeSharedWorkerHostLifecycleSession<TResponse, TSession>({
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
export const createSharedWorkerHostLifecycleMachineDerivedEventHandlers = <
  TResponse,
  TSession extends SharedWorkerHostLifecycleSession<TResponse>,
  TRequest
>(
  workerLabel: string
): SharedWorkerHostLifecycleMachineDerivedHandlerMap<TSession, TRequest> => ({
  'session-ready': async ({ event: nextEvent }): Promise<void> => {
    markSharedWorkerHostSessionReady(nextEvent.payload.session);
  },
  'session-start-failed': async ({ event: nextEvent }): Promise<void> => {
    markSharedWorkerHostSessionFailed({
      session: nextEvent.payload.session,
      error: nextEvent.payload.error
    });
  },
  'shutdown-failed': async ({ event: nextEvent }): Promise<void> => {
    markSharedWorkerHostSessionFailed({
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

    rejectSharedWorkerHostLifecycleSessionReady({
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
export const createSharedWorkerHostLifecycleMachineEventProcessor = <
  TResponse,
  TSession extends SharedWorkerHostLifecycleSession<TResponse>,
  TRequest
>(
  workerLabel: string
): SharedWorkerHostLifecycleMachineEventProcessor<TSession, TRequest> => {
  return async ({ workerSessions, event }): Promise<void> => {
    const handlers: SharedWorkerHostLifecycleEventHandlerMap<
      SharedWorkerHostLifecycleMachineEvent<TSession, TRequest>,
      void
    > = {
      ...createSharedWorkerHostLifecycleMachineBoundaryEventHandlers<
        TResponse,
        TSession,
        TRequest
      >(workerLabel, workerSessions),
      ...createSharedWorkerHostLifecycleMachineDerivedEventHandlers<
        TResponse,
        TSession,
        TRequest
      >(workerLabel)
    };

    await dispatchSharedWorkerHostLifecycleEventBySubject(event, handlers);
  };
};
