import type { WorkerHostLifecycleSession } from '../../types';
import { forceCloseWorkerHostLifecycleSession } from '../../session';

import { createWorkerHostLifecycleMachineApi } from './api';
import { createWorkerHostLifecycleMachineEventProcessor } from './event-processor';
import type {
  WorkerHostLifecycleMachineContext,
  WorkerHostLifecycleMachineShutdownContext
} from './types';
import type {
  CreateWorkerHostLifecycleMachineOptions,
  WorkerHostLifecycleMachine
} from '../types';

/**
 * Resolve the grouped internal machine context from the public worker-family
 * options.
 *
 * @template TResponse Successful worker response union carried by the session.
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 * @param options Public machine-creation options.
 * @returns Fully normalized internal machine context.
 */
const resolveWorkerHostLifecycleMachineContext = <
  TResponse,
  TSession extends WorkerHostLifecycleSession<TResponse>,
  TRequest
>({
  workerLabel,
  session: {
    createSessionKey,
    createSession,
    isSessionReusable = () => 'reuse',
    startSession,
    replaceReason = 'session-replaced'
  },
  shutdown: {
    requestShutdown,
    acknowledgementTimeoutMs,
    terminationTimeoutMs,
    terminationTimeoutErrorMessage,
    forceCloseSession: forceCloseSessionHook
  }
}: CreateWorkerHostLifecycleMachineOptions<
  TResponse,
  TSession,
  TRequest
>): WorkerHostLifecycleMachineContext<TResponse, TSession, TRequest> => {
  /**
   * Create the default force-close invoker for the normalized shutdown
   * context.
   */
  const invokeForceClose: WorkerHostLifecycleMachineShutdownContext<TSession>['invokeForceClose'] =
    ({ workerSessions, session, reason }): void => {
      if (forceCloseSessionHook != null) {
        forceCloseSessionHook({
          workerSessions,
          session,
          reason
        });
        return;
      }

      forceCloseWorkerHostLifecycleSession({
        workerSessions,
        session,
        reason
      });
    };

  return {
    workerLabel,
    session: {
      createSession,
      createSessionKey,
      isSessionReusable,
      replaceReason,
      startSession
    },
    shutdown: {
      acknowledgementTimeoutMs,
      invokeForceClose,
      requestShutdown,
      terminationTimeoutErrorMessage,
      terminationTimeoutMs
    },
    processEvent: createWorkerHostLifecycleMachineEventProcessor<
      TResponse,
      TSession,
      TRequest
    >(workerLabel)
  };
};

/**
 * Create the internal host lifecycle machine implementation.
 *
 * @template TResponse Successful worker response union carried by the session.
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 * @param options Public machine-creation options.
 * @returns Shared host lifecycle machine for one worker family.
 */
export const createWorkerHostLifecycleMachineInternal = <
  TResponse,
  TSession extends WorkerHostLifecycleSession<TResponse>,
  TRequest
>(
  options: CreateWorkerHostLifecycleMachineOptions<
    TResponse,
    TSession,
    TRequest
  >
): WorkerHostLifecycleMachine<TResponse, TSession, TRequest> => {
  const context = resolveWorkerHostLifecycleMachineContext<
    TResponse,
    TSession,
    TRequest
  >(options);

  return createWorkerHostLifecycleMachineApi(context);
};
