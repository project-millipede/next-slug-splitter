import type { WorkerHostLifecycleSession } from '../../types';

import {
  observeWorkerHostLifecycleMachineSessionTermination,
  resolveWorkerHostLifecycleMachineSession,
  shutdownWorkerHostLifecycleMachineSession
} from './session-operations';
import type { WorkerHostLifecycleMachineContext } from './types';
import type { WorkerHostLifecycleMachine } from '../types';

/**
 * Shared API assembly for the host lifecycle machine.
 *
 * @remarks
 * This module binds the extracted session-operation helpers directly into the
 * public machine methods returned by the factory.
 */
export const createWorkerHostLifecycleMachineApi = <
  TResponse,
  TSession extends WorkerHostLifecycleSession<TResponse>,
  TRequest
>(
  context: WorkerHostLifecycleMachineContext<TResponse, TSession, TRequest>
): WorkerHostLifecycleMachine<TResponse, TSession, TRequest> => ({
  resolveSession: async ({ workerSessions, request }): Promise<TSession> =>
    await resolveWorkerHostLifecycleMachineSession({
      context,
      workerSessions,
      request
    }),
  shutdownSession: async ({ workerSessions, session, reason }): Promise<void> =>
    await shutdownWorkerHostLifecycleMachineSession({
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
    observeWorkerHostLifecycleMachineSessionTermination({
      context,
      workerSessions,
      session,
      rejectionError
    })
});
