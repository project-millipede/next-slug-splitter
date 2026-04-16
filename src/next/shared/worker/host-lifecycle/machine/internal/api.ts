import type { SharedWorkerHostLifecycleSession } from '../../types';

import {
  observeSharedWorkerHostLifecycleMachineSessionTermination,
  resolveSharedWorkerHostLifecycleMachineSession,
  shutdownSharedWorkerHostLifecycleMachineSession
} from './session-operations';
import type { SharedWorkerHostLifecycleMachineContext } from './types';
import type {
  SharedWorkerHostLifecycleMachine
} from '../types';

/**
 * Shared API assembly for the host lifecycle machine.
 *
 * @remarks
 * This module binds the extracted session-operation helpers directly into the
 * public machine methods returned by the factory.
 */
export const createSharedWorkerHostLifecycleMachineApi = <
  TResponse,
  TSession extends SharedWorkerHostLifecycleSession<TResponse>,
  TRequest
>(
  context: SharedWorkerHostLifecycleMachineContext<TResponse, TSession, TRequest>
): SharedWorkerHostLifecycleMachine<TResponse, TSession, TRequest> => ({
  resolveSession: async ({
    workerSessions,
    request
  }): Promise<TSession> =>
    await resolveSharedWorkerHostLifecycleMachineSession({
      context,
      workerSessions,
      request
    }),
  shutdownSession: async ({
    workerSessions,
    session,
    reason
  }): Promise<void> =>
    await shutdownSharedWorkerHostLifecycleMachineSession({
      context,
      workerSessions,
      session,
      reason
    }),
  observeSessionTermination: ({
    workerSessions,
    session,
    rejectionError
  }): void =>
    observeSharedWorkerHostLifecycleMachineSessionTermination({
      context,
      workerSessions,
      session,
      rejectionError
    })
});
