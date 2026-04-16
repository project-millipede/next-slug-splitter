import type { SharedWorkerSessionRegistry } from '../../../host/session-lifecycle';
import type { SharedWorkerHostLifecycleSession } from '../../types';
import {
  forceCloseSharedWorkerHostLifecycleSession
} from '../../session';

import {
  createSharedWorkerHostLifecycleMachineApi
} from './api';
import {
  createSharedWorkerHostLifecycleMachineEventProcessor
} from './event-processor';
import type {
  SharedWorkerHostLifecycleMachineContext,
  SharedWorkerHostLifecycleMachineShutdownContext
} from './types';
import type {
  CreateSharedWorkerHostLifecycleMachineOptions,
  SharedWorkerHostLifecycleMachine
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
const resolveSharedWorkerHostLifecycleMachineContext = <
  TResponse,
  TSession extends SharedWorkerHostLifecycleSession<TResponse>,
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
}: CreateSharedWorkerHostLifecycleMachineOptions<TResponse, TSession, TRequest>): SharedWorkerHostLifecycleMachineContext<
  TResponse,
  TSession,
  TRequest
> => {
  /**
   * Create the default force-close invoker for the normalized shutdown
   * context.
   */
  const invokeForceClose: SharedWorkerHostLifecycleMachineShutdownContext<TSession>['invokeForceClose'] =
    ({ workerSessions, session, reason }): void => {
      if (forceCloseSessionHook != null) {
        forceCloseSessionHook({
          workerSessions,
          session,
          reason
        });
        return;
      }

      forceCloseSharedWorkerHostLifecycleSession({
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
    processEvent:
      createSharedWorkerHostLifecycleMachineEventProcessor<
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
export const createSharedWorkerHostLifecycleMachineInternal = <
  TResponse,
  TSession extends SharedWorkerHostLifecycleSession<TResponse>,
  TRequest
>(
  options: CreateSharedWorkerHostLifecycleMachineOptions<
    TResponse,
    TSession,
    TRequest
  >
): SharedWorkerHostLifecycleMachine<TResponse, TSession, TRequest> => {
  const context =
    resolveSharedWorkerHostLifecycleMachineContext<
      TResponse,
      TSession,
      TRequest
    >(options);

  return createSharedWorkerHostLifecycleMachineApi(context);
};
