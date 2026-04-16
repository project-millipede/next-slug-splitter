import type { SharedWorkerHostLifecycleSession } from '../types';

import {
  createSharedWorkerHostLifecycleMachineInternal
} from './internal/create-machine';
import type {
  CreateSharedWorkerHostLifecycleMachineOptions,
  SharedWorkerHostLifecycleMachine,
} from './types';

/**
 * Shared host-lifecycle finite-state-machine assembly.
 *
 * @remarks
 * This folder is intentionally split by contract:
 * - `types.ts` holds the public worker-family contract
 * - `index.ts` is the public machine entrypoint
 * - `internal/` holds the subject-driven engine implementation
 *
 * This entrypoint stays intentionally thin so worker-family consumers do not
 * depend on the internal transition engine directly.
 */

export type {
  CreateSharedWorkerHostLifecycleMachineOptions,
  SharedWorkerHostLifecycleMachine,
  SharedWorkerHostLifecycleMachineSessionOptions,
  SharedWorkerHostLifecycleMachineShutdownOptions,
  SharedWorkerHostLifecycleReuseDecision
} from './types';

/**
 * Create one shared host lifecycle finite state machine.
 *
 * @template TResponse Successful worker response union carried by the session.
 * @template TSession Concrete host-managed session shape.
 * @template TRequest Worker-family session-resolution input.
 * @param options Machine-creation options.
 * @returns Shared host lifecycle machine for one worker family.
 */
export const createSharedWorkerHostLifecycleMachine = <
  TResponse,
  TSession extends SharedWorkerHostLifecycleSession<TResponse>,
  TRequest
>(
  options: CreateSharedWorkerHostLifecycleMachineOptions<
    TResponse,
    TSession,
    TRequest
  >
): SharedWorkerHostLifecycleMachine<
  TResponse,
  TSession,
  TRequest
> =>
  createSharedWorkerHostLifecycleMachineInternal<
    TResponse,
    TSession,
    TRequest
  >(options);
